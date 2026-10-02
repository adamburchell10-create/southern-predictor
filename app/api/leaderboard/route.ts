import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeGameweeks, type GameweekMatch, type GameweekPrediction, type PlayerRow } from "@/lib/gameweeks";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabaseAdmin();

  const { data: players, error: playersError } = await db.from("players").select("id, name");
  if (playersError) {
    return NextResponse.json({ error: playersError.message }, { status: 500 });
  }

  // Only predictions tied to a finished match carry a score, so summing
  // `points` across every prediction always gives an up-to-date table -
  // there's nothing to "close out" for a matchweek, it just accrues.
  const { data: predictionData, error: predictionsError } = await db
    .from("predictions")
    .select("player_id, match_id, points")
    .not("points", "is", null);

  if (predictionsError) {
    return NextResponse.json({ error: predictionsError.message }, { status: 500 });
  }

  const { data: matchData, error: matchesError } = await db
    .from("matches")
    .select("id, kickoff_at, status");

  if (matchesError) {
    return NextResponse.json({ error: matchesError.message }, { status: 500 });
  }

  // Every prediction regardless of whether it's been scored yet, just to
  // know which matches (and so which calendar days) have any real
  // prediction activity at all - see the big comment on groupIntoRounds for
  // why that matters (a wiped practice round shouldn't be able to trap a
  // live fixture in a round of the wrong kind).
  const { data: livePredictionData, error: livePredictionsError } = await db
    .from("predictions")
    .select("match_id");

  if (livePredictionsError) {
    return NextResponse.json({ error: livePredictionsError.message }, { status: 500 });
  }

  const matches = (matchData || []) as unknown as GameweekMatch[];
  const predictions = (predictionData || []) as unknown as GameweekPrediction[];
  const playerRows = (players || []) as unknown as PlayerRow[];
  const liveMatchIds = new Set((livePredictionData || []).map((r: { match_id: string }) => r.match_id));

  // The overall leaderboard is just every gameweek's standings (computed the
  // same way, and from the same round boundaries, as the per-round Weekly
  // tab) summed up into a season-long tally - see lib/gameweeks.ts.
  const gameweeks = computeGameweeks(matches, predictions, liveMatchIds, playerRows);

  const totals = new Map<
    string,
    {
      name: string;
      totalPoints: number;
      bonus: number;
      exact: number;
      close: number;
      correct: number;
      played: number;
    }
  >();

  for (const p of playerRows) {
    totals.set(p.id, { name: p.name, totalPoints: 0, bonus: 0, exact: 0, close: 0, correct: 0, played: 0 });
  }

  for (const gw of gameweeks) {
    for (const s of gw.standings) {
      const entry = totals.get(s.playerId);
      if (!entry) continue;
      entry.totalPoints += s.total;
      entry.bonus += s.bonus;
      entry.exact += s.exact;
      entry.close += s.close;
      entry.correct += s.result;
      entry.played += s.played;
    }
  }

  const leaderboard = Array.from(totals.entries())
    .map(([playerId, v]) => ({ playerId, ...v }))
    .sort((a, b) => b.totalPoints - a.totalPoints || b.exact - a.exact || b.close - a.close);

  return NextResponse.json({ leaderboard });
}
