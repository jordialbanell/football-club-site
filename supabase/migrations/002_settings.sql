-- ============================================================
-- MIGRATION 002 — Club settings (home page photo)
--
-- Run this in the Supabase SQL Editor.
-- Safe to run more than once.
-- ============================================================

create table if not exists settings (
  key        text primary key,
  value      text,
  updated_at timestamptz not null default now()
);

alter table settings enable row level security;

drop policy if exists "public read" on settings;
create policy "public read" on settings for select using (true);

drop policy if exists "admin write settings" on settings;
create policy "admin write settings" on settings
  for all using (is_admin()) with check (is_admin());

-- Empty string means "use the photo bundled with the site"
insert into settings (key, value)
values ('hero_image', '')
on conflict (key) do nothing;
