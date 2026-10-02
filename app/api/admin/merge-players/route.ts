import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

// One-off admin endpoint: merges the "Tort" and "Tyler Schmidt" player
// accounts into one. Tort originally joined under that name, got logged
// out (lost the browser token that identified him), and had to rejoin as
// a new player, "Tyler Schmidt" - that's the account he's actively using
// now. This keeps *that* player id/token (so his current session keeps
// working without another rejoin), re-points every one of the old "Tort"
// account's predictions - already-scored and still-upcoming alike - onto
// it, and renames the surviving row back to "Tort". Where both accounts
// happen to have predicted the very same fixture, the more recently
// updated prediction wins (his later, presumably final, call) and the
// loser is reported back rather than silently dropped.
//
// Meant to be run once via a direct POST, then deleted.
export async function POST() {
  const db = supabaseAdmin();

  const { data: players, error: playersError } = await db
    .from("players")
    .select("id, name, name_key, token, created_at")
    .in("name_key", ["tort", "tyler schmidt"]);

  if (playersError) return NextResponse.json({ error: playersError.message }, { status: 500 });

  const keep = (players || []).find((p: { name_key: string }) => p.name_key === "tyler schmidt");
  const old = (players || []).find((p: { name_key: string }) => p.name_key === "tort");

  if (!keep || !old) {
    return NextResponse.json(
      { error: "Expected both a 'Tort' and a 'Tyler Schmidt' player to exist.", found: players },
      { status: 404 }
    );
  }

  const { data: oldPreds, error: oldPredsError } = await db
    .from("predictions")
    .select("id, match_id, home_pred, away_pred, points, updated_at")
    .eq("player_id", old.id);
  if (oldPredsError) return NextResponse.json({ error: oldPredsError.message }, { status: 500 });

  const { data: keepPreds, error: keepPredsError } = await db
    .from("predictions")
    .select("id, match_id, home_pred, away_pred, points, updated_at")
    .eq("player_id", keep.id);
  if (keepPredsError) return NextResponse.json({ error: keepPredsError.message }, { status: 500 });

  interface PredRow {
    id: string;
    match_id: string;
    home_pred: number;
    away_pred: number;
    points: number | null;
    updated_at: string;
  }

  const keepByMatch = new Map<string, PredRow>((keepPreds || []).map((p: PredRow) => [p.match_id, p]));

  let relocated = 0;
  let conflictsOldWon = 0;
  let conflictsKeepWon = 0;
  const conflictDetails: Array<{
    match_id: string;
    old: Omit<PredRow, "id" | "match_id">;
    keep: Omit<PredRow, "id" | "match_id">;
    winner: string;
  }> = [];

  for (const op of (oldPreds || []) as PredRow[]) {
    const existing = keepByMatch.get(op.match_id);

    if (!existing) {
      const { error } = await db.from("predictions").update({ player_id: keep.id }).eq("id", op.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      relocated++;
      continue;
    }

    const oldIsNewer = new Date(op.updated_at).getTime() > new Date(existing.updated_at).getTime();
    conflictDetails.push({
      match_id: op.match_id,
      old: { home_pred: op.home_pred, away_pred: op.away_pred, points: op.points, updated_at: op.updated_at },
      keep: {
        home_pred: existing.home_pred,
        away_pred: existing.away_pred,
        points: existing.points,
        updated_at: existing.updated_at,
      },
      winner: oldIsNewer ? "old (Tort)" : "keep (Tyler Schmidt)",
    });

    if (oldIsNewer) {
      const { error } = await db
        .from("predictions")
        .update({
          home_pred: op.home_pred,
          away_pred: op.away_pred,
          points: op.points,
          updated_at: op.updated_at,
        })
        .eq("id", existing.id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      conflictsOldWon++;
    } else {
      conflictsKeepWon++;
    }
  }

  // Delete the old player row - cascades to remove any prediction still
  // sitting under it (the conflict-losers left in place above).
  const { error: deleteError } = await db.from("players").delete().eq("id", old.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

  const { error: renameError } = await db.from("players").update({ name: "Tort" }).eq("id", keep.id);
  if (renameError) return NextResponse.json({ error: renameError.message }, { status: 500 });

  return NextResponse.json({
    merged: true,
    survivingPlayerId: keep.id,
    oldPredictionCount: (oldPreds || []).length,
    keepPredictionCountBefore: (keepPreds || []).length,
    relocatedPredictions: relocated,
    conflicts: conflictDetails.length,
    conflictsOldWon,
    conflictsKeepWon,
    conflictDetails,
  });
}
