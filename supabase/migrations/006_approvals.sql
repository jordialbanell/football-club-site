-- ============================================================
-- MIGRATION 006 — Account approval and media moderation
-- New sign-ups sit pending until a captain approves them.
-- Media submitted by players stays hidden until approved.
-- Safe to run twice.
-- ============================================================

alter table profiles add column if not exists is_approved boolean not null default false;
alter table media    add column if not exists is_approved boolean not null default false;
alter table media    add column if not exists submitted_by uuid references profiles(id) on delete set null;

-- Everyone who already exists is trusted
update profiles set is_approved = true;
update media    set is_approved = true;

-- Admins are always approved
create or replace function handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, display_name, role, is_approved)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), new.email),
    'viewer',
    false
  );
  return new;
end; $$;

create or replace function is_approved()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_approved);
$$;

-- ── Media: public sees approved only; approved users may submit ──
drop policy if exists "public read" on media;
drop policy if exists "read approved media" on media;
create policy "read approved media" on media
  for select using (is_approved or is_admin());

drop policy if exists "approved users submit media" on media;
create policy "approved users submit media" on media
  for insert with check (is_approved() and submitted_by = auth.uid());

drop policy if exists "remove own pending media" on media;
create policy "remove own pending media" on media
  for delete using (submitted_by = auth.uid() and not is_approved);

-- ── Comments and availability now need approval too ──
drop policy if exists "comment on lineups" on lineup_comments;
create policy "comment on lineups" on lineup_comments
  for insert with check (is_approved() and author_id = auth.uid());

-- ── Admins can see every profile so they can approve ──
drop policy if exists "read own profile" on profiles;
create policy "read own profile" on profiles
  for select using (id = auth.uid() or is_admin());
