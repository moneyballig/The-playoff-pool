/*
# THE PLAYOFF POOL — pick keys for reseeding-aware picks

1. Modified Tables
- `bracket_picks` — replaced `game_id` with `pick_key` (text). Wild card picks use the real game uuid as the key. Later rounds use stable virtual keys so a participant's picks follow NFL reseeding based on THEIR OWN projected pairings:
  - 'div-AFC-1' / 'div-NFC-1' — the game where the conference #1 seed hosts the lowest remaining seed.
  - 'div-AFC-2' / 'div-NFC-2' — the other divisional pairing in that conference.
  - 'conf-AFC' / 'conf-NFC' — conference championship winners.
  - 'sb' — super bowl winner.
  A pick only scores when its team actually plays in (and wins) the corresponding real game — if an earlier pick lost in reality, the dependent pick is dead and scores nothing.

2. Updated Functions
- `pp_save_picks` — accepts [{ pick_key, team_id }] payloads.
- `pp_submit_bracket` — requires 13 picks.
- `pp_recalc_scores` — scores virtual picks against real finals with the participation rule above.
- New helper `pp_pick_keys_valid()` not needed; validation happens in save/submit.

No data loss: table is new/empty in this project.
*/

DROP TABLE IF EXISTS bracket_picks;
CREATE TABLE bracket_picks (
  bracket_id uuid NOT NULL REFERENCES brackets(id) ON DELETE CASCADE,
  pick_key text NOT NULL,
  team_id uuid NOT NULL REFERENCES playoff_teams(id),
  PRIMARY KEY (bracket_id, pick_key)
);

CREATE INDEX IF NOT EXISTS idx_picks_bracket ON bracket_picks(bracket_id);

ALTER TABLE bracket_picks ENABLE ROW LEVEL SECURITY;

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

GRANT SELECT, INSERT, UPDATE, DELETE ON bracket_picks TO authenticated;

CREATE OR REPLACE FUNCTION pp_save_picks(p_bracket uuid, p_picks jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b brackets%ROWTYPE;
  rec record;
  v_team uuid;
BEGIN
  SELECT * INTO b FROM brackets WHERE id = p_bracket AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Bracket not found'; END IF;
  IF b.frozen THEN RAISE EXCEPTION 'Bracket is locked'; END IF;

  FOR rec IN SELECT * FROM jsonb_array_elements(p_picks) AS item
  LOOP
    IF (rec.item->>'pick_key') IS NULL OR (rec.item->>'pick_key') = '' THEN
      RAISE EXCEPTION 'Invalid pick payload';
    END IF;
    v_team := (rec.item->>'team_id')::uuid;
    IF v_team IS NULL THEN
      RAISE EXCEPTION 'Invalid pick payload';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM playoff_teams WHERE id = v_team) THEN
      RAISE EXCEPTION 'Unknown team';
    END IF;
  END LOOP;

  FOR rec IN SELECT * FROM jsonb_array_elements(p_picks) AS item
  LOOP
    INSERT INTO bracket_picks (bracket_id, pick_key, team_id)
    VALUES (p_bracket, rec.item->>'pick_key', (rec.item->>'team_id')::uuid)
    ON CONFLICT (bracket_id, pick_key) DO UPDATE SET team_id = excluded.team_id;
  END LOOP;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION pp_submit_bracket(p_bracket uuid, p_tiebreaker int)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b brackets%ROWTYPE;
  p pools%ROWTYPE;
  v_picks int;
BEGIN
  SELECT * INTO b FROM brackets WHERE id = p_bracket AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Bracket not found'; END IF;
  IF b.frozen THEN RAISE EXCEPTION 'Bracket already locked'; END IF;

  SELECT * INTO p FROM pools WHERE id = b.pool_id;

  IF p.deadline IS NOT NULL AND now() > p.deadline THEN
    RAISE EXCEPTION 'The submission deadline has passed';
  END IF;

  SELECT count(*) INTO v_picks FROM bracket_picks WHERE bracket_id = p_bracket;
  IF v_picks < 13 THEN
    RAISE EXCEPTION 'All 13 picks must be made before submitting';
  END IF;

  UPDATE brackets
  SET submitted = true,
      submitted_at = now(),
      frozen = true,
      tiebreaker_points = p_tiebreaker
  WHERE id = p_bracket;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION pp_recalc_scores(p_season int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- For every bracket and every FINAL game, find the participant's predicted
  -- winner for that game and whether it was correct.
  CREATE TEMP TABLE tmp_score ON COMMIT DROP AS
  WITH teams AS (
    SELECT id, seed, conference FROM playoff_teams WHERE season = p_season
  ),
  game_key AS (
    -- map each final real game to the virtual pick key it corresponds to
    SELECT g.id,
      CASE g.round
        WHEN 'wild_card' THEN g.id::text
        WHEN 'divisional' THEN
          CASE
            WHEN h.seed = 1 OR a.seed = 1 THEN 'div-' || g.conference || '-1'
            ELSE 'div-' || g.conference || '-2'
          END
        WHEN 'conference' THEN 'conf-' || g.conference
        WHEN 'super_bowl' THEN 'sb'
      END AS pick_key,
      g.round,
      CASE g.round WHEN 'wild_card' THEN 1 WHEN 'divisional' THEN 2 WHEN 'conference' THEN 4 WHEN 'super_bowl' THEN 8 END AS pts,
      g.winner_team_id,
      g.home_team_id,
      g.away_team_id
    FROM playoff_games g
    LEFT JOIN teams h ON h.id = g.home_team_id
    LEFT JOIN teams a ON a.id = g.away_team_id
    WHERE g.season = p_season AND g.status = 'final' AND g.winner_team_id IS NOT NULL
  ),
  outcomes AS (
    SELECT
      bp.bracket_id,
      k.round,
      k.pts,
      (bp.team_id = k.winner_team_id
       AND (k.round = 'wild_card' OR bp.team_id IN (k.home_team_id, k.away_team_id))) AS correct
    FROM bracket_picks bp
    JOIN brackets b ON b.id = bp.bracket_id
    JOIN pools p ON p.id = b.pool_id AND p.season = p_season
    JOIN game_key k ON k.pick_key = bp.pick_key
  )
  SELECT
    bracket_id,
    coalesce(sum(pts) FILTER (WHERE correct), 0) AS pts,
    coalesce(count(*) FILTER (WHERE correct), 0) AS correct,
    coalesce(count(*) FILTER (WHERE round = 'wild_card' AND correct), 0) AS wc,
    coalesce(count(*) FILTER (WHERE round = 'divisional' AND correct), 0) AS dv,
    coalesce(count(*) FILTER (WHERE round = 'conference' AND correct), 0) AS cf,
    coalesce(count(*) FILTER (WHERE round = 'super_bowl' AND correct), 0) AS sb
  FROM outcomes
  GROUP BY bracket_id;

  -- Actual super bowl combined score for the tiebreaker
  CREATE TEMP TABLE tmp_sb ON COMMIT DROP AS
  SELECT coalesce(sum(home_score + away_score), 0)::int AS total
  FROM playoff_games
  WHERE season = p_season AND round = 'super_bowl' AND status = 'final';

  -- Reset all brackets for the season, then apply computed scores
  UPDATE brackets b
  SET total_points = 0, correct_picks = 0, wc_points = 0, div_points = 0,
      conf_points = 0, sb_points = 0, rank = NULL
  FROM pools p
  WHERE p.id = b.pool_id AND p.season = p_season;

  WITH ranked AS (
    SELECT
      s.bracket_id,
      s.pts, s.correct, s.wc, s.dv, s.cf, s.sb,
      dense_rank() OVER (
        ORDER BY s.pts DESC,
          abs(coalesce(b.tiebreaker_points, 100000) - (SELECT total FROM tmp_sb)) ASC
      ) AS rnk
    FROM tmp_score s
    JOIN brackets b ON b.id = s.bracket_id
  )
  UPDATE brackets b
  SET total_points = r.pts,
      correct_picks = r.correct,
      wc_points = r.wc,
      div_points = r.dv,
      conf_points = r.cf,
      sb_points = r.sb,
      rank = CASE WHEN r.pts > 0 THEN r.rnk ELSE NULL END
  FROM ranked r
  WHERE b.id = r.bracket_id;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_game_result ON playoff_games;
CREATE OR REPLACE FUNCTION pp_sync_game_result()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_season int;
  v_winner uuid;
BEGIN
  v_season := NEW.season;
  v_winner := NEW.winner_team_id;

  IF NEW.status = 'final' AND v_winner IS NULL
     AND NEW.home_score IS NOT NULL AND NEW.away_score IS NOT NULL THEN
    v_winner := CASE WHEN NEW.home_score > NEW.away_score THEN NEW.home_team_id ELSE NEW.away_team_id END;
    UPDATE playoff_games SET winner_team_id = v_winner WHERE id = NEW.id;
  END IF;

  PERFORM pp_recalc_scores(v_season);
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_game_result
AFTER INSERT OR UPDATE ON playoff_games
FOR EACH ROW EXECUTE FUNCTION pp_sync_game_result();
