-- ============================================================
-- MIGRATION 011 — Recover a fantasy team by signing in with its email
--
-- A team created without an account has been reachable only through
-- its edit link. Magic-link sign-in works for every address now, so the
-- email someone typed at sign-up can act as the recovery key too: sign
-- in with it on any device and the team comes back.
--
-- The email is proof of identity here, so it has to come from the token
-- rather than from anything the caller passes. This function takes no
-- arguments for exactly that reason: it reads auth.email(), which is a
-- verified claim, and there is no address to spoof.
--
-- Safe to run twice.
-- ============================================================

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

  -- Guests have no verified address, so they have nothing to prove here.
  -- They recover a team with their edit link, which is what it is for.
  if is_anon_user() then
    return null;
  end if;

  -- auth.email() is the verified claim on the current token. The jwt()
  -- fallback is belt and braces for tokens issued before auth.email()
  -- was populated.
  v_email := lower(nullif(trim(coalesce(auth.email(), auth.jwt() ->> 'email')), ''));
  if v_email is null then
    return null;
  end if;

  select ft.* into v_team
    from fantasy_team_secrets s
    join fantasy_teams ft on ft.id = s.fantasy_team_id
   where lower(s.email) = v_email;

  if not found then
    return null;                      -- no team on that address
  end if;

  if v_team.owner_id = v_uid then
    return v_team.id;                 -- already theirs, nothing to move
  end if;

  -- Already running a team this season? Keep it and leave the other one
  -- alone. Two squads can't be merged without destroying one of them, and
  -- picking a winner silently is worse than doing nothing.
  select id into v_mine
    from fantasy_teams
   where season_id = v_team.season_id
     and owner_id  = v_uid
     and id <> v_team.id;

  if v_mine is not null then
    return v_mine;
  end if;

  -- Same hand-over as claim_fantasy_team(): whoever proves the address
  -- takes edit access, and the browser that held it loses it until it
  -- claims back. Scoring keys on the team, so nothing about points moves.
  update fantasy_teams set owner_id = v_uid where id = v_team.id;
  return v_team.id;
end $$;

-- Signed-out visitors have no email to check, so anon is not granted this.
revoke all on function claim_fantasy_team_by_email() from public;
grant execute on function claim_fantasy_team_by_email() to authenticated;
