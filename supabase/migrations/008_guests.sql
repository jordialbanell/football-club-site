-- ============================================================
-- MIGRATION 008 — Guest players
-- Ringers who turn out for one match. They can be picked in a
-- lineup and score goals, but they aren't squad members: they
-- stay off the Squad page and out of the fantasy pool.
-- Safe to run twice.
-- ============================================================

alter table players add column if not exists is_guest boolean not null default false;

comment on column players.is_guest is
  'True for one-off ringers. Excluded from the squad list and fantasy picking, but their goals and appearances still count.';
