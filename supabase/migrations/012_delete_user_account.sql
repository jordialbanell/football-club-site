-- ============================================================
-- MIGRATION 012 — Captains can delete an account outright
--
-- Rejecting an account only ever left it pending: the row stayed, and so
-- did any fantasy team behind it. There was no way to remove a
-- duplicate, a mistake or a guest team from the admin screens, because
-- auth.users is not reachable from the browser at all.
--
-- This is the one deletion on the site with no undo, so it is narrow on
-- purpose: captains only, never yourself, and it names what it removed
-- so the UI can say so afterwards.
--
-- What goes: the auth user, their profile, their fantasy team, its picks,
-- its transfers and its edit link.
-- What stays: photos, comments, match reports and lineups they touched.
-- Those columns are ON DELETE SET NULL, so the club's content survives an
-- account going away. Deleting a season of photos because someone left
-- would be a far worse outcome than an unattributed caption.
--
-- Safe to run twice.
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

  -- Deleting the account you are signed in as locks you straight out of
  -- the admin screens, and nobody means to do it.
  if p_user_id = auth.uid() then
    raise exception 'You cannot delete your own account.' using errcode = 'BPD02';
  end if;

  select display_name into v_name from profiles where id = p_user_id;

  -- The cascade from auth.users would reach these anyway. Doing it here
  -- means the function can report what it removed, and it still works if
  -- a database somewhere is missing one of the cascades.
  with gone as (
    delete from fantasy_teams where owner_id = p_user_id returning 1
  )
  select count(*) into v_teams from gone;

  delete from auth.users where id = p_user_id;
  if not found then
    raise exception 'No such account.' using errcode = 'BPD03';
  end if;

  -- profiles cascades off auth.users, so it is gone with the line above.

  return json_build_object(
    'display_name', v_name,
    'teams_deleted', v_teams
  );
end $$;

revoke all on function delete_user_account(uuid) from public;
grant execute on function delete_user_account(uuid) to authenticated;
