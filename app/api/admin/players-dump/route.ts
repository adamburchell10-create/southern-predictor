import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// Temporary read-only diagnostic: every player, when they joined, and how
// many predictions (scored + unscored) sit under them. Used to check for
// any stray account created by a failed/duplicate rejoin attempt, and to
// read back a player's recovery token (never otherwise exposed again after
// the moment they first joined). Meant to be removed once it's served its
// purpose.
export async function GET() {
  const db = supabaseAdmin();

  const { data: players, error: playersError } = await db
    .from("players")
    .select("id, name, token, created_at")
    .order("created_at", { ascending: true });
  if (playersError) return NextResponse.json({ error: playersError.message }, { status: 500 });

  const { data: preds, error: predsError } = await db.from("predictions").select("player_id, points, updated_at");
  if (predsError) return NextResponse.json({ error: predsError.message }, { status: 500 });

  const byPlayer = new Map<string, { total: number; scored: number; lastUpdated: string | null }>();
  for (const p of preds || []) {
    const entry = byPlayer.get(p.player_id) ?? { total: 0, scored: 0, lastUpdated: null };
    entry.total += 1;
    if (p.points !== null) entry.scored += 1;
    if (!entry.lastUpdated || p.updated_at > entry.lastUpdated) entry.lastUpdated = p.updated_at;
    byPlayer.set(p.player_id, entry);
  }

  const result = (players || []).map((p: { id: string; name: string; token: string; created_at: string }) => ({
    id: p.id,
    name: p.name,
    token: p.token,
    created_at: p.created_at,
    predictions: byPlayer.get(p.id) ?? { total: 0, scored: 0, lastUpdated: null },
  }));

  return NextResponse.json({ players: result });
}
