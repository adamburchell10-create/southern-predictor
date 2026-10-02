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

  const gameweeks = computeGameweeks(matches, predictions, liveMatchIds, playerRows);

  return NextResponse.json({ gameweeks });
}
