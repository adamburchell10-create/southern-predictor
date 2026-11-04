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

    for (const p of players) {
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
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
