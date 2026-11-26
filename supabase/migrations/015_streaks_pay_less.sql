-- ============================================================
-- MIGRATION 015: Streaks pay less
--
-- 014 paid +1, +2, +3... for every match in a row, uncapped. Six in a
-- row was worth 21, more than most players score from football. New rule:
--
--   matches 1 and 2 of a run   nothing
--   match 3 onwards            +2 a match
--   every 10th in a row        +5 instead of +2 (10th, 20th...)
--
-- So six in a row is worth 8, and an ever-present 20-match season 42.
-- Turning up still means being on the result sheet, subs included, and
-- friendlies still neither add to a run nor break it.
--
-- fantasy_player_fixture_points keeps its columns and gains one at the
-- end, streak_run (how many in a row he was on at that match).
-- streak_points is now the bonus paid, not the run length. Retroactive:
-- every match already played is rescored the moment this runs.
--
-- RE-RUNNABLE FROM THE TOP.
-- ============================================================

-- The rule in one place. The site mirrors it in Fantasy.streakBonus.
create or replace function fantasy_streak_bonus(run int)
returns int language sql immutable as $$
  select case
    when run < 3        then 0
    when run % 10 = 0   then 5
    else 2
  end;
$$;

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
       (b.points + fantasy_streak_bonus(coalesce(s.streak, 0)))::int as points,
       fantasy_streak_bonus(coalesce(s.streak, 0))::int             as streak_points,
       coalesce(s.streak, 0)::int                                   as streak_run
  from base b
  left join streaks s on s.fixture_id = b.fixture_id and s.player_id = b.player_id;

grant select on fantasy_player_fixture_points to anon, authenticated;
