export type MatchStatus = "scheduled" | "postponed" | "finished";

export interface ScrapedMatch {
  sourceMatchId: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: string; // ISO string, UTC
  status: MatchStatus;
  homeScore: number | null;
  awayScore: number | null;
  sourceUrl: string;
  matchweek: string; // human label, e.g. "Saturday 26th September 2026"
}

export interface MatchRow {
  id: string;
  source_match_id: string;
  matchweek: string | null;
  home_team: string;
  away_team: string;
  kickoff_at: string;
  status: MatchStatus;
  home_score: number | null;
  away_score: number | null;
  source_url: string | null;
  updated_at: string;
}

export interface PlayerRow {
  id: string;
  name: string;
  token: string;
  created_at: string;
}

export interface PredictionRow {
  id: string;
  player_id: string;
  match_id: string;
  home_pred: number;
  away_pred: number;
  points: number | null;
  updated_at: string;
}
