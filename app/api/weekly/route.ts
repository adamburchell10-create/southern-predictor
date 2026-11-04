import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { fetchAllRows } from "@/lib/fetchAll";
import { computeGameweeks, type GameweekMatch, type GameweekPrediction, type PlayerRow } from "@/lib/gameweeks";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = supabaseAdmin();

  try {
    const players = await fetchAllRows<PlayerRow>(() => db.from("players").select("id, name"));

    const predictions = await fetchAllRows<GameweekPrediction>(() =>
      db.from("predictions").select("player_id, match_id, points").not("points", "is", null)
    );

    const matches = await fetchAllRows<GameweekMatch>(() =>
      db.from("matches").select("id, kickoff_at, status")
    );

    const livePredictionData = await fetchAllRows<{ match_id: string }>(() =>
      db.from("predictions").select("match_id")
    );

    const liveMatchIds = new Set(livePredictionData.map((r) => r.match_id));

    const gameweeks = computeGameweeks(matches, predictions, liveMatchIds, players);

    return NextResponse.json({ gameweeks });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
