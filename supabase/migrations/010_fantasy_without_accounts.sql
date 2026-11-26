-- ============================================================
-- MIGRATION 010 — Fantasy without accounts
--
-- Anyone can build a fantasy team without a Google account.
-- Supabase anonymous sign-in gives them a real auth.uid(), so every
-- existing ownership rule (RLS, transfers, ownership windows) keeps
-- working untouched. What is new:
--
--   * fantasy_teams carries the manager's name, so scoring and the
--     league table key on the TEAM, never on whoever currently owns it.
--     Ownership can move between devices without resetting anything.
--   * fantasy_team_secrets holds the email and the edit token in a
--     separate table behind an owner-or-captain RLS policy, so the
--     public read on fantasy_teams can never leak them.
--   * create_fantasy_team() and claim_fantasy_team() are the only two
--     ways in, both security definer.
--   * anonymous accounts are walled out of media and comments, and kept
--     off the captains' approval queue.
--
-- Safe to run twice.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Helpers
-- ------------------------------------------------------------

-- 64 hex characters, two independent v4 UUIDs' worth of randomness.
-- Built-in gen_random_uuid() only, so this needs no extension.
create or replace function new_edit_token()
returns text language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');
$$;

-- Is the caller signed in anonymously? Supabase puts the flag in the JWT.
create or replace function is_anon_user()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

-- ------------------------------------------------------------
-- 2. Profiles learn about anonymous accounts
--    Without this, every guest manager lands in the captains'
--    approval queue, which is not what that queue is for.
-- ------------------------------------------------------------

alter table profiles add column if not exists is_anonymous boolean not null default false;

comment on column profiles.is_anonymous is
  'True for Supabase anonymous sign-ins (guest fantasy managers). They never appear in the approval queue and can never post media or comment.';

update profiles p
   set is_anonymous = true
  from auth.users u
 where u.id = p.id and u.is_anonymous and not p.is_anonymous;

-- Carry the flag through on sign-up. Anonymous users have no email and no
-- name metadata, so display_name starts null; create_fantasy_team() fills
-- it in with the manager name they type.
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, role, is_approved, is_anonymous)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), new.email),
    'viewer',
    false,
    coalesce(new.is_anonymous, false)
  );
  return new;
end; $$;

-- ------------------------------------------------------------
-- 3. Guest managers get fantasy and nothing else
--    Anonymous accounts are never approved, so these were already
--    closed. Stating it explicitly means an accidental approval
--    can't hand a guest media or comment rights.
-- ------------------------------------------------------------

drop policy if exists "approved users submit media" on media;
create policy "approved users submit media" on media
  for insert with check (is_approved() and not is_anon_user() and submitted_by = auth.uid());

drop policy if exists "comment on lineups" on lineup_comments;
create policy "comment on lineups" on lineup_comments
  for insert with check (is_approved() and not is_anon_user() and author_id = auth.uid());

-- ------------------------------------------------------------
-- 4. The team remembers its own manager
--    fantasy_standings used to read the manager's name off the owner's
--    profile. Claiming a team moves owner_id, so the name would follow
--    whoever held the edit link last. It lives on the team now.
-- ------------------------------------------------------------

alter table fantasy_teams add column if not exists manager_name text;

comment on column fantasy_teams.manager_name is
  'Who runs this team. Stored on the team, not read off the owner profile, so ownership can move between devices without the league table changing.';

-- split_part strips anything after an @: a profile with no name falls back
-- to the account's email address, and that must never land on a public page.
update fantasy_teams ft
   set manager_name = split_part(pr.display_name, '@', 1)
  from profiles pr
 where pr.id = ft.owner_id
   and ft.manager_name is null
   and nullif(trim(pr.display_name), '') is not null;

-- ------------------------------------------------------------
-- 5. Email and edit token, out of public reach
--    A separate table so the protection is row level: "the row is
--    yours" is something RLS can actually enforce, unlike "this column
--    is yours". fantasy_teams stays publicly readable as it is today.
-- ------------------------------------------------------------

create table if not exists fantasy_team_secrets (
  fantasy_team_id uuid primary key references fantasy_teams(id) on delete cascade,
  email           text,
  edit_token      text not null default new_edit_token(),
  created_at      timestamptz not null default now()
);

comment on table fantasy_team_secrets is
  'Private half of a fantasy team. Never publicly readable: only the current owner and captains can select a row.';

-- One team per person, case-insensitively. Partial so the backfill below
-- can leave email null for a team whose owner never had one.
create unique index if not exists fantasy_team_secrets_email_uniq
  on fantasy_team_secrets (lower(email)) where email is not null;

create unique index if not exists fantasy_team_secrets_token_uniq
  on fantasy_team_secrets (edit_token);

alter table fantasy_team_secrets enable row level security;

-- anon needs select too: a guest manager reading back their own edit link
-- is an anonymous session. RLS below is what decides which row they see.
grant select, insert, update, delete on fantasy_team_secrets to anon, authenticated;

drop policy if exists "owner reads own secrets" on fantasy_team_secrets;
create policy "owner reads own secrets" on fantasy_team_secrets
  for select using (
    is_admin() or exists (
      select 1 from fantasy_teams ft
       where ft.id = fantasy_team_id and ft.owner_id = auth.uid())
  );

-- Rows are written by create_fantasy_team(), which is security definer.
-- Captains can fix an address by hand; nobody else writes here at all.
drop policy if exists "admin writes secrets" on fantasy_team_secrets;
create policy "admin writes secrets" on fantasy_team_secrets
  for all using (is_admin()) with check (is_admin());

-- Backfill every existing team: real email off auth.users where there is
-- one (Google and magic-link owners both have one), a fresh token for all.
insert into fantasy_team_secrets (fantasy_team_id, email, edit_token)
select ft.id, nullif(u.email, ''), new_edit_token()
  from fantasy_teams ft
  left join auth.users u on u.id = ft.owner_id
 where not exists (
   select 1 from fantasy_team_secrets s where s.fantasy_team_id = ft.id)
on conflict do nothing;

-- ------------------------------------------------------------
-- 6. The public shape of a team
--    Everything the leaderboard and the read-only team page need,
--    and not one column more.
-- ------------------------------------------------------------

create or replace view fantasy_teams_public as
select id, season_id, owner_id, name, manager_name, formation, is_locked, created_at
  from fantasy_teams;

do $$
begin
  execute 'alter view fantasy_teams_public set (security_invoker = on)';
exception when others then
  null;   -- pre-PG15, views already run as the invoker's RLS here
end $$;

grant select on fantasy_teams_public to anon, authenticated;

-- ------------------------------------------------------------
-- 7. Creating a team
--    One call, one transaction. A duplicate email has to fail the team
--    row too, otherwise a clash leaves a nameless squad behind.
-- ------------------------------------------------------------

create or replace function create_fantasy_team(
  p_manager_name text,
  p_team_name    text,
  p_email        text,
  p_formation    text default '4-4-2'
) returns json
language plpgsql security definer set search_path = public as $$
declare
  v_uid    uuid   := auth.uid();
  v_season uuid;
  v_email  text   := lower(nullif(trim(p_email), ''));
  v_team   uuid;
  v_token  text;
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

  -- Each insert catches its own clash, so a race on one is never
  -- reported as the other.
  begin
    insert into fantasy_teams (season_id, owner_id, name, manager_name, formation)
    values (v_season, v_uid, trim(p_team_name), trim(p_manager_name),
            coalesce(nullif(trim(p_formation), ''), '4-4-2'))
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

  -- Anonymous sign-ups arrive with no name at all. Give the header and
  -- the admin screens something to show.
  update profiles
     set display_name = trim(p_manager_name)
   where id = v_uid and nullif(trim(display_name), '') is null;

  return json_build_object('team_id', v_team, 'edit_token', v_token);
end $$;

revoke all on function create_fantasy_team(text, text, text, text) from public;
grant execute on function create_fantasy_team(text, text, text, text) to anon, authenticated;

-- ------------------------------------------------------------
-- 8. Claiming a team from an edit link
--
--    This MOVES ownership to whoever opens the link: the browser that
--    held the team before loses edit access until it claims again.
--    That is the deal the edit link makes, and it is what lets someone
--    pick up their team on a new phone, or a Google account adopt a
--    team that started out anonymous. The link is the only key, so it
--    is 256 bits of randomness and never travels in a public query.
-- ------------------------------------------------------------

create or replace function claim_fantasy_team(p_token text)
returns fantasy_teams
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid := auth.uid();
  v_id   uuid;
  v_team fantasy_teams;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = 'BPE03';
  end if;

  select fantasy_team_id into v_id
    from fantasy_team_secrets
   where edit_token = nullif(trim(p_token), '');

  if v_id is null then
    raise exception 'That edit link is not valid.' using errcode = 'BPT01';
  end if;

  select * into v_team from fantasy_teams where id = v_id;

  if v_team.owner_id = v_uid then
    return v_team;                    -- already yours, nothing to do
  end if;

  if exists (select 1 from fantasy_teams o
              where o.season_id = v_team.season_id
                and o.owner_id  = v_uid
                and o.id <> v_team.id) then
    raise exception 'This browser already runs another team this season.'
      using errcode = 'BPE02';
  end if;

  update fantasy_teams set owner_id = v_uid
   where id = v_team.id
   returning * into v_team;

  return v_team;
end $$;

revoke all on function claim_fantasy_team(text) from public;
grant execute on function claim_fantasy_team(text) to anon, authenticated;

-- ------------------------------------------------------------
-- 9. Fantasy RLS, restated
--    Everyone reads every team and every squad. Only the owner writes.
-- ------------------------------------------------------------

drop policy if exists "public read" on fantasy_teams;
create policy "public read" on fantasy_teams for select using (true);

drop policy if exists "public read" on fantasy_picks;
create policy "public read" on fantasy_picks for select using (true);

drop policy if exists "public read" on fantasy_transfers;
create policy "public read" on fantasy_transfers for select using (true);

-- Owner-only writes. Split out of the old "for all" so that select is
-- governed by the public read policy alone and nothing here can narrow it.
drop policy if exists "manage own fantasy team" on fantasy_teams;
drop policy if exists "create own fantasy team" on fantasy_teams;
drop policy if exists "update own fantasy team" on fantasy_teams;
drop policy if exists "delete own fantasy team" on fantasy_teams;

create policy "create own fantasy team" on fantasy_teams
  for insert with check (owner_id = auth.uid());
create policy "update own fantasy team" on fantasy_teams
  for update using (owner_id = auth.uid() or is_admin())
  with check (owner_id = auth.uid() or is_admin());
create policy "delete own fantasy team" on fantasy_teams
  for delete using (owner_id = auth.uid() or is_admin());

-- ------------------------------------------------------------
-- 10. League table: keyed on the team, with a gameweek column
-- ------------------------------------------------------------

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
-- The most recently played fixture of each season is "the gameweek".
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
  -- The team's own manager name wins. Older teams that predate the column
  -- still fall back to the owner's profile until a captain fills one in.
  -- split_part is a no-op on a normal name and strips the domain off a
  -- display_name that is really an email address. Nothing public shows one.
  split_part(coalesce(nullif(trim(ft.manager_name), ''), pr.display_name,
                      'Guest manager'), '@', 1)               as owner_name,
  (select count(*) from fantasy_picks fp
    where fp.fantasy_team_id = ft.id and fp.released_at is null)::int as squad_size,
  coalesce(e.pts, 0)                        as points_earned,
  coalesce(c.pts, 0)                        as transfer_cost,
  coalesce(n.n, 0)                          as transfers_made,
  (coalesce(e.pts, 0) - coalesce(c.pts, 0))::int as total_points,
  coalesce(g.pts, 0)                        as gameweek_points
from fantasy_teams ft
-- LEFT, so a team never drops off the table because its owner row moved.
left join profiles pr on pr.id = ft.owner_id
left join earned   e on e.fantasy_team_id = ft.id
left join gameweek g on g.fantasy_team_id = ft.id
left join costs    c on c.fantasy_team_id = ft.id
left join counts   n on n.fantasy_team_id = ft.id
order by total_points desc;

grant select on fantasy_standings to anon, authenticated;
