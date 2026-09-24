import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getCurrentPlayer } from "@/lib/player";

export const dynamic = "force-dynamic";

/**
 * Returns predictions for every match, but enforces the core "Superbru" rule
 * server-side: a friend's prediction for a match is only ever included in the
 * response once that match has kicked off. Until then, only the current
 * player's own prediction is returned (plus a count of how many predictions
 * have been made, with no values, so there's still some anticipation).
 */
export async function GET() {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Not joined yet" }, { status: 401 });
  }

  const db = supabaseAdmin();
  const now = Date.now();

  const { data: matches, error: matchesError } = await db
    .from("matches")
    .select("id, kickoff_at")
    .order("kickoff_at", { ascending: true });
  if (matchesError) {
    return NextResponse.json({ error: matchesError.message }, { status: 500 });
  }

  const startedMatchIds = (matches || [])
    .filter((m) => new Date(m.kickoff_at).getTime() <= now)
    .map((m) => m.id);

  const { data: ownPredictions, error: ownError } = await db
    .from("predictions")
    .select("id, match_id, home_pred, away_pred, points, updated_at")
    .eq("player_id", player.id);
  if (ownError) {
    return NextResponse.json({ error: ownError.message }, { status: 500 });
  }

  let othersPredictions: Array<{
    match_id: string;
    home_pred: number;
    away_pred: number;
    points: number | null;
    player: { name: string } | null;
  }> = [];

  if (startedMatchIds.length > 0) {
    const { data, error } = await db
      .from("predictions")
      .select("match_id, home_pred, away_pred, points, player:players(name)")
      .in("match_id", startedMatchIds)
      .neq("player_id", player.id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    othersPredictions = (data || []) as unknown as typeof othersPredictions;
  }

  // For matches that haven't kicked off yet, tell the UI how many friends
  // have already predicted, without leaking what they predicted.
  const notStartedIds = (matches || [])
    .filter((m) => new Date(m.kickoff_at).getTime() > now)
    .map((m) => m.id);

  let pendingCounts: Record<string, number> = {};
  if (notStartedIds.length > 0) {
    const { data, error } = await db
      .from("predictions")
      .select("match_id")
      .in("match_id", notStartedIds);
    if (!error && data) {
      pendingCounts = data.reduce((acc: Record<string, number>, row: { match_id: string }) => {
        acc[row.match_id] = (acc[row.match_id] || 0) + 1;
        return acc;
      }, {});
    }
  }

  return NextResponse.json({
    own: ownPredictions,
    others: othersPredictions,
    pendingCounts,
  });
}

export async function POST(req: NextRequest) {
  const player = await getCurrentPlayer();
  if (!player) {
    return NextResponse.json({ error: "Not joined yet" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const matchId = body.matchId as string | undefined;
  const homePred = Number(body.homePred);
  const awayPred = Number(body.awayPred);

  if (
    !matchId ||
    !Number.isInteger(homePred) ||
    !Number.isInteger(awayPred) ||
    homePred < 0 ||
    awayPred < 0 ||
    homePred > 30 ||
    awayPred > 30
  ) {
    return NextResponse.json({ error: "Invalid prediction" }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: match, error: matchError } = await db
    .from("matches")
    .select("id, kickoff_at")
    .eq("id", matchId)
    .maybeSingle();

  if (matchError || !match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  if (new Date(match.kickoff_at).getTime() <= Date.now()) {
    return NextResponse.json(
      { error: "Kick-off has passed - this prediction is locked." },
      { status: 403 }
    );
  }

  const { error: upsertError } = await db.from("predictions").upsert(
    {
      player_id: player.id,
      match_id: matchId,
      home_pred: homePred,
      away_pred: awayPred,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "player_id,match_id" }
  );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
