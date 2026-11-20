/*
# THE PLAYOFF POOL — security: RLS, grants, helpers

1. Helper functions (SECURITY DEFINER)
- `pp_is_platform_admin()` — true if caller is in admin_users.
- `pp_is_pool_admin(pool)` — platform admin OR admin/member role row for that pool.
- `pp_is_pool_member(pool)` — any membership row for that pool.
- `pp_active_pool_ids()` — set of pools caller belongs to (used for readable shared data).
All have locked search_path and EXECUTE revoked from public/anon then granted to authenticated.

2. RLS policies (all tables)
- pools: readable by any authenticated user (pool existence is public within the app); writable only by platform admins / pool creators.
- pool_members: members see co-members; users insert their own membership; pool admins manage.
- pool_invitations: pool admins only.
- playoff_teams, playoff_games: readable by authenticated; writable only by platform/pool admins.
- brackets: users read own + pool-visible submitted brackets (if pool.brackets_visible or caller is pool admin); create/update/delete own, only while not frozen; server-side deadline enforced in functions.
- bracket_picks: scoped through parent bracket with the same rules; picks insert/update only while bracket not frozen.
- announcements: readable by pool members; writable by pool admins.

3. Grants
- Explicit GRANTs for authenticated on every table (and service_role where admin functions run client-side via authenticated role instead).
*/

CREATE OR REPLACE FUNCTION pp_is_platform_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION pp_is_pool_admin(p_pool uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pp_is_platform_admin() OR EXISTS (
    SELECT 1 FROM pool_members
    WHERE pool_id = p_pool AND user_id = auth.uid() AND role = 'admin'
  );
$$;

CREATE OR REPLACE FUNCTION pp_is_pool_member(p_pool uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM pool_members
    WHERE pool_id = p_pool AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION pp_active_pool_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pool_id FROM pool_members WHERE user_id = auth.uid();
$$;

REVOKE EXECUTE ON FUNCTION pp_is_platform_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION pp_is_pool_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION pp_is_pool_member(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION pp_active_pool_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pp_is_platform_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION pp_is_pool_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pp_is_pool_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pp_active_pool_ids() TO authenticated;

ALTER TABLE pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE pool_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE playoff_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE playoff_games ENABLE ROW LEVEL SECURITY;
ALTER TABLE brackets ENABLE ROW LEVEL SECURITY;
ALTER TABLE bracket_picks ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- pools
DROP POLICY IF EXISTS "pools_select_auth" ON pools;
CREATE POLICY "pools_select_auth" ON pools FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "pools_insert_admin" ON pools;
CREATE POLICY "pools_insert_admin" ON pools FOR INSERT TO authenticated
  WITH CHECK (pp_is_platform_admin() OR created_by = auth.uid());
DROP POLICY IF EXISTS "pools_update_admin" ON pools;
CREATE POLICY "pools_update_admin" ON pools FOR UPDATE TO authenticated
  USING (pp_is_pool_admin(id)) WITH CHECK (pp_is_pool_admin(id));
DROP POLICY IF EXISTS "pools_delete_admin" ON pools;
CREATE POLICY "pools_delete_admin" ON pools FOR DELETE TO authenticated
  USING (pp_is_platform_admin());

-- pool_members
DROP POLICY IF EXISTS "members_select_self_or_coleague" ON pool_members;
CREATE POLICY "members_select_self_or_coleague" ON pool_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR pool_id IN (SELECT pp_active_pool_ids()));
DROP POLICY IF EXISTS "members_insert_self" ON pool_members;
CREATE POLICY "members_insert_self" ON pool_members FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR pp_is_pool_admin(pool_id));
DROP POLICY IF EXISTS "members_update_admin" ON pool_members;
CREATE POLICY "members_update_admin" ON pool_members FOR UPDATE TO authenticated
  USING (pp_is_pool_admin(pool_id)) WITH CHECK (pp_is_pool_admin(pool_id));
DROP POLICY IF EXISTS "members_delete_admin" ON pool_members;
CREATE POLICY "members_delete_admin" ON pool_members FOR DELETE TO authenticated
  USING (pp_is_pool_admin(pool_id) OR user_id = auth.uid());

-- pool_invitations
DROP POLICY IF EXISTS "invites_admin_only" ON pool_invitations;
CREATE POLICY "invites_admin_only" ON pool_invitations FOR ALL TO authenticated
  USING (pp_is_pool_admin(pool_id)) WITH CHECK (pp_is_pool_admin(pool_id));

-- playoff_teams
DROP POLICY IF EXISTS "teams_select_auth" ON playoff_teams;
CREATE POLICY "teams_select_auth" ON playoff_teams FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "teams_write_admin" ON playoff_teams;
CREATE POLICY "teams_write_admin" ON playoff_teams FOR INSERT TO authenticated
  WITH CHECK (pp_is_platform_admin());
DROP POLICY IF EXISTS "teams_update_admin" ON playoff_teams;
CREATE POLICY "teams_update_admin" ON playoff_teams FOR UPDATE TO authenticated
  USING (pp_is_platform_admin());
DROP POLICY IF EXISTS "teams_delete_admin" ON playoff_teams;
CREATE POLICY "teams_delete_admin" ON playoff_teams FOR DELETE TO authenticated
  USING (pp_is_platform_admin());

-- playoff_games
DROP POLICY IF EXISTS "games_select_auth" ON playoff_games;
CREATE POLICY "games_select_auth" ON playoff_games FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "games_write_admin" ON playoff_games;
CREATE POLICY "games_write_admin" ON playoff_games FOR INSERT TO authenticated
  WITH CHECK (pp_is_platform_admin());
DROP POLICY IF EXISTS "games_update_admin" ON playoff_games;
CREATE POLICY "games_update_admin" ON playoff_games FOR UPDATE TO authenticated
  USING (pp_is_platform_admin());
DROP POLICY IF EXISTS "games_delete_admin" ON playoff_games;
CREATE POLICY "games_delete_admin" ON playoff_games FOR DELETE TO authenticated
  USING (pp_is_platform_admin());

-- brackets
DROP POLICY IF EXISTS "brackets_select" ON brackets;
CREATE POLICY "brackets_select" ON brackets FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM pools p
      WHERE p.id = pool_id
        AND (pp_is_pool_admin(p.id) OR (p.brackets_visible AND submitted))
    )
  );
DROP POLICY IF EXISTS "brackets_insert_own" ON brackets;
CREATE POLICY "brackets_insert_own" ON brackets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "brackets_update_own" ON brackets;
CREATE POLICY "brackets_update_own" ON brackets FOR UPDATE TO authenticated
  USING (user_id = auth.uid() AND NOT frozen)
  WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "brackets_delete_own" ON brackets;
CREATE POLICY "brackets_delete_own" ON brackets FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND NOT frozen);

-- bracket_picks
DROP POLICY IF EXISTS "picks_select_via_bracket" ON bracket_picks;
CREATE POLICY "picks_select_via_bracket" ON bracket_picks FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM brackets b
      WHERE b.id = bracket_id
        AND (
          b.user_id = auth.uid()
          OR EXISTS (
            SELECT 1 FROM pools p WHERE p.id = b.pool_id
              AND (pp_is_pool_admin(p.id) OR (p.brackets_visible AND b.submitted))
          )
        )
    )
  );
DROP POLICY IF EXISTS "picks_insert_via_bracket" ON bracket_picks;
CREATE POLICY "picks_insert_via_bracket" ON bracket_picks FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM brackets b
      WHERE b.id = bracket_id AND b.user_id = auth.uid() AND NOT b.frozen
    )
  );
DROP POLICY IF EXISTS "picks_update_via_bracket" ON bracket_picks;
CREATE POLICY "picks_update_via_bracket" ON bracket_picks FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM brackets b
      WHERE b.id = bracket_id AND b.user_id = auth.uid() AND NOT b.frozen
    )
  );
DROP POLICY IF EXISTS "picks_delete_via_bracket" ON bracket_picks;
CREATE POLICY "picks_delete_via_bracket" ON bracket_picks FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM brackets b
      WHERE b.id = bracket_id AND b.user_id = auth.uid() AND NOT b.frozen
    )
  );

-- announcements
DROP POLICY IF EXISTS "announcements_select_members" ON announcements;
CREATE POLICY "announcements_select_members" ON announcements FOR SELECT TO authenticated
  USING (pool_id IN (SELECT pp_active_pool_ids()));
DROP POLICY IF EXISTS "announcements_write_admin" ON announcements;
CREATE POLICY "announcements_write_admin" ON announcements FOR INSERT TO authenticated
  WITH CHECK (pp_is_pool_admin(pool_id));
DROP POLICY IF EXISTS "announcements_update_admin" ON announcements;
CREATE POLICY "announcements_update_admin" ON announcements FOR UPDATE TO authenticated
  USING (pp_is_pool_admin(pool_id));
DROP POLICY IF EXISTS "announcements_delete_admin" ON announcements;
CREATE POLICY "announcements_delete_admin" ON announcements FOR DELETE TO authenticated
  USING (pp_is_pool_admin(pool_id));

-- admin_users: platform admins can see the list; users can see only their own row
DROP POLICY IF EXISTS "admin_users_select" ON admin_users;
CREATE POLICY "admin_users_select" ON admin_users FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR pp_is_platform_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON pools TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pool_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON pool_invitations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON playoff_teams TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON playoff_games TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON brackets TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON bracket_picks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON announcements TO authenticated;
GRANT SELECT ON admin_users TO authenticated;
