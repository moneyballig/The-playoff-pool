/*
# THE PLAYOFF POOL — bootstrap & admin tools

1. Functions
- `pp_claim_admin()` — bootstrap: if no platform admin exists yet, the caller becomes the platform admin. Returns true/false. This makes the FIRST registered account the administrator.
- `pp_set_pool_deadline(pool, deadline)` — admin-only deadline setting.
- `pp_lock_pool_brackets(pool)` — admin override: freeze + submit-lock every bracket in a pool immediately.
- `pp_revoke_member(pool, user)` — admin-only removal of a participant (their brackets stay unless explicitly deleted via cascade from member removal? we keep brackets, only membership removed... actually remove membership only).

2. Seed data
- Default pool "The Playoff Pool" for season 2026 with a deadline placeholder (admin can change) and invitation code "PLAYOFF26".
- Placeholder created_by is null (system row).

3. Security
- All functions SECURITY DEFINER with locked search_path, EXECUTE granted only to authenticated.
*/

CREATE OR REPLACE FUNCTION pp_claim_admin()
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  SELECT count(*) INTO v_count FROM admin_users;
  IF v_count = 0 THEN
    INSERT INTO admin_users (user_id) VALUES (auth.uid());
    RETURN true;
  END IF;
  RETURN EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid());
END;
$$;

CREATE OR REPLACE FUNCTION pp_set_pool_deadline(p_pool uuid, p_deadline timestamptz)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT pp_is_pool_admin(p_pool) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE pools SET deadline = p_deadline WHERE id = p_pool;
END;
$$;

CREATE OR REPLACE FUNCTION pp_lock_pool_brackets(p_pool uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT pp_is_pool_admin(p_pool) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE brackets SET frozen = true WHERE pool_id = p_pool;
END;
$$;

CREATE OR REPLACE FUNCTION pp_revoke_member(p_pool uuid, p_user uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT pp_is_pool_admin(p_pool) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  DELETE FROM pool_members WHERE pool_id = p_pool AND user_id = p_user;
END;
$$;

REVOKE EXECUTE ON FUNCTION pp_claim_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION pp_set_pool_deadline(uuid, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION pp_lock_pool_brackets(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION pp_revoke_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pp_claim_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION pp_set_pool_deadline(uuid, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION pp_lock_pool_brackets(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pp_revoke_member(uuid, uuid) TO authenticated;

-- Default pool + invitation code
INSERT INTO pools (name, season, deadline, tiebreaker_enabled, brackets_visible)
SELECT 'The Playoff Pool', 2026, '2026-01-09 18:00:00+00'::timestamptz, true, true
WHERE NOT EXISTS (SELECT 1 FROM pools);

INSERT INTO pool_invitations (pool_id, code)
SELECT id, 'PLAYOFF26' FROM pools
WHERE NOT EXISTS (SELECT 1 FROM pool_invitations);
