import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

interface Row {
  player_id: string;
  points: number | null;
  player: { name: string } | null;
}

export async function GET() {
  const db = supabaseAdmin();

  const { data: players, error: playersError } = await db.from("players").select("id, name");
  if (playersError) {
    return NextResponse.json({ error: playersError.message }, { status: 500 });
  }

  // Only predictions tied to a finished match carry a score, so summing
  // `points` across every prediction always gives an up-to-date table -
  // there's nothing to "close out" for a matchweek, it just accrues.
  const { data, error } = await db
    .from("predictions")
    .select("player_id, points, player:players(name)")
    .not("points", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data || []) as unknown as Row[];
  const byPlayer = new Map<
    string,
    { name: string; totalPoints: number; exact: number; close: number; correct: number; played: number }
  >();

  for (const p of players || []) {
    byPlayer.set(p.id, { name: p.name, totalPoints: 0, exact: 0, close: 0, correct: 0, played: 0 });
  }

  for (const row of rows) {
    const key = row.player_id;
    const name = row.player?.name ?? "Unknown";
    const entry =
      byPlayer.get(key) ?? { name, totalPoints: 0, exact: 0, close: 0, correct: 0, played: 0 };
    const points = row.points ?? 0;
    entry.totalPoints += points;
    entry.played += 1;
    if (points === 3) entry.exact += 1;
    else if (points === 1.5) entry.close += 1;
    else if (points === 1) entry.correct += 1;
    byPlayer.set(key, entry);
  }

  const leaderboard = Array.from(byPlayer.entries())
    .map(([playerId, v]) => ({ playerId, ...v }))
    .sort((a, b) => b.totalPoints - a.totalPoints || b.exact - a.exact || b.close - a.close);

  return NextResponse.json({ leaderboard });
}
