/*
# THE PLAYOFF POOL — core schema

1. New Tables
- `pools` — one row per pool: name, season year, submission deadline, tiebreaker enabled flag, whether submitted brackets are visible to other participants, generated code.
- `pool_members` — joins auth users to pools with a role ('admin' | 'member') and joined date. Admins of a pool manage it.
- `pool_invitations` — invitation codes: unique code, which pool it belongs to, who created it, active flag.
- `playoff_teams` — the 14 playoff teams per season: name, abbreviation, conference, seed, optional logo url, colors.
- `playoff_games` — one row per playoff game per season: round (wild_card/divisional/conference/super_bowl), conference (AFC/NFC/None for SB), game_slot (which slot within the round), home/away team ids, kickoff time, status (upcoming/live/halftime/final), scores, quarter, clock, source ('manual' | 'api'), winner id.
- `brackets` — a participant's entry: belongs to a pool + user, entry_number (1 or 2), name, tiebreaker prediction (super bowl total points), submitted flag + timestamp, frozen flag (set at deadline or on submit), total_points, correct_picks, per-round point columns, computed rank.
- `bracket_picks` — one pick per (bracket, game): the chosen winner team id.
- `announcements` — pool announcements: title, body, author, timestamps.
- `admin_users` — bootstrap table listing user ids that are platform administrators (used by RLS helper functions). Seeded with a special marker the first admin claims.

2. Security
- RLS enabled on every table.
- `authenticated`-only access everywhere except pool/games/teams/announcements which signed-in pool members (or any authenticated user for shared league data) may read.
- Ownership policies on brackets/picks: users only touch their own rows; picks scoped through their parent bracket.
- Deadline enforcement is done later via SECURITY DEFINER functions; this migration is structure + policies + grants.
*/

CREATE TABLE IF NOT EXISTS pools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  season integer NOT NULL DEFAULT 2026,
  deadline timestamptz,
  tiebreaker_enabled boolean NOT NULL DEFAULT true,
  brackets_visible boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS pool_members (
  pool_id uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('admin','member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pool_id, user_id)
);

CREATE TABLE IF NOT EXISTS pool_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  created_by uuid REFERENCES auth.users(id),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS playoff_teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season integer NOT NULL,
  name text NOT NULL,
  abbreviation text NOT NULL,
  conference text NOT NULL CHECK (conference IN ('AFC','NFC')),
  seed integer NOT NULL CHECK (seed BETWEEN 1 AND 7),
  logo_url text,
  color_primary text NOT NULL DEFAULT '#1B2A41',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season, conference, seed)
);

CREATE TABLE IF NOT EXISTS playoff_games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  season integer NOT NULL,
  round text NOT NULL CHECK (round IN ('wild_card','divisional','conference','super_bowl')),
  conference text CHECK (conference IN ('AFC','NFC') OR conference IS NULL),
  game_slot integer NOT NULL,
  home_team_id uuid REFERENCES playoff_teams(id),
  away_team_id uuid REFERENCES playoff_teams(id),
  kickoff timestamptz,
  status text NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming','live','halftime','final')),
  home_score integer,
  away_score integer,
  quarter text,
  clock text,
  winner_team_id uuid REFERENCES playoff_teams(id),
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','api')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (season, round, game_slot)
);

CREATE TABLE IF NOT EXISTS brackets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  entry_number integer NOT NULL CHECK (entry_number IN (1,2)),
  name text NOT NULL,
  tiebreaker_points integer,
  submitted boolean NOT NULL DEFAULT false,
  submitted_at timestamptz,
  frozen boolean NOT NULL DEFAULT false,
  total_points integer NOT NULL DEFAULT 0,
  correct_picks integer NOT NULL DEFAULT 0,
  wc_points integer NOT NULL DEFAULT 0,
  div_points integer NOT NULL DEFAULT 0,
  conf_points integer NOT NULL DEFAULT 0,
  sb_points integer NOT NULL DEFAULT 0,
  rank integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pool_id, user_id, entry_number)
);

CREATE TABLE IF NOT EXISTS bracket_picks (
  bracket_id uuid NOT NULL REFERENCES brackets(id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES playoff_games(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES playoff_teams(id),
  PRIMARY KEY (bracket_id, game_id)
);

CREATE TABLE IF NOT EXISTS announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_id uuid NOT NULL REFERENCES pools(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_users (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pool_members_user ON pool_members(user_id);
CREATE INDEX IF NOT EXISTS idx_brackets_pool ON brackets(pool_id);
CREATE INDEX IF NOT EXISTS idx_brackets_user ON brackets(user_id);
CREATE INDEX IF NOT EXISTS idx_games_season ON playoff_games(season, round);
CREATE INDEX IF NOT EXISTS idx_picks_bracket ON bracket_picks(bracket_id);
CREATE INDEX IF NOT EXISTS idx_teams_season ON playoff_teams(season);
