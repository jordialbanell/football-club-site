-- ============================================================
-- MIGRATION 004 — Fantasy XI by formation
-- A fantasy team is now a formation plus eleven position-locked
-- slots, rather than a flat list of players.
-- Safe to run twice.
-- ============================================================

alter table fantasy_teams add column if not exists formation text not null default '4-4-2';
alter table fantasy_picks add column if not exists slot_index int;

comment on column fantasy_teams.formation is
  'Formation key from CONFIG.FORMATIONS. Decides how many of each position the squad needs.';
comment on column fantasy_picks.slot_index is
  'Which pitch position this pick fills (0-10). Null on picks made before formations existed.';
