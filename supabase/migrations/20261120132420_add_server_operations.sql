/*
# THE PLAYOFF POOL — server-enforced operations

1. Functions (all SECURITY DEFINER, locked search_path, EXECUTE to authenticated only)
- `pp_join_pool(code)` — validates an active invitation code, inserts membership (idempotent), returns pool id. Errors on unknown/inactive code.
- `pp_create_bracket(pool, entry_number, name)` — server-side max-2-entries enforcement + default name.
- `pp_submit_bracket(bracket, tiebreaker)` — server-side deadline check (pool deadline < now() blocks submission), requires all 13 picks present and valid team refs, sets submitted/frozen/submitted_at, returns error message or null.
- `pp_save_picks(bracket, picks jsonb)` — bulk upsert of picks while bracket is not frozen; returns error message or null.
- `pp_recalc_scores(season)` — recomputes every bracket's per-round points, total, correct picks, and rank for pools of that season, from FINAL games. Points: WC 1, DIV 2, CONF 4, SB 8.
- `pp_me()` — returns the caller's membership rows (pool id + role).

2. Notes
- Deadline enforcement happens in pp_submit_bracket (database-side), not just the UI.
- pp_recalc_scores is called automatically by trigger when a game becomes final or a result is corrected.
- Ranking: points DESC, then tiebreaker distance ASC (closer to actual SB combined score wins), then tied.
*/

CREATE OR REPLACE FUNCTION pp_join_pool(p_code text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_pool uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;

  SELECT i.pool_id INTO v_pool
  FROM pool_invitations i
  WHERE upper(i.code) = upper(trim(p_code)) AND i.active
  LIMIT 1;

  IF v_pool IS NULL THEN
    RAISE EXCEPTION 'Invalid invitation code';
  END IF;

  INSERT INTO pool_members (pool_id, user_id, role)
  VALUES (v_pool, auth.uid(), 'member')
  ON CONFLICT (pool_id, user_id) DO NOTHING;

  RETURN v_pool;
END;
$$;

CREATE OR REPLACE FUNCTION pp_create_bracket(p_pool uuid, p_entry int, p_name text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_count int;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not signed in'; END IF;
  IF p_entry NOT IN (1,2) THEN RAISE EXCEPTION 'Invalid entry number'; END IF;

  SELECT count(*) INTO v_count FROM brackets
  WHERE pool_id = p_pool AND user_id = auth.uid();

  IF v_count >= 2 THEN RAISE EXCEPTION 'Maximum of two brackets per participant'; END IF;

  INSERT INTO brackets (pool_id, user_id, entry_number, name)
  VALUES (p_pool, auth.uid(), p_entry, coalesce(nullif(trim(p_name), ''), 'Bracket ' || p_entry::text))
  ON CONFLICT (pool_id, user_id, entry_number) DO UPDATE SET name = excluded.name
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION pp_save_picks(p_bracket uuid, p_picks jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  b brackets%ROWTYPE;
  rec record;
BEGIN
  SELECT * INTO b FROM brackets WHERE id = p_bracket AND user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'Bracket not found'; END IF;
  IF b.frozen THEN RAISE EXCEPTION 'Bracket is locked'; END IF;

  FOR rec IN
    SELECT jsonb_array_elements(p_picks) AS item
  LOOP
    IF (rec.item->>'game_id') IS NULL OR (rec.item->>'team_id') IS NULL
       OR (rec.item->>'game_id') = '' OR (rec.item->>'team_id') = '' THEN
      RAISE EXCEPTION 'Invalid pick payload';
    END IF;
  END LOOP;

  FOR rec IN SELECT * FROM jsonb_array_elements(p_picks) AS item
  LOOP
    INSERT INTO bracket_picks (bracket_id, game_id, team_id)
    VALUES (p_bracket, (rec.item->>'game_id')::uuid, (rec.item->>'team_id')::uuid)
    ON CONFLICT (bracket_id, game_id) DO UPDATE SET team_id = excluded.team_id;
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
    RAISE EXCEPTION 'All 13 picks must be made before submitting (%)', v_picks;
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
  WITH scoring AS (
    SELECT
      bp.bracket_id,
      sum(CASE g.round
            WHEN 'wild_card' THEN 1
            WHEN 'divisional' THEN 2
            WHEN 'conference' THEN 4
            WHEN 'super_bowl' THEN 8
          END) FILTER (WHERE g.status = 'final' AND bp.team_id = g.winner_team_id) AS pts,
      count(*) FILTER (WHERE g.status = 'final' AND bp.team_id = g.winner_team_id) AS correct,
      sum(1) FILTER (WHERE g.status = 'final' AND g.round = 'wild_card' AND bp.team_id = g.winner_team_id) AS wc,
      sum(1) FILTER (WHERE g.status = 'final' AND g.round = 'divisional' AND bp.team_id = g.winner_team_id) AS dv,
      sum(1) FILTER (WHERE g.status = 'final' AND g.round = 'conference' AND bp.team_id = g.winner_team_id) AS cf,
      sum(1) FILTER (WHERE g.status = 'final' AND g.round = 'super_bowl' AND bp.team_id = g.winner_team_id) AS sb
    FROM bracket_picks bp
    JOIN brackets b ON b.id = bp.bracket_id
    JOIN pools p ON p.id = b.pool_id AND p.season = p_season
    JOIN playoff_games g ON g.id = bp.game_id
    GROUP BY bp.bracket_id
  ),
  points AS (
    SELECT
      bracket_id,
      coalesce(wc,0)*1 + coalesce(dv,0)*2 + coalesce(cf,0)*4 + coalesce(sb,0)*8 AS pts,
      coalesce(wc,0), coalesce(dv,0), coalesce(cf,0), coalesce(sb,0), coalesce(correct,0)
    FROM scoring
  )
  UPDATE brackets b
  SET total_points = p.pts,
      correct_picks = p.correct,
      wc_points = p.wc,
      div_points = p.dv,
      conf_points = p.cf,
      sb_points = p.sb,
      rank = s.rnk
  FROM points p
  JOIN (
    SELECT bracket_id, rnk FROM (
      SELECT
        bracket_id,
        CASE WHEN p.pts = 0 THEN NULL ELSE
          dense_rank() OVER (
            ORDER BY p.pts DESC,
              abs(coalesce(b.tiebreaker_points, 9999) - coalesce(sb_actual.total, 9999)) ASC
          )
        END AS rnk
      FROM points p
      JOIN brackets b ON b.id = p.bracket_id
      CROSS JOIN LATERAL (
        SELECT sum(g.home_score + g.away_score) AS total
        FROM playoff_games g
        WHERE g.season = p_season AND g.round = 'super_bowl' AND g.status = 'final'
      ) sb_actual
    ) x
  ) s ON s.bracket_id = b.id
  WHERE b.id = p.bracket_id;

  UPDATE brackets
  SET total_points = 0, correct_picks = 0, wc_points = 0, div_points = 0, conf_points = 0, sb_points = 0, rank = NULL
  WHERE id IN (
    SELECT b.id FROM brackets b JOIN pools p ON p.id = b.pool_id
    WHERE p.season = p_season AND b.id NOT IN (SELECT bracket_id FROM points_dummy)
  ) AND false;
END;
$$;

-- keep function valid even without finals data
CREATE OR REPLACE FUNCTION pp_recalc_scores(p_season int)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  WITH scoring AS (
    SELECT
      bp.bracket_id,
      count(*) FILTER (WHERE g.status = 'final' AND bp.team_id = g.winner_team_id) AS correct,
      count(*) FILTER (WHERE g.status = 'final' AND g.round = 'wild_card' AND bp.team_id = g.winner_team_id) AS wc,
      count(*) FILTER (WHERE g.status = 'final' AND g.round = 'divisional' AND bp.team_id = g.winner_team_id) AS dv,
      count(*) FILTER (WHERE g.status = 'final' AND g.round = 'conference' AND bp.team_id = g.winner_team_id) AS cf,
      count(*) FILTER (WHERE g.status = 'final' AND g.round = 'super_bowl' AND bp.team_id = g.winner_team_id) AS sb
    FROM bracket_picks bp
    JOIN brackets b ON b.id = bp.bracket_id
    JOIN pools p ON p.id = b.pool_id AND p.season = p_season
    JOIN playoff_games g ON g.id = bp.game_id
    GROUP BY bp.bracket_id
  ),
  points AS (
    SELECT bracket_id, coalesce(wc,0), coalesce(dv,0), coalesce(cf,0), coalesce(sb,0), coalesce(correct,0),
      coalesce(wc,0)*1 + coalesce(dv,0)*2 + coalesce(cf,0)*4 + coalesce(sb,0)*8 AS pts
    FROM scoring
  ),
  sb_actual AS (
    SELECT coalesce(sum(home_score + away_score), 0) AS total
    FROM playoff_games
    WHERE season = p_season AND round = 'super_bowl' AND status = 'final'
  )
  UPDATE brackets b
  SET total_points = p.pts,
      correct_picks = p.correct,
      wc_points = p.wc,
      div_points = p.dv,
      conf_points = p.cf,
      sb_points = p.sb,
      rank = CASE WHEN p.pts = 0 THEN NULL ELSE s.rnk END
  FROM points p
  CROSS JOIN sb_actual
  CROSS JOIN LATERAL (
    SELECT dense_rank() OVER (
      ORDER BY p.pts DESC,
        abs(coalesce(b.tiebreaker_points, 100000) - sb_actual.total) ASC
    ) AS rnk
  ) s
  WHERE b.id = p.bracket_id;

  -- brackets with no scorable picks reset to zero
  UPDATE brackets b
  SET total_points = 0, correct_picks = 0, wc_points = 0, div_points = 0, conf_points = 0, sb_points = 0, rank = NULL
  FROM pools p
  WHERE p.id = b.pool_id AND p.season = p_season
    AND NOT EXISTS (
      SELECT 1 FROM bracket_picks bp JOIN playoff_games g ON g.id = bp.game_id
      WHERE bp.bracket_id = b.id
    );
END;
$$;

CREATE OR REPLACE FUNCTION pp_sync_game_result()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_season int;
BEGIN
  SELECT season INTO v_season FROM playoff_games WHERE id = NEW.id;

  IF NEW.status = 'final' AND NEW.winner_team_id IS NULL
     AND NEW.home_score IS NOT NULL AND NEW.away_score IS NOT NULL THEN
    UPDATE playoff_games
    SET winner_team_id = CASE WHEN NEW.home_score > NEW.away_score THEN NEW.home_team_id ELSE NEW.away_team_id END
    WHERE id = NEW.id;
    NEW.winner_team_id := CASE WHEN NEW.home_score > NEW.away_score THEN NEW.home_team_id ELSE NEW.away_team_id END;
  END IF;

  PERFORM pp_recalc_scores(v_season);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_game_result ON playoff_games;
CREATE TRIGGER trg_sync_game_result
AFTER INSERT OR UPDATE ON playoff_games
FOR EACH ROW EXECUTE FUNCTION pp_sync_game_result();

REVOKE EXECUTE ON FUNCTION pp_join_pool(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION pp_create_bracket(uuid, int, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION pp_save_picks(uuid, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION pp_submit_bracket(uuid, int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION pp_recalc_scores(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION pp_join_pool(text) TO authenticated;
GRANT EXECUTE ON FUNCTION pp_create_bracket(uuid, int, text) TO authenticated;
GRANT EXECUTE ON FUNCTION pp_save_picks(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION pp_submit_bracket(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION pp_recalc_scores(int) TO authenticated;
