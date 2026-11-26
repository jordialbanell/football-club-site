-- ============================================================
-- MIGRATION 005 — Competition types
-- League counts for the table. Cup counts too. Friendly counts
-- for nothing, and pays half fantasy points.
-- ============================================================

update fixtures set competition = 'League'
 where competition is null or competition not in ('League','Cup','Friendly');

alter table fixtures drop constraint if exists fixtures_competition_check;
alter table fixtures add constraint fixtures_competition_check
  check (competition in ('League','Cup','Friendly'));

alter table fixtures alter column competition set default 'League';
alter table fixtures alter column competition set not null;

-- ── Per-fixture fantasy points, now halved for friendlies ──
create or replace view fantasy_player_fixture_points as
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
having a.player_id is not null or count(me.id) > 0;

-- ── Season totals now SUM the per-fixture view, so friendly
--    halving and the hat-trick bonus can never disagree ──
create or replace view fantasy_player_points as
with ev as (
  select f.season_id, me.player_id, me.type, sum(me.qty) as n
  from match_events me join fixtures f on f.id = me.fixture_id
  where f.status='played' group by 1,2,3),
apps as (
  select f.season_id, a.player_id, count(*)::int as n
  from appearances a join fixtures f on f.id = a.fixture_id
  where f.status='played' group by 1,2),
fpts as (
  select season_id, player_id, sum(points)::int as n
  from fantasy_player_fixture_points group by 1,2),
ht as (
  select season_id, player_id, count(*)::int as n from (
    select f.season_id, me.player_id, me.fixture_id
    from match_events me join fixtures f on f.id = me.fixture_id
    where f.status='played' and me.type='goal'
    group by f.season_id, me.player_id, me.fixture_id
    having sum(me.qty) >= 3) x
  group by 1,2)
select p.id as player_id, p.name, p.squad_num, p.position, s.id as season_id,
  coalesce(apps.n,0) as appearances,
  coalesce(sum(ev.n) filter (where ev.type='goal'),0)::int        as goals,
  coalesce(sum(ev.n) filter (where ev.type='assist'),0)::int      as assists,
  coalesce(sum(ev.n) filter (where ev.type='yellow'),0)::int      as yellows,
  coalesce(sum(ev.n) filter (where ev.type='red'),0)::int         as reds,
  coalesce(sum(ev.n) filter (where ev.type='motm'),0)::int        as motm,
  coalesce(sum(ev.n) filter (where ev.type='clean_sheet'),0)::int as clean_sheets,
  coalesce(sum(ev.n) filter (where ev.type='own_goal'),0)::int    as own_goals,
  coalesce(ht.n,0)   as hat_tricks,
  coalesce(fpts.n,0) as fantasy_points
from players p cross join seasons s
left join apps on apps.player_id=p.id and apps.season_id=s.id
left join fpts on fpts.player_id=p.id and fpts.season_id=s.id
left join ht   on ht.player_id=p.id   and ht.season_id=s.id
left join ev   on ev.player_id=p.id   and ev.season_id=s.id
group by p.id,p.name,p.squad_num,p.position,s.id,apps.n,ht.n,fpts.n;

-- ── Competitive record only: friendlies excluded ──
create or replace view season_record as
select
  season_id,
  count(*)::int                                                  as played,
  count(*) filter (where our_score > their_score)::int            as won,
  count(*) filter (where our_score = their_score)::int            as drawn,
  count(*) filter (where our_score < their_score)::int            as lost,
  coalesce(sum(our_score),0)::int                                 as goals_for,
  coalesce(sum(their_score),0)::int                               as goals_against,
  (count(*) filter (where our_score > their_score) * 3
   + count(*) filter (where our_score = their_score))::int        as points
from fixtures
where status = 'played' and our_score is not null
  and competition <> 'Friendly'
group by season_id;

create or replace view head_to_head as
select opponent,
  count(*)::int as played,
  count(*) filter (where our_score > their_score)::int as won,
  count(*) filter (where our_score = their_score)::int as drawn,
  count(*) filter (where our_score < their_score)::int as lost,
  coalesce(sum(our_score),0)::int   as goals_for,
  coalesce(sum(their_score),0)::int as goals_against
from fixtures
where status='played' and our_score is not null and competition <> 'Friendly'
group by opponent order by played desc;
