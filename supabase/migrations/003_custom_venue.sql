-- ============================================================
-- MIGRATION 003 — Type-in venue for away fixtures
-- Run in the Supabase SQL Editor. Safe to run twice.
-- ============================================================

alter table fixtures add column if not exists venue_name    text;
alter table fixtures add column if not exists venue_address text;

comment on column fixtures.venue_name is
  'Free-text ground name, used when venue_id is null (away fixtures)';
comment on column fixtures.venue_address is
  'Free-text address for an away ground. Linked to Google Maps on the site.';
