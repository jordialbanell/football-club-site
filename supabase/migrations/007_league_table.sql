-- ============================================================
-- MIGRATION 007 — Manually maintained league table
-- The EFL site has no API, so captains keep this in sync by hand.
-- Safe to run twice.
-- ============================================================

create table if not exists league_table (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid references seasons(id) on delete cascade,
  team          text not null,
  played        int not null default 0,
  won           int not null default 0,
  drawn         int not null default 0,
  lost          int not null default 0,
  goals_for     int not null default 0,
  goals_against int not null default 0,
  points        int not null default 0,
  sort_order    int not null default 0,
  updated_at    timestamptz not null default now()
);

create index if not exists league_table_season_idx on league_table (season_id, sort_order);

alter table league_table enable row level security;

drop policy if exists "public read" on league_table;
create policy "public read" on league_table for select using (true);

drop policy if exists "admin write" on league_table;
create policy "admin write" on league_table
  for all using (is_admin()) with check (is_admin());

-- When the table was last brought in line with the EFL site
insert into settings (key, value) values ('league_table_updated', '')
on conflict (key) do nothing;
