-- ============================================================
-- MIGRATION 014: Turn-up streaks, and scores per match
--
-- 1. STREAKS. A player earns a bonus for turning up to matches in a
--    row: +1 for the first, +2 for the second, +3 for the third, and
--    so on, uncapped. Miss one and the next appearance starts at +1.
--
--      "Turned up" = listed on the result sheet (appearances), which
--      is starters, subs and anyone else the captains tick. Not just
--      the starting XI.
--      Counted from the first match of the season. Retroactive: every
--      match already played is rescored the moment this runs.
--      Friendlies are invisible to it. They add nothing and missing
--      one does not break a run, the same way they are not fixtures
--      for the record or the catch-up rule.
--
--    The bonus is part of fantasy_player_fixture_points.points, so it
--    flows through everything that already sums that view: player
--    totals, the Players tab, the leaderboard, gameweek points and
--    ownership windows (you only bank a streak point for a match the
--    player was yours for). It is also exposed on its own as
--    streak_points so the site can say where a number came from.
--
-- 2. MATCH SCORES. fantasy_team_fixture_points: one row per team per
--    played fixture the team existed for, so the leaderboard can rank
--    a single match and a team page can break its season down match
--    by match.
--
--      A transfer hit (the points_cost on fantasy_transfers) is
--      charged to the first match played AFTER the transfer. A hit
--      taken since the last match has no row yet; it is already in the
--      season total and lands on the next match once that is played.
--      Catch-up credit is never in a match score. It was not earned in
--      a match. It stays in the season total only.
--
-- RE-RUNNABLE FROM THE TOP. "create or replace" throughout. The view
-- change only appends a column (streak_points) after the existing
-- ones, which "create or replace view" allows, so nothing that depends
-- on it has to be dropped.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Per-player, per-fixture points, now with the streak bonus
--    The scoring block in "base" is unchanged from schema.sql.
-- ------------------------------------------------------------

create or replace view fantasy_player_fixture_points as
with comp as (
  -- Competitive fixtures of each season, numbered in the order played.
  select f.id, f.season_id,
         row_number() over (partition by f.season_id order by f.kickoff_at, f.id) as n
    from fixtures f
   where f.status = 'played'
     and f.competition <> 'Friendly'
),
runs as (
  -- Gaps and islands: consecutive appearances share the same run_id,
  -- because n and the player's own appearance count rise together
  -- until he misses one.
  select a.player_id, c.id as fixture_id, c.season_id, c.n,
         c.n - row_number() over (partition by a.player_id, c.season_id order by c.n) as run_id
    from appearances a
    join comp c on c.id = a.fixture_id
),
streaks as (
  select player_id, fixture_id,
         row_number() over (partition by player_id, season_id, run_id order by n)::int as streak
    from runs
),
base as (
  select f.id as fixture_id, f.season_id, f.kickoff_at, f.competition, p.id as player_id,
    round((
        (case when a.player_id is not null then 2 else 0 end)
      + coalesce(sum(me.qty) filter (where me.type='goal'),0)
          * (case p.position when 'GK' then 20 when 'DEF' then 7 when 'MID' then 5 else 4 end)
      + coalesce(sum(me.qty) filter (where me.type='assist'),0)
          * (case p.position when 'GK' then  8 when 'DEF' then 5 when 'MID' then 4 else 2 end)
      + coalesce(sum(me.qty) filter (where me.type='clean_sheet'),0)
          * (case p.position when 'GK' then  4 when 'DEF' then 4 when 'MID' then 2 else 1 end)
      + coalesce(sum(me.qty) filter (where me.type='motm'),0)*3
      + (case when coalesce(sum(me.qty) filter (where me.type='goal'),0) >= 3 then 3 else 0 end)
      - coalesce(sum(me.qty) filter (where me.type='yellow'),0)*2
      - coalesce(sum(me.qty) filter (where me.type='red'),0)*8
      - coalesce(sum(me.qty) filter (where me.type='own_goal'),0)*2
    ) * (case when f.competition = 'Friendly' then 0.5 else 1 end))::int as points
  from fixtures f join players p on true
  left join appearances a   on a.fixture_id=f.id  and a.player_id=p.id
  left join match_events me on me.fixture_id=f.id and me.player_id=p.id
  where f.status='played'
  group by f.id, f.season_id, f.kickoff_at, f.competition, p.id, p.position, a.player_id
  having a.player_id is not null or count(me.id) > 0
)
select b.fixture_id, b.season_id, b.kickoff_at, b.competition, b.player_id,
       (b.points + coalesce(s.streak, 0))::int as points,
       coalesce(s.streak, 0)::int               as streak_points
  from base b
  left join streaks s on s.fixture_id = b.fixture_id and s.player_id = b.player_id;

grant select on fantasy_player_fixture_points to anon, authenticated;

-- ------------------------------------------------------------
-- 2. Per-team, per-fixture points
-- ------------------------------------------------------------

create or replace view fantasy_team_fixture_points as
with played as (
  select f.id as fixture_id, f.season_id, f.kickoff_at, f.competition
    from fixtures f
   where f.status = 'played' and f.season_id is not null
),
earned as (
  -- Same ownership-window rule as fantasy_standings, one fixture at a time.
  select fp.fantasy_team_id, fpp.fixture_id,
         sum(fpp.points)::int        as pts,
         sum(fpp.streak_points)::int as streak
    from fantasy_picks fp
    join fantasy_teams ft on ft.id = fp.fantasy_team_id
    join fantasy_player_fixture_points fpp
      on fpp.player_id  = fp.player_id
     and fpp.season_id  = ft.season_id
     and fpp.kickoff_at >= fp.acquired_at
     and (fp.released_at is null or fpp.kickoff_at < fp.released_at)
   group by fp.fantasy_team_id, fpp.fixture_id
),
hits as (
  -- Each costly transfer lands on the first match played after it.
  select t.fantasy_team_id,
         (select p.fixture_id from played p
           where p.season_id = ft.season_id and p.kickoff_at > t.created_at
           order by p.kickoff_at, p.fixture_id limit 1) as fixture_id,
         t.points_cost
    from fantasy_transfers t
    join fantasy_teams ft on ft.id = t.fantasy_team_id
   where t.points_cost <> 0
),
hit_sum as (
  select fantasy_team_id, fixture_id, sum(points_cost)::int as pts
    from hits where fixture_id is not null
   group by fantasy_team_id, fixture_id
)
select ft.id        as fantasy_team_id,
       ft.season_id,
       p.fixture_id,
       p.kickoff_at,
       p.competition,
       coalesce(e.pts, 0)                         as points_earned,
       coalesce(e.streak, 0)                      as streak_points,
       coalesce(h.pts, 0)                         as transfer_cost,
       (coalesce(e.pts, 0) - coalesce(h.pts, 0))::int as points
  from fantasy_teams ft
  join played p on p.season_id = ft.season_id
  left join earned  e on e.fantasy_team_id = ft.id and e.fixture_id = p.fixture_id
  left join hit_sum h on h.fantasy_team_id = ft.id and h.fixture_id = p.fixture_id
 -- A team only has a score for matches played after it was created.
 where ft.created_at <= p.kickoff_at;

grant select on fantasy_team_fixture_points to anon, authenticated;
