/*
# THE PLAYOFF POOL — profiles, leaderboard & admin directory

1. New Tables
- `profiles` — one row per auth user: id (matches auth.users.id), display_name. A trigger creates it automatically at signup.

2. New Functions (SECURITY DEFINER)
- `pp_handle_new_user()` — trigger function: inserts a profile with a display name from the signup email.
- `pp_leaderboard(p_pool)` — every submitted (or any, for pool admins) bracket joined with display names. Returns rank, entry name, participant display name, points breakdown, tiebreaker. Callable by pool members.
- `pp_admin_participants(p_pool)` — pool admins only: participant list with emails and entry counts (email is sensitive, so it is only exposed through this admin-gated function, never through table reads).

3. Security
- RLS on profiles: users can read their own and co-members' profiles (needed for leaderboards), update only their own display name.
- Grants for authenticated; EXECUTE on new functions revoked from public/anon and granted to authenticated.
*/

CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select_authenticated" ON profiles;
CREATE POLICY "profiles_select_authenticated" ON profiles FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

GRANT SELECT, UPDATE (display_name) ON profiles TO authenticated;

CREATE OR REPLACE FUNCTION pp_handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, display_name)
  VALUES (
    NEW.id,
    coalesce(
      nullif(new.raw_user_meta_data->>'display_name', ''),
      split_part(new.email, '@', 1)
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pp_handle_new_user ON auth.users;
CREATE TRIGGER trg_pp_handle_new_user
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION pp_handle_new_user();

-- backfill profiles for any users created before this trigger existed
INSERT INTO profiles (id, display_name)
SELECT u.id, split_part(u.email, '@', 1)
FROM auth.users u
WHERE NOT EXISTS (SELECT 1 FROM profiles p WHERE p.id = u.id);

CREATE OR REPLACE FUNCTION pp_leaderboard(p_pool uuid)
RETURNS TABLE (
  bracket_id uuid,
  entry_number int,
  entry_name text,
  user_id uuid,
  display_name text,
  total_points int,
  correct_picks int,
  wc_points int,
  div_points int,
  conf_points int,
  sb_points int,
  tiebreaker_points int,
  rank int
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT b.id, b.entry_number, b.name, b.user_id, pr.display_name,
         b.total_points, b.correct_picks, b.wc_points, b.div_points, b.conf_points, b.sb_points,
         b.tiebreaker_points, b.rank
  FROM brackets b
  LEFT JOIN profiles pr ON pr.id = b.user_id
  WHERE b.pool_id = p_pool
    AND (b.submitted OR pp_is_pool_admin(p_pool))
  ORDER BY b.rank ASC NULLS LAST, b.total_points DESC;
$$;

CREATE OR REPLACE FUNCTION pp_admin_participants(p_pool uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  email text,
  role text,
  joined_at timestamptz,
  entry_count bigint
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT pm.user_id, pr.display_name, u.email, pm.role, pm.joined_at,
         (SELECT count(*) FROM brackets b WHERE b.pool_id = pm.pool_id AND b.user_id = pm.user_id)
  FROM pool_members pm
  LEFT JOIN profiles pr ON pr.id = pm.user_id
  JOIN auth.users u ON u.id = pm.user_id
  WHERE pm.pool_id = p_pool AND pp_is_pool_admin(p_pool)
  ORDER BY pm.joined_at;
$$;

REVOKE EXECUTE ON FUNCTION pp_leaderboard(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION pp_admin_participants(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pp_leaderboard(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION pp_admin_participants(uuid) TO authenticated;
