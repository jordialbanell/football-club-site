-- ============================================================
-- MIGRATION 013 — Catch-up points for late joiners
--
-- Someone who signs up three matches into the season cannot catch a
-- team that has been scoring since week one, and a league nobody can
-- win is a league nobody plays. A team created after the relaunch gets
-- a one-off credit so it starts within reach.
--
-- The credit is a share of what the ESTABLISHED teams have averaged,
-- never of the players the new manager picks. That distinction is the
-- whole design: crediting their own picks would pay them for hindsight,
-- letting them look up who has scored and be rewarded twice.
--
-- It decays with every competitive fixture played since the relaunch,
-- so the longer you leave it the less you get:
--     0 fixtures played -> 50%,  1 -> 25%,  2 or more -> nothing.
-- Friendlies are not fixtures for this purpose, the same way they are
-- not fixtures for the record or the form guide.
--
-- The credit is computed in create_fantasy_team, which is security
-- definer, so a client cannot ask for one and cannot choose its size.
--
-- RE-RUNNABLE FROM THE TOP. Every statement is either "if not exists",
-- "or replace", "on conflict do nothing", or a drop-then-create, so a
-- half-applied run can simply be run again.
--
-- The views are dropped and recreated rather than replaced: this
-- migration inserts catch_up_points BEFORE created_at, and
-- "create or replace view" can only append columns at the end
-- (42P16: cannot change name of view column created_at to
-- catch_up_points). Column order is worth keeping tidy here because
-- schema.sql, the fresh-install file, spells it the same way.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Nothing may be standing on the views we are about to drop
--    Both are leaves today. If that ever stops being true this stops
--    the migration with the names, rather than a cascade quietly
--    taking something down with it.
-- ------------------------------------------------------------

do $$
declare
  v_dependents text;
begin
  select string_agg(distinct dependent.relname, ', ')
    into v_dependents
    from pg_depend d
    join pg_rewrite r       on r.oid = d.objid
    join pg_class dependent on dependent.oid = r.ev_class
    join pg_class source    on source.oid = d.refobjid
   where d.classid    = 'pg_rewrite'::regclass
     and d.refclassid = 'pg_class'::regclass
     and source.relnamespace = 'public'::regnamespace
     and source.relname in ('fantasy_teams_public', 'fantasy_standings')
     and dependent.relname <> source.relname;

  if v_dependents is not null then
    raise exception
      'Drop these first, they depend on the views this migration rebuilds: %',
      v_dependents;
  end if;
end $$;

-- ------------------------------------------------------------
-- 1. Where the rule lives
--    One row. The RPC and the browser both read it, so the offer shown
--    on the sign-up screen and the credit actually granted cannot drift
--    apart, which is the kind of difference people notice immediately.
-- ------------------------------------------------------------

create table if not exists fantasy_settings (
  id             smallint primary key default 1 check (id = 1),
  relaunch_date  date    not null default date '2026-09-21',
  catch_up_tiers numeric[] not null default array[0.5, 0.25, 0],
  updated_at     timestamptz not null default now()
);

comment on table fantasy_settings is
  'One row. The catch-up rule, read by create_fantasy_team and by the site, so the offer shown and the credit granted always agree.';
comment on column fantasy_settings.catch_up_tiers is
  'Share of the established teams'' average, indexed by how many competitive fixtures have been played since relaunch_date. The last entry applies to that many fixtures or more.';

-- The seed, not an overwrite: a re-run must never reset a rule an admin
-- has since edited.
insert into fantasy_settings (id) values (1) on conflict (id) do nothing;

alter table fantasy_settings enable row level security;
grant select on fantasy_settings to anon, authenticated;

drop policy if exists "public read" on fantasy_settings;
create policy "public read" on fantasy_settings for select using (true);

drop policy if exists "admin write" on fantasy_settings;
create policy "admin write" on fantasy_settings
  for all using (is_admin()) with check (is_admin());

-- ------------------------------------------------------------
-- 2. The credit itself, stored on the team
--    Stored, not recomputed: it is granted once, at sign-up, and must
--    not move afterwards. A team that joined when the credit was 50%
--    keeps what it was given.
-- ------------------------------------------------------------

alter table fantasy_teams
  add column if not exists catch_up_points integer not null default 0;

comment on column fantasy_teams.catch_up_points is
  'One-off credit granted at sign-up for joining after the relaunch. Fixed at the moment the team was created; never recalculated.';

-- ------------------------------------------------------------
-- 3. The credit reaches the league table
--    total_points includes it. gameweek_points does not: that column
--    answers "what did your XI do last Sunday", and a joining bonus
--    did not happen last Sunday.
--
--    Rebuilt before the functions below, so that fantasy_catch_up_credit
--    is parsed against the view it is actually going to read.
-- ------------------------------------------------------------

drop view if exists fantasy_teams_public;

create view fantasy_teams_public as
select id, season_id, owner_id, name, manager_name, formation, is_locked,
       catch_up_points, created_at
  from fantasy_teams;

do $$
begin
  execute 'alter view fantasy_teams_public set (security_invoker = on)';
exception when others then
  null;   -- pre-PG15, views already run as the invoker's RLS here
end $$;

-- A drop takes the grants with it, so they are re-issued every run.
grant select on fantasy_teams_public to anon, authenticated;

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
-- The most recently played fixture of a season is "the gameweek".
last_fixture as (
  select distinct on (season_id) season_id, fixture_id, kickoff_at
  from fantasy_player_fixture_points
  order by season_id, kickoff_at desc
),
gameweek as (
  select
    ft.id as fantasy_team_id,
    coalesce(sum(fpp.points), 0)::int as pts
  from fantasy_teams ft
  left join last_fixture lf on lf.season_id = ft.season_id
  left join fantasy_picks fp on fp.fantasy_team_id = ft.id
  left join fantasy_player_fixture_points fpp
         on fpp.fixture_id = lf.fixture_id
        and fpp.player_id  = fp.player_id
        and fpp.kickoff_at >= fp.acquired_at
        and (fp.released_at is null or fpp.kickoff_at < fp.released_at)
  group by ft.id
),
costs as (
  select fantasy_team_id, coalesce(sum(points_cost), 0)::int as pts
  from fantasy_transfers
  group by fantasy_team_id
),
counts as (
  select fantasy_team_id, count(*)::int as n
  from fantasy_transfers
  group by fantasy_team_id
)
select
  ft.id            as fantasy_team_id,
  ft.season_id,
  ft.name          as team_name,
  -- split_part is a no-op on a normal name and strips the domain off a
  -- display_name that is really an email address. Nothing public shows one.
  split_part(coalesce(nullif(trim(ft.manager_name), ''), pr.display_name,
                      'Guest manager'), '@', 1)               as owner_name,
  (select count(*) from fantasy_picks fp
    where fp.fantasy_team_id = ft.id and fp.released_at is null)::int as squad_size,
  coalesce(e.pts, 0)                        as points_earned,
  coalesce(c.pts, 0)                        as transfer_cost,
  coalesce(n.n, 0)                          as transfers_made,
  ft.catch_up_points                        as catch_up_points,
  (coalesce(e.pts, 0) - coalesce(c.pts, 0) + ft.catch_up_points)::int as total_points,
  -- Deliberately excludes the credit: this is last Sunday's scoring.
  coalesce(g.pts, 0)                        as gameweek_points
from fantasy_teams ft
-- LEFT, so a team never drops off the table because ownership moved.
left join profiles pr on pr.id = ft.owner_id
left join earned   e on e.fantasy_team_id = ft.id
left join gameweek g on g.fantasy_team_id = ft.id
left join costs    c on c.fantasy_team_id = ft.id
left join counts   n on n.fantasy_team_id = ft.id
order by total_points desc;

grant select on fantasy_standings to anon, authenticated;

-- ------------------------------------------------------------
-- 4. How big the credit is right now
-- ------------------------------------------------------------

-- Which tier applies today, as a share.
create or replace function fantasy_catch_up_rate()
returns numeric
language sql stable security definer set search_path = public as $$
  select s.catch_up_tiers[
           least(
             (select count(*)::int from fixtures f
               where f.status = 'played'
                 and f.our_score is not null
                 and f.competition <> 'Friendly'
                 and f.kickoff_at >= s.relaunch_date
                 and f.kickoff_at <= now()) + 1,
             array_length(s.catch_up_tiers, 1))]
    from fantasy_settings s
   where s.id = 1;
$$;

-- What a team signing up right now would be credited, in whole points.
--
-- The baseline averages points_earned minus transfer_cost rather than
-- total_points. Numerically the same thing for the established teams,
-- which carry no credit, but it can never feed on itself: if it read
-- total_points, tomorrow's baseline would include today's credits and
-- the numbers would climb on their own.
create or replace function fantasy_catch_up_credit(p_season uuid)
returns integer
language sql stable security definer set search_path = public as $$
  select coalesce(
    round(
      (select avg(fs.points_earned - fs.transfer_cost)
         from fantasy_standings fs
         join fantasy_teams ft on ft.id = fs.fantasy_team_id
        where ft.season_id = p_season
          and ft.created_at < (select relaunch_date from fantasy_settings where id = 1))
      * fantasy_catch_up_rate()
    ), 0)::integer;
$$;

revoke all on function fantasy_catch_up_rate() from public;
revoke all on function fantasy_catch_up_credit(uuid) from public;
grant execute on function fantasy_catch_up_rate() to anon, authenticated;
grant execute on function fantasy_catch_up_credit(uuid) to anon, authenticated;

-- ------------------------------------------------------------
-- 5. Granting it at sign-up
--    Only change from 010/011: the credit is worked out here and
--    written with the team, so the client never names a number.
-- ------------------------------------------------------------

create or replace function create_fantasy_team(
  p_manager_name text,
  p_team_name    text,
  p_email        text,
  p_formation    text default '4-4-2'
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid := auth.uid();
  v_season uuid;
  v_email  text := lower(nullif(trim(p_email), ''));
  v_team   uuid;
  v_token  text;
  v_credit integer := 0;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = 'BPE03';
  end if;

  if nullif(trim(p_manager_name), '') is null then
    raise exception 'Enter your name.' using errcode = 'BPE04';
  end if;
  if nullif(trim(p_team_name), '') is null then
    raise exception 'Give your team a name.' using errcode = 'BPE04';
  end if;
  if v_email is null or position('@' in v_email) < 2 then
    raise exception 'Enter a valid email.' using errcode = 'BPE04';
  end if;

  select id into v_season from seasons where is_active limit 1;
  if v_season is null then
    raise exception 'No season is running yet.' using errcode = 'BPE05';
  end if;

  if exists (select 1 from fantasy_team_secrets where lower(email) = v_email) then
    raise exception 'That email already has a team.' using errcode = 'BPE01';
  end if;

  if exists (select 1 from fantasy_teams
              where season_id = v_season and owner_id = v_uid) then
    raise exception 'You already have a team this season.' using errcode = 'BPE02';
  end if;

  -- Worked out here, before the insert, so this team is not in its own
  -- baseline and the client has no say in the number.
  v_credit := fantasy_catch_up_credit(v_season);

  begin
    insert into fantasy_teams (season_id, owner_id, name, manager_name, formation,
                               catch_up_points)
    values (v_season, v_uid, trim(p_team_name), trim(p_manager_name),
            coalesce(nullif(trim(p_formation), ''), '4-4-2'), v_credit)
    returning id into v_team;
  exception when unique_violation then
    raise exception 'You already have a team this season.' using errcode = 'BPE02';
  end;

  begin
    insert into fantasy_team_secrets (fantasy_team_id, email, edit_token)
    values (v_team, v_email, new_edit_token())
    returning edit_token into v_token;
  exception when unique_violation then
    raise exception 'That email already has a team.' using errcode = 'BPE01';
  end;

  update profiles
     set display_name = trim(p_manager_name)
   where id = v_uid and nullif(trim(display_name), '') is null;

  return json_build_object(
    'team_id', v_team,
    'edit_token', v_token,
    'catch_up_points', v_credit
  );
end $$;

revoke all on function create_fantasy_team(text, text, text, text) from public;
grant execute on function create_fantasy_team(text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 6. Backfill
--    Last, because it leans on everything above: the column, the view
--    the credit is averaged from, and both functions.
--
--    The teams that signed up on relaunch day, before this existed,
--    get what they would have been given. Teams from before the
--    relaunch get nothing and keep the default 0.
--
--    Guarded on catch_up_points = 0 so it only ever fills a gap: the
--    credit is granted once, and re-running this after a fixture has
--    been played must not quietly reduce what somebody already has.
-- ------------------------------------------------------------

update fantasy_teams ft
   set catch_up_points = fantasy_catch_up_credit(ft.season_id)
 where ft.created_at >= (select relaunch_date from fantasy_settings where id = 1)
   and ft.catch_up_points = 0;
