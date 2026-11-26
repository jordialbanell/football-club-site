-- ============================================================
-- RIVERSIDE FC — Seed data
-- Run AFTER schema.sql
-- ============================================================

-- ---------- SEASON ----------
-- free_transfers / transfer_cost control the fantasy transfer market.
-- Change them any time with an UPDATE, no redeploy needed.
insert into seasons (name, starts_on, ends_on, is_active, free_transfers, transfer_cost)
values ('2026 Season', '2026-01-01', '2026-12-31', true, 2, 4);

-- ---------- VENUES ----------
-- Sample venues. Replace with your own.
insert into venues (name, address, notes, is_home, map_url) values
  ('Riverside Park',
   '1 Park Road',
   'Home pitch. Enter from the car park side.',
   true,
   'https://maps.google.com/?q=Riverside+Park'),
  ('Hillside Sports Ground',
   '20 Hill Street',
   'Second home venue. Pitch 2.',
   true,
   'https://maps.google.com/?q=Hillside+Sports+Ground');

-- ---------- SQUAD ----------
-- A made-up squad of 15. Replace with your own players (or edit them in the admin panel).
insert into players (squad_num, name, nickname, position) values
  (1,  'Danny Walsh',    null,     'GK'),
  (2,  'Leo Martins',    'Cap',    'DEF'),
  (3,  'Ravi Kumar',     null,     'DEF'),
  (4,  'Tom Becker',     'Becks',  'DEF'),
  (5,  'Hugo Laurent',   null,     'DEF'),
  (6,  'Kenji Mori',     null,     'MID'),
  (7,  'Sam Okafor',     'Oka',    'MID'),
  (8,  'Ben Reed',       null,     'MID'),
  (9,  'Mateo Ruiz',     null,     'MID'),
  (10, 'Ollie Grant',    'Ols',    'MID'),
  (11, 'Yuri Petrov',    null,     'MID'),
  (12, 'Nico Andersen',  null,     'ATT'),
  (13, 'Max Fischer',    null,     'ATT'),
  (14, 'Jay Tan',        'JT',     'ATT'),
  (15, 'Aaron Cole',     null,     'ATT');

-- ---------- FANTASY SCORING RULES ----------
insert into fantasy_rules (season_id, event, points)
select s.id, r.event, r.points
from seasons s,
  (values
    ('appearance',   2),
    ('goal',         5),
    ('goal_def',     7),
    ('assist',       3),
    ('clean_sheet',  4),
    ('motm',         3),
    ('yellow',      -1),
    ('red',         -3),
    ('own_goal',    -2)
  ) as r(event, points)
where s.is_active;

-- ============================================================
-- MAKE YOURSELF AN ADMIN
-- ------------------------------------------------------------
-- 1. Sign in to the site once with your email (magic link).
-- 2. Come back here and run the block below with your email.
-- 3. Repeat for the other captains.
-- ============================================================

-- update profiles
--   set role = 'admin',
--       player_id = (select id from players where squad_num = 2)  -- the captain
--   where id = (select id from auth.users where email = 'YOUR_EMAIL_HERE');

-- ---------- SAMPLE FIXTURES AND RESULTS ----------
-- A few made-up matches so the site has something to show: four played, four to come.
-- Delete them from the admin panel (or with SQL) before your real season starts.
insert into fixtures
  (season_id, opponent, kickoff_at, venue_id, home_away, competition, status, our_score, their_score, venue_name)
values
  ((select id from seasons where is_active), 'Harbour Athletic', '2026-09-06T10:30:00Z', (select id from venues where name = 'Riverside Park'), 'home', 'League', 'played', 3, 1, null),
  ((select id from seasons where is_active), 'Old Town Rangers', '2026-09-20T10:30:00Z', null, 'away', 'League', 'played', 1, 1, 'Old Town Rec'),
  ((select id from seasons where is_active), 'Lakeside United',  '2026-10-04T10:30:00Z', (select id from venues where name = 'Riverside Park'), 'home', 'Cup', 'played', 2, 0, null),
  ((select id from seasons where is_active), 'Northgate FC',     '2026-10-18T10:30:00Z', null, 'away', 'League', 'played', 0, 2, 'Northgate Common'),
  ((select id from seasons where is_active), 'Harbour Athletic', '2026-12-06T10:30:00Z', null, 'away', 'League', 'upcoming', null, null, 'Harbour Fields'),
  ((select id from seasons where is_active), 'Old Town Rangers', '2026-12-13T10:30:00Z', (select id from venues where name = 'Riverside Park'), 'home', 'League', 'upcoming', null, null, null),
  ((select id from seasons where is_active), 'Lakeside United',  '2027-01-10T10:30:00Z', (select id from venues where name = 'Hillside Sports Ground'), 'home', 'Friendly', 'upcoming', null, null, null),
  ((select id from seasons where is_active), 'Northgate FC',     '2027-01-24T10:30:00Z', (select id from venues where name = 'Riverside Park'), 'home', 'League', 'upcoming', null, null, null);

-- Who scored in the played matches (drives the stats and fantasy points).
insert into match_events (fixture_id, player_id, type, qty)
select f.id, p.id, e.type::event_type, e.qty
from (values
  ('Harbour Athletic', '2026-09-06T10:30:00Z', 12, 'goal', 2),
  ('Harbour Athletic', '2026-09-06T10:30:00Z', 7,  'goal', 1),
  ('Harbour Athletic', '2026-09-06T10:30:00Z', 10, 'assist', 2),
  ('Harbour Athletic', '2026-09-06T10:30:00Z', 12, 'motm', 1),
  ('Old Town Rangers', '2026-09-20T10:30:00Z', 14, 'goal', 1),
  ('Old Town Rangers', '2026-09-20T10:30:00Z', 8,  'yellow', 1),
  ('Lakeside United',  '2026-10-04T10:30:00Z', 13, 'goal', 1),
  ('Lakeside United',  '2026-10-04T10:30:00Z', 4,  'goal', 1),
  ('Lakeside United',  '2026-10-04T10:30:00Z', 1,  'clean_sheet', 1),
  ('Lakeside United',  '2026-10-04T10:30:00Z', 1,  'motm', 1)
) as e(opponent, kickoff, squad_num, type, qty)
join fixtures f on f.opponent = e.opponent and f.kickoff_at = e.kickoff::timestamptz
join players p on p.squad_num = e.squad_num;

-- Everyone who played in each played match.
insert into appearances (fixture_id, player_id)
select f.id, p.id from fixtures f cross join players p
where f.status = 'played' and p.squad_num <= 13;

-- ---------- SAMPLE LEAGUE TABLE ----------
insert into league_table (season_id, team, played, won, drawn, lost, goals_for, goals_against, points, sort_order)
select s.id, t.team, t.p, t.w, t.d, t.l, t.gf, t.ga, t.pts, t.ord
from seasons s, (values
  ('Northgate FC',     4, 3, 1, 0, 9, 3, 10, 1),
  ('Riverside FC',     3, 1, 1, 1, 4, 4,  4, 2),
  ('Old Town Rangers', 4, 1, 1, 2, 5, 6,  4, 3),
  ('Harbour Athletic', 3, 0, 1, 2, 3, 8,  1, 4)
) as t(team, p, w, d, l, gf, ga, pts, ord)
where s.is_active;
