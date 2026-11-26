-- ============================================================
-- MIGRATION 009 — Admins can update other profiles
-- profiles only had "update own profile" (id = auth.uid()), so an
-- admin approving someone, or setting their role or player_id, matched
-- zero rows. PostgREST reports that as a success, so the UI said the
-- write had worked when nothing had changed.
-- Every other admin-managed table already has an "admin write" policy;
-- profiles was the one that was missed.
-- Safe to run twice.
-- ============================================================

-- Scoped to update, not "for all": admins have no reason to insert or
-- delete profiles. Sign-up rows come from the handle_new_user trigger,
-- which is security definer and bypasses RLS.
drop policy if exists "admin manage profiles" on profiles;
create policy "admin manage profiles" on profiles
  for update using (is_admin()) with check (is_admin());

-- "update own profile" stays. Permissive policies are OR-ed, so a normal
-- user keeps their own row and an admin additionally gets everyone's.
