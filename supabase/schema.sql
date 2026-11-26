-- ============================================================
-- RIVERSIDE FC — Database schema
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor > New query)
-- ============================================================

-- ---------- ENUMS ----------
create type player_position as enum ('GK','DEF','MID','ATT');
create type fixture_status  as enum ('upcoming','played','cancelled','postponed');
create type home_away       as enum ('home','away','neutral');
create type avail_status    as enum ('in','out','maybe');
create type event_type      as enum ('goal','assist','own_goal','yellow','red','motm','clean_sheet');
create type media_type      as enum ('image','video');
create type user_role       as enum ('admin','player','viewer');

-- ---------- SEASONS ----------
create table seasons (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,                 -- e.g. "2026 EFL Season"
  starts_on       date not null,
  ends_on         date not null,
  is_active       boolean not null default false,
  -- Fantasy transfer settings, editable without a deploy
  free_transfers  int not null default 2,        -- free swaps per manager per season
  transfer_cost   int not null default 4,        -- points deducted per transfer after that
  created_at      timestamptz not null default now()
);

-- Only one active season at a time
create unique index one_active_season on seasons (is_active) where is_active;

-- ---------- PLAYERS ----------
create table players (
  id          uuid primary key default gen_random_uuid(),
  squad_num   int  not null,
  name        text not null,
  nickname    text,
  position    player_position not null default 'MID',
  photo_url   text,
  is_active   boolean not null default true,  -- false = left the club
  joined_on   date default current_date,
  created_at  timestamptz not null default now()
);

create unique index players_squad_num_uniq on players (squad_num) where is_active;

-- ---------- PROFILES (links auth.users to a player + role) ----------
create table profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  player_id    uuid references players(id) on delete set null,
  display_name text,
  role         user_role not null default 'viewer',
  is_approved  boolean not null default false,   -- a captain must approve new sign-ups
  -- True for Supabase anonymous sign-ins (guest fantasy managers). They stay
  -- off the approval queue and can never post media or comment.
  is_anonymous boolean not null default false,
  created_at   timestamptz not null default now()
);

-- Auto-create a profile row whenever someone signs up
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

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Helper: is the current user an admin (captain)?
create or replace function is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;

-- Helper: has a captain approved the current user?
create or replace function is_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_approved);
$$;

-- Helper: is the caller signed in anonymously? Supabase puts it in the JWT.
create or replace function is_anon_user()
returns boolean language sql stable as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false);
$$;

-- Helper: a 64-character edit token. Two v4 UUIDs' worth of randomness,
-- using only the built-in generator so this needs no extension.
create or replace function new_edit_token()
returns text language sql volatile as $$
  select replace(gen_random_uuid()::text, '-', '')
      || replace(gen_random_uuid()::text, '-', '');
$$;

-- Helper: which player is the current user?
create or replace function my_player_id()
returns uuid language sql stable security definer set search_path = public as $$
  select player_id from profiles where id = auth.uid();
$$;

-- ---------- SETTINGS (club-wide key/value: home page photo etc) ----------
create table settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

insert into settings (key, value) values ('hero_image', '');
-- When the league table was last brought in line with the EFL site
insert into settings (key, value) values ('league_table_updated', '');

-- ---------- VENUES ----------
create table venues (
  id        uuid primary key default gen_random_uuid(),
  name      text not null,
  address   text,
  notes     text,          -- e.g. "access pitch from 57-71 Park Dr"
  map_url   text,
  is_home   boolean not null default false
);

-- ---------- FIXTURES ----------
create table fixtures (
  id            uuid primary key default gen_random_uuid(),
  season_id     uuid references seasons(id) on delete set null,
  opponent      text not null,
  kickoff_at    timestamptz not null,
  venue_id      uuid references venues(id) on delete set null,
  venue_name    text,        -- free-text ground name for away games
  venue_address text,        -- free-text address, linked to Google Maps
  home_away     home_away not null default 'home',
  competition   text not null default 'League'
                  check (competition in ('League','Cup','Friendly')),
  status        fixture_status not null default 'upcoming',
  our_score     int,
  their_score   int,
  external_url  text,       -- link back to the EFL league site
  created_at    timestamptz not null default now()
);

create index fixtures_kickoff_idx on fixtures (kickoff_at desc);

-- ---------- AVAILABILITY ----------
create table availability (
  id          uuid primary key default gen_random_uuid(),
  fixture_id  uuid not null references fixtures(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  status      avail_status not null,
  note        text,
  updated_at  timestamptz not null default now(),
  unique (fixture_id, player_id)
);

-- ---------- LINEUPS ----------
create table lineups (
  id            uuid primary key default gen_random_uuid(),
  fixture_id    uuid not null references fixtures(id) on delete cascade,
  formation     text not null default '4-4-2',
  jersey_color  text not null default '#c8102e',
  is_published  boolean not null default false,
  created_by    uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index lineups_fixture_idx on lineups (fixture_id);

-- One slot per position on the pitch
create table lineup_slots (
  id             uuid primary key default gen_random_uuid(),
  lineup_id      uuid not null references lineups(id) on delete cascade,
  slot_index     int  not null,          -- 0..10
  slot_label     text not null,          -- 'GK','RCB','LM'...
  player_id      uuid references players(id) on delete set null,
  x              numeric(5,2) not null,  -- % position on pitch
  y              numeric(5,2) not null,
  sub_player_id  uuid references players(id) on delete set null, -- who plays here after the sub
  unique (lineup_id, slot_index)
);

-- Captains discussing the lineup
create table lineup_comments (
  id          uuid primary key default gen_random_uuid(),
  lineup_id   uuid not null references lineups(id) on delete cascade,
  author_id   uuid references profiles(id) on delete set null,
  body        text not null,
  created_at  timestamptz not null default now()
);

-- ---------- MATCH EVENTS (drives all stats + fantasy) ----------
create table match_events (
  id          uuid primary key default gen_random_uuid(),
  fixture_id  uuid not null references fixtures(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  type        event_type not null,
  qty         int not null default 1,   -- e.g. qty=2 for a brace, saves a row
  created_at  timestamptz not null default now()
);

create index match_events_fixture_idx on match_events (fixture_id);
create index match_events_player_idx  on match_events (player_id);

-- Who actually played (drives appearances)
create table appearances (
  fixture_id  uuid not null references fixtures(id) on delete cascade,
  player_id   uuid not null references players(id) on delete cascade,
  started     boolean not null default true,
  primary key (fixture_id, player_id)
);

-- ---------- MEDIA ----------
create table media (
  id          uuid primary key default gen_random_uuid(),
  fixture_id  uuid references fixtures(id) on delete set null,
  type        media_type not null,
  url         text not null,          -- storage public URL, or YouTube/Insta embed URL
  caption     text,
  uploaded_by uuid references profiles(id) on delete set null,
  submitted_by uuid references profiles(id) on delete set null,
  is_approved boolean not null default false,   -- hidden until a captain publishes it
  created_at  timestamptz not null default now()
);

-- ---------- MATCH REPORTS ----------
create table match_reports (
  id            uuid primary key default gen_random_uuid(),
  fixture_id    uuid not null references fixtures(id) on delete cascade unique,
  title         text,
  body          text not null,        -- markdown
  is_published  boolean not null default false,
  author_id     uuid references profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------- LEAGUE TABLE ----------
-- The EFL site has no API, so captains keep this in sync by hand.
create table league_table (
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

create index league_table_season_idx on league_table (season_id, sort_order);

-- ---------- FANTASY ----------
create table fantasy_teams (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid not null references seasons(id) on delete cascade,
  owner_id    uuid not null references profiles(id) on delete cascade,
  name        text not null,
  -- Who runs this team. Stored here, not read off the owner's profile, so
  -- ownership can move between devices (see claim_fantasy_team) without
  -- the league table changing under anyone.
  manager_name text,
  formation   text not null default '4-4-2',
  is_locked   boolean not null default false,
  -- One-off credit for joining after the relaunch, fixed at sign-up and
  -- never recalculated: a team credited at 50% keeps what it was given.
  catch_up_points integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (season_id, owner_id)
);

-- The catch-up rule. One row, read by create_fantasy_team AND by the site,
-- so the offer shown on the sign-up screen and the credit actually granted
-- can never drift apart.
create table fantasy_settings (
  id             smallint primary key default 1 check (id = 1),
  relaunch_date  date      not null default date '2026-09-21',
  -- Share of the established teams' average, indexed by competitive
  -- fixtures played since relaunch_date. Last entry applies to that many
  -- or more: 0 fixtures -> 50%, 1 -> 25%, 2+ -> nothing.
  catch_up_tiers numeric[] not null default array[0.5, 0.25, 0],
  updated_at     timestamptz not null default now()
);

insert into fantasy_settings (id) values (1);

-- The private half of a team: the email that makes it one team per person,
-- and the edit token that is the only way back in from another browser.
-- A separate table, because "this row is yours" is something row level
-- security can enforce and "this column is yours" is not. fantasy_teams
-- itself stays publicly readable.
create table fantasy_team_secrets (
  fantasy_team_id uuid primary key references fantasy_teams(id) on delete cascade,
  email           text,
  edit_token      text not null default new_edit_token(),
  created_at      timestamptz not null default now()
);

-- One team per email, case-insensitively. Partial, so a team whose owner
-- never had an address can sit here with a null.
create unique index fantasy_team_secrets_email_uniq
  on fantasy_team_secrets (lower(email)) where email is not null;
create unique index fantasy_team_secrets_token_uniq
  on fantasy_team_secrets (edit_token);

-- A pick is an OWNERSHIP WINDOW, not a permanent row.
-- You only score a player's points for fixtures inside your window.
-- Transfer a player out and released_at is stamped; their later points stop counting.
-- Re-sign them later and you get a second row with a fresh window.
create table fantasy_picks (
  id              uuid primary key default gen_random_uuid(),
  fantasy_team_id uuid not null references fantasy_teams(id) on delete cascade,
  player_id       uuid not null references players(id) on delete cascade,
  slot_index      int,          -- which pitch position this pick fills (0-10)
  acquired_at     timestamptz not null default now(),
  released_at     timestamptz
);

create index fantasy_picks_team_idx on fantasy_picks (fantasy_team_id);
-- A player can only be in a squad once at any given moment
create unique index fantasy_picks_active_uniq
  on fantasy_picks (fantasy_team_id, player_id) where released_at is null;

-- Every transfer is logged with what it cost
create table fantasy_transfers (
  id              uuid primary key default gen_random_uuid(),
  fantasy_team_id uuid not null references fantasy_teams(id) on delete cascade,
  out_player_id   uuid references players(id) on delete set null,
  in_player_id    uuid references players(id) on delete set null,
  points_cost     int  not null default 0,
  created_at      timestamptz not null default now()
);

create index fantasy_transfers_team_idx on fantasy_transfers (fantasy_team_id);

-- Scoring rules, editable without a code deploy
create table fantasy_rules (
  id          uuid primary key default gen_random_uuid(),
  season_id   uuid references seasons(id) on delete cascade,
  event       text not null,          -- 'appearance','goal','goal_def','assist','clean_sheet','yellow','red','motm','own_goal'
  points      int  not null,
  unique (season_id, event)
);

-- ============================================================
-- VIEWS: stats + fantasy scoring
-- ============================================================

-- Points a player earned in ONE fixture. This is what makes transfers work:
-- a fantasy team only banks the fixtures that fall inside its ownership window.
--
-- Scoring is position based and mirrors FANTASY_RULES in public/js/config.js.
-- Change them together. The hat-trick bonus is computed here from goals in the
-- fixture, it is not a stored event type. Friendlies pay half.
--
-- Plus a turn-up streak (014, reworked in 015): +2 a match from the 3rd league
-- or cup match in a row on the result sheet, +5 on every 10th, reset by a
-- missed one. Friendlies neither add to a run nor break it. The bonus is also
-- exposed as streak_points, and the run length as streak_run.
--
-- Defined before the season view below, which sums this one, so the league
-- table and the leaderboard can never disagree.
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

-- Points earned by each player, per season.
-- Raw counts are aggregated straight from the events. The fantasy total SUMS the
-- per-fixture view above, so friendly halving and the hat-trick bonus can never
-- disagree between the league table and the leaderboard.
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

-- The public shape of a fantasy team. Everything the leaderboard and the
-- read-only team page need, and not one column more: email and edit token
-- live in fantasy_team_secrets and never appear here.
create or replace view fantasy_teams_public as
select id, season_id, owner_id, name, manager_name, formation, is_locked,
       catch_up_points, created_at
  from fantasy_teams;

alter view fantasy_teams_public set (security_invoker = on);

-- Fantasy league table.
-- Points earned inside ownership windows, minus what transfers cost.
-- Everything keys on the TEAM, never on whoever owns it right now, so
-- claiming a team on a new phone changes nothing here.
create or replace view fantasy_standings as
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
  -- Deliberately excludes the credit: this column answers "what did your
  -- XI do last Sunday", and a joining bonus did not happen last Sunday.
  coalesce(g.pts, 0)                        as gameweek_points
from fantasy_teams ft
-- LEFT, so a team never drops off the table because ownership moved.
left join profiles pr on pr.id = ft.owner_id
left join earned   e on e.fantasy_team_id = ft.id
left join gameweek g on g.fantasy_team_id = ft.id
left join costs    c on c.fantasy_team_id = ft.id
left join counts   n on n.fantasy_team_id = ft.id
order by total_points desc;

-- One row per team per played fixture it existed for (014). A transfer hit
-- lands on the first match played after it; catch-up credit is never in a
-- match score.
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

-- ============================================================
-- FANTASY SIGN-UP AND CLAIM
-- The only two ways a team is created or changes hands.
-- ============================================================

-- How big the catch-up credit is right now, as a share of the established
-- teams' average. Decays with every competitive fixture played since the
-- relaunch; friendlies are not fixtures here, same as everywhere else.
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
-- A share of what the ESTABLISHED teams have averaged, never of the
-- players the new manager picks: crediting their own picks would pay
-- them for hindsight, rewarding them twice for looking up who has scored.
--
-- The baseline averages points_earned minus transfer_cost rather than
-- total_points. The same number for teams that carry no credit, but it
-- can never feed on itself: reading total_points would fold today's
-- credits into tomorrow's baseline and the numbers would climb alone.
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

-- One call, one transaction: a duplicate email has to fail the team row
-- too, otherwise a clash leaves a nameless squad behind.
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

  -- Worked out before the insert, so this team is not in its own
  -- baseline and the client has no say in the number.
  v_credit := fantasy_catch_up_credit(v_season);

  -- Each insert catches its own clash, so a race on one is never
  -- reported as the other.
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

  -- Anonymous sign-ups arrive with no name at all. Give the header and the
  -- admin screens something to show.
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

-- Claiming MOVES ownership to whoever opens the edit link: the browser
-- that held the team before loses edit access until it claims again.
-- That is the deal the link makes, and it is what lets someone pick their
-- team up on a new phone, or a Google account adopt a team that started
-- out anonymous. The link is the only key, so it is 256 bits of
-- randomness and never travels in a public query.
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

-- Recover a team by signing in with the address it was created on.
-- Takes no arguments on purpose: the email is proof of identity here, so
-- it comes from the verified token claim and there is no address to spoof.
create or replace function claim_fantasy_team_by_email()
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_team  fantasy_teams;
  v_mine  uuid;
begin
  if v_uid is null then
    return null;
  end if;

  -- Guests have no verified address. Their edit link is the way back in.
  if is_anon_user() then
    return null;
  end if;

  v_email := lower(nullif(trim(coalesce(auth.email(), auth.jwt() ->> 'email')), ''));
  if v_email is null then
    return null;
  end if;

  select ft.* into v_team
    from fantasy_team_secrets s
    join fantasy_teams ft on ft.id = s.fantasy_team_id
   where lower(s.email) = v_email;

  if not found then
    return null;
  end if;

  if v_team.owner_id = v_uid then
    return v_team.id;
  end if;

  -- Already running a team this season? Keep it, leave the other alone.
  -- Two squads can't be merged without destroying one of them.
  select id into v_mine
    from fantasy_teams
   where season_id = v_team.season_id
     and owner_id  = v_uid
     and id <> v_team.id;

  if v_mine is not null then
    return v_mine;
  end if;

  update fantasy_teams set owner_id = v_uid where id = v_team.id;
  return v_team.id;
end $$;

revoke all on function claim_fantasy_team_by_email() from public;
grant execute on function claim_fantasy_team_by_email() to authenticated;

-- ============================================================
-- ACCOUNT DELETION
-- The one deletion with no undo, so it is narrow on purpose: captains
-- only, never yourself. auth.users is not reachable from the browser,
-- which is why this exists at all.
--
-- What goes: the auth user, their profile, their fantasy team, its picks,
-- its transfers and its edit link.
-- What stays: photos, comments, reports and lineups they touched. Those
-- columns are ON DELETE SET NULL, because losing a season of photos when
-- someone leaves is far worse than an unattributed caption.
-- ============================================================
create or replace function delete_user_account(p_user_id uuid)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_name  text;
  v_teams int;
begin
  if not is_admin() then
    raise exception 'Captains only.' using errcode = 'BPD01';
  end if;

  -- Deleting the account you are signed in as locks you out of the admin
  -- screens, and nobody means to do it.
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account.' using errcode = 'BPD02';
  end if;

  select display_name into v_name from profiles where id = p_user_id;

  -- The cascade off auth.users would reach these anyway; doing it here
  -- lets the function report what it removed.
  with gone as (
    delete from fantasy_teams where owner_id = p_user_id returning 1
  )
  select count(*) into v_teams from gone;

  delete from auth.users where id = p_user_id;
  if not found then
    raise exception 'No such account.' using errcode = 'BPD03';
  end if;

  return json_build_object('display_name', v_name, 'teams_deleted', v_teams);
end $$;

revoke all on function delete_user_account(uuid) from public;
grant execute on function delete_user_account(uuid) to authenticated;

-- Season leaderboards for the public site
create or replace view season_leaderboard as
select
  player_id, name, squad_num, position, season_id,
  appearances, goals, assists, yellows, reds, motm, clean_sheets, fantasy_points
from fantasy_player_points
where appearances > 0 or goals > 0 or assists > 0;

-- Competitive record for the season. Friendlies count for nothing.
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

-- Head to head record vs each opponent. Friendlies excluded.
create or replace view head_to_head as
select
  opponent,
  count(*)::int as played,
  count(*) filter (where our_score > their_score)::int as won,
  count(*) filter (where our_score = their_score)::int as drawn,
  count(*) filter (where our_score < their_score)::int as lost,
  coalesce(sum(our_score), 0)::int   as goals_for,
  coalesce(sum(their_score), 0)::int as goals_against
from fixtures
where status = 'played' and our_score is not null
  and competition <> 'Friendly'
group by opponent
order by played desc;

-- ============================================================
-- ROW LEVEL SECURITY
-- Public can read. Admins write. Players manage their own rows.
-- ============================================================

alter table settings         enable row level security;
alter table seasons          enable row level security;
alter table players          enable row level security;
alter table profiles         enable row level security;
alter table venues           enable row level security;
alter table fixtures         enable row level security;
alter table availability     enable row level security;
alter table lineups          enable row level security;
alter table lineup_slots     enable row level security;
alter table lineup_comments  enable row level security;
alter table match_events     enable row level security;
alter table appearances      enable row level security;
alter table media            enable row level security;
alter table match_reports    enable row level security;
alter table fantasy_teams     enable row level security;
alter table fantasy_team_secrets enable row level security;
alter table fantasy_settings  enable row level security;
alter table fantasy_picks     enable row level security;
alter table fantasy_transfers enable row level security;
alter table fantasy_rules     enable row level security;
alter table league_table      enable row level security;

-- Public read on everything the site displays
create policy "public read" on settings      for select using (true);
create policy "public read" on seasons       for select using (true);
create policy "public read" on players       for select using (true);
create policy "public read" on venues        for select using (true);
create policy "public read" on fixtures      for select using (true);
create policy "public read" on availability  for select using (true);
create policy "public read" on match_events  for select using (true);
create policy "public read" on appearances   for select using (true);
create policy "read approved media" on media
  for select using (is_approved or is_admin());
create policy "public read" on fantasy_rules for select using (true);
create policy "public read" on fantasy_settings for select using (true);
create policy "admin write" on fantasy_settings
  for all using (is_admin()) with check (is_admin());
create policy "public read" on fantasy_teams     for select using (true);
create policy "public read" on fantasy_picks     for select using (true);
create policy "public read" on fantasy_transfers for select using (true);
create policy "public read" on league_table  for select using (true);

-- Lineups: public sees published ones, logged-in users see all
create policy "read published lineups" on lineups
  for select using (is_published or auth.uid() is not null);
create policy "read lineup slots" on lineup_slots
  for select using (
    exists (select 1 from lineups l where l.id = lineup_id
            and (l.is_published or auth.uid() is not null))
  );
create policy "read lineup comments" on lineup_comments
  for select using (auth.uid() is not null);

-- Match reports: public sees published
create policy "read published reports" on match_reports
  for select using (is_published or is_admin());

-- Profiles: you can read your own, admins read all
create policy "read own profile" on profiles
  for select using (id = auth.uid() or is_admin());
create policy "update own profile" on profiles
  for update using (id = auth.uid());
-- Admins update anyone, so they can approve accounts and set role / player_id
create policy "admin manage profiles" on profiles
  for update using (is_admin()) with check (is_admin());

-- Admin writes
create policy "admin write" on settings      for all using (is_admin()) with check (is_admin());
create policy "admin write" on seasons       for all using (is_admin()) with check (is_admin());
create policy "admin write" on players       for all using (is_admin()) with check (is_admin());
create policy "admin write" on venues        for all using (is_admin()) with check (is_admin());
create policy "admin write" on fixtures      for all using (is_admin()) with check (is_admin());
create policy "admin write" on lineups       for all using (is_admin()) with check (is_admin());
create policy "admin write" on lineup_slots  for all using (is_admin()) with check (is_admin());
create policy "admin write" on match_events  for all using (is_admin()) with check (is_admin());
create policy "admin write" on appearances   for all using (is_admin()) with check (is_admin());
create policy "admin write" on match_reports for all using (is_admin()) with check (is_admin());
create policy "admin write" on media         for all using (is_admin()) with check (is_admin());
create policy "admin write" on fantasy_rules for all using (is_admin()) with check (is_admin());
create policy "admin write" on league_table  for all using (is_admin()) with check (is_admin());

-- Approved users submit media; it stays hidden until a captain publishes it.
-- Guest fantasy managers are anonymous accounts: fantasy and nothing else,
-- even if a captain approves one by accident.
create policy "approved users submit media" on media
  for insert with check (is_approved() and not is_anon_user() and submitted_by = auth.uid());
create policy "remove own pending media" on media
  for delete using (submitted_by = auth.uid() and not is_approved);

-- Approved users can comment on a lineup
create policy "comment on lineups" on lineup_comments
  for insert with check (is_approved() and not is_anon_user() and author_id = auth.uid());
create policy "delete own comment" on lineup_comments
  for delete using (author_id = auth.uid() or is_admin());

-- Players set their own availability; admins can set anyone's
create policy "set own availability" on availability
  for insert with check (player_id = my_player_id() or is_admin());
create policy "update own availability" on availability
  for update using (player_id = my_player_id() or is_admin());
create policy "delete own availability" on availability
  for delete using (player_id = my_player_id() or is_admin());

-- Fantasy: everyone reads every team and squad, only the owner writes.
-- Split by command rather than "for all", so nothing here can narrow the
-- public read above.
create policy "create own fantasy team" on fantasy_teams
  for insert with check (owner_id = auth.uid());
create policy "update own fantasy team" on fantasy_teams
  for update using (owner_id = auth.uid() or is_admin())
  with check (owner_id = auth.uid() or is_admin());
create policy "delete own fantasy team" on fantasy_teams
  for delete using (owner_id = auth.uid() or is_admin());

-- The email and the edit token: current owner or a captain, nobody else.
-- anon is granted select as well, because a guest manager reading back
-- their own edit link IS an anonymous session; the policy picks the row.
grant select, insert, update, delete on fantasy_team_secrets to anon, authenticated;
create policy "owner reads own secrets" on fantasy_team_secrets
  for select using (
    is_admin() or exists (
      select 1 from fantasy_teams ft
       where ft.id = fantasy_team_id and ft.owner_id = auth.uid())
  );
-- Rows are written by create_fantasy_team(), which is security definer.
-- Captains can correct an address by hand; nobody else writes here at all.
create policy "admin writes secrets" on fantasy_team_secrets
  for all using (is_admin()) with check (is_admin());
create policy "manage own fantasy picks" on fantasy_picks
  for all using (
    exists (select 1 from fantasy_teams ft where ft.id = fantasy_team_id
            and (ft.owner_id = auth.uid() or is_admin()) and not ft.is_locked)
  )
  with check (
    exists (select 1 from fantasy_teams ft where ft.id = fantasy_team_id
            and (ft.owner_id = auth.uid() or is_admin()) and not ft.is_locked)
  );

-- Transfers are append-only. You log your own, nobody edits history.
create policy "log own transfers" on fantasy_transfers
  for insert with check (
    exists (select 1 from fantasy_teams ft where ft.id = fantasy_team_id
            and (ft.owner_id = auth.uid() or is_admin()) and not ft.is_locked)
  );
create policy "admin fix transfers" on fantasy_transfers
  for delete using (is_admin());

-- ============================================================
-- STORAGE BUCKET for team photos
-- ============================================================
insert into storage.buckets (id, name, public)
values ('team-media', 'team-media', true)
on conflict (id) do nothing;

create policy "public read media" on storage.objects
  for select using (bucket_id = 'team-media');
create policy "admin upload media" on storage.objects
  for insert with check (bucket_id = 'team-media' and is_admin());
create policy "admin delete media" on storage.objects
  for delete using (bucket_id = 'team-media' and is_admin());
