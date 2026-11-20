export type Round = 'wild_card' | 'divisional' | 'conference' | 'super_bowl';
export type GameStatus = 'upcoming' | 'live' | 'halftime' | 'final';

export interface Pool {
  id: string;
  name: string;
  season: number;
  deadline: string | null;
  tiebreaker_enabled: boolean;
  brackets_visible: boolean;
  created_by: string | null;
  created_at: string;
}

export interface Bracket {
  id: string;
  pool_id: string;
  user_id: string;
  entry_number: 1 | 2;
  name: string;
  tiebreaker_points: number | null;
  submitted: boolean;
  submitted_at: string | null;
  frozen: boolean;
  total_points: number;
  correct_picks: number;
  wc_points: number;
  div_points: number;
  conf_points: number;
  sb_points: number;
  rank: number | null;
  created_at: string;
}

export interface PlayoffTeam {
  id: string;
  season: number;
  name: string;
  abbreviation: string;
  conference: 'AFC' | 'NFC';
  seed: number;
  logo_url: string | null;
  color_primary: string;
}

export interface PlayoffGame {
  id: string;
  season: number;
  round: Round;
  conference: 'AFC' | 'NFC' | null;
  game_slot: number;
  home_team_id: string | null;
  away_team_id: string | null;
  kickoff: string | null;
  status: GameStatus;
  home_score: number | null;
  away_score: number | null;
  quarter: string | null;
  clock: string | null;
  winner_team_id: string | null;
  source: 'manual' | 'api';
  updated_at: string;
}

export interface BracketPick {
  game_id: string;
  team_id: string;
}

export interface LeaderboardRow {
  bracket_id: string;
  entry_number: number;
  entry_name: string;
  user_id: string;
  display_name: string | null;
  total_points: number;
  correct_picks: number;
  wc_points: number;
  div_points: number;
  conf_points: number;
  sb_points: number;
  tiebreaker_points: number | null;
  rank: number | null;
}

export interface Announcement {
  id: string;
  pool_id: string;
  title: string;
  body: string;
  created_by: string | null;
  created_at: string;
}

export interface Profile {
  id: string;
  display_name: string;
  created_at: string;
}

export const ROUND_LABELS: Record<Round, string> = {
  wild_card: 'Wild Card',
  divisional: 'Divisional',
  conference: 'Championships',
  super_bowl: 'Super Bowl',
};

export const ROUND_ORDER: Round[] = ['wild_card', 'divisional', 'conference', 'super_bowl'];

export const ROUND_POINTS: Record<Round, number> = {
  wild_card: 1,
  divisional: 2,
  conference: 4,
  super_bowl: 8,
};

export const TOTAL_PICKS = 13;
