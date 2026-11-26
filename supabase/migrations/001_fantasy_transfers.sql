-- ============================================================
-- MIGRATION 001 — Fantasy transfers
--
-- ONLY run this if you already ran the ORIGINAL schema.sql
-- before transfers existed. On a fresh database just run the
-- current schema.sql instead, it already includes all of this.
--
-- Safe to run twice.
-- ============================================================

-- ---------- Transfer settings on the season ----------
alter table seasons add column if not exists free_transfers int not null default 2;
alter table seasons add column if not exists transfer_cost  int not null default 4;

-- ---------- fantasy_picks becomes an ownership window ----------
alter table fantasy_picks add column if not exists id uuid default gen_random_uuid();
alter table fantasy_picks add column if not exists acquired_at timestamptz not null default now();
alter table fantasy_picks add column if not exists released_at timestamptz;

do $$
begin
  -- Swap the composite primary key for a surrogate one so a player
  -- can be signed, sold and re-signed by the same team.
  if exists (
    select 1 from pg_constraint
    where conname = 'fantasy_picks_pkey' and contype = 'p'
  ) then
    alter table fantasy_picks drop constraint fantasy_picks_pkey;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'fantasy_picks'::regclass and contype = 'p'
  ) then
    alter table fantasy_picks alter column id set not null;
    alter table fantasy_picks add primary key (id);
  end if;
end $$;

create index if not exists fantasy_picks_team_idx on fantasy_picks (fantasy_team_id);
create unique index if not exists fantasy_picks_active_uniq
  on fantasy_picks (fantasy_team_id, player_id) where released_at is null;

-- Backdate existing squads to the season start so nobody loses points
update fantasy_picks fp
  set acquired_at = s.starts_on::timestamptz
from fantasy_teams ft
join seasons s on s.id = ft.season_id
where fp.fantasy_team_id = ft.id
  and fp.acquired_at > s.starts_on::timestamptz;

-- ---------- Transfer log ----------
create table if not exists fantasy_transfers (
  id              uuid primary key default gen_random_uuid(),
  fantasy_team_id uuid not null references fantasy_teams(id) on delete cascade,
  out_player_id   uuid references players(id) on delete set null,
  in_player_id    uuid references players(id) on delete set null,
  points_cost     int  not null default 0,
  created_at      timestamptz not null default now()
);

create index if not exists fantasy_transfers_team_idx on fantasy_transfers (fantasy_team_id);

alter table fantasy_transfers enable row level security;

drop policy if exists "public read" on fantasy_transfers;
create policy "public read" on fantasy_transfers for select using (true);

drop policy if exists "log own transfers" on fantasy_transfers;
create policy "log own transfers" on fantasy_transfers
  for insert with check (
    exists (select 1 from fantasy_teams ft where ft.id = fantasy_team_id
            and (ft.owner_id = auth.uid() or is_admin()) and not ft.is_locked)
  );

drop policy if exists "admin fix transfers" on fantasy_transfers;
create policy "admin fix transfers" on fantasy_transfers
  for delete using (is_admin());

-- ---------- New / replaced views ----------
create or replace view fantasy_player_fixture_points as
select
  f.id         as fixture_id,
  f.season_id,
  f.kickoff_at,
  p.id         as player_id,
  (
      (case when a.player_id is not null then 2 else 0 end)
    + coalesce(sum(me.qty) filter (where me.type = 'goal'), 0)
        * (case when p.position in ('DEF','GK') then 7 else 5 end)
    + coalesce(sum(me.qty) filter (where me.type = 'assist'), 0) * 3
    + coalesce(sum(me.qty) filter (where me.type = 'clean_sheet'), 0)
        * (case when p.position in ('DEF','GK') then 4 else 0 end)
    + coalesce(sum(me.qty) filter (where me.type = 'motm'), 0) * 3
    - coalesce(sum(me.qty) filter (where me.type = 'yellow'), 0) * 1
    - coalesce(sum(me.qty) filter (where me.type = 'red'), 0) * 3
    - coalesce(sum(me.qty) filter (where me.type = 'own_goal'), 0) * 2
  )::int as points
from fixtures f
join players p on true
left join appearances a  on a.fixture_id  = f.id and a.player_id  = p.id
left join match_events me on me.fixture_id = f.id and me.player_id = p.id
where f.status = 'played'
group by f.id, f.season_id, f.kickoff_at, p.id, p.position, a.player_id
having a.player_id is not null or count(me.id) > 0;

drop view if exists fantasy_standings;
create view fantasy_standings as
with earned as (
  select
    ft.id as fantasy_team_id,
    coalesce(sum(fpp.points), 0)::int as pts
  from fantasy_teams ft
  left join fantasy_picks fp on fp.fantasy_team_id = ft.id
  left join fantasy_player_fixture_points fpp
         on fpp.player_id  = fp.player_id
        and fpp.season_id  = ft.season_id
        and fpp.kickoff_at >= fp.acquired_at
        and (fp.released_at is null or fpp.kickoff_at < fp.released_at)
  group by ft.id
),
costs as (
  select fantasy_team_id, coalesce(sum(points_cost), 0)::int as pts
  from fantasy_transfers group by fantasy_team_id
),
counts as (
  select fantasy_team_id, count(*)::int as n
  from fantasy_transfers group by fantasy_team_id
)
select
  ft.id            as fantasy_team_id,
  ft.season_id,
  ft.name          as team_name,
  pr.display_name  as owner_name,
  (select count(*) from fantasy_picks fp
    where fp.fantasy_team_id = ft.id and fp.released_at is null)::int as squad_size,
  coalesce(e.pts, 0)                             as points_earned,
  coalesce(c.pts, 0)                             as transfer_cost,
  coalesce(n.n, 0)                               as transfers_made,
  (coalesce(e.pts, 0) - coalesce(c.pts, 0))::int as total_points
from fantasy_teams ft
join profiles pr on pr.id = ft.owner_id
left join earned e on e.fantasy_team_id = ft.id
left join costs  c on c.fantasy_team_id = ft.id
left join counts n on n.fantasy_team_id = ft.id
order by total_points desc;
