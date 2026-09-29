import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { bonusForCorrectCount } from "@/lib/scoring";
import { groupIntoRounds } from "@/lib/weekGrouping";

export const dynamic = "force-dynamic";

interface PredictionRow {
  player_id: string;
  match_id: string;
  points: number | null;
  player: { name: string } | null;
}

interface MatchRow {
  id: string;
  kickoff_at: string;
  status: "scheduled" | "postponed" | "finished";
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
  const { data: predictionData, error: predictionsError } = await db
    .from("predictions")
    .select("player_id, match_id, points, player:players(name)")
    .not("points", "is", null);

  if (predictionsError) {
    return NextResponse.json({ error: predictionsError.message }, { status: 500 });
  }

  // Every match (any status) is needed to work out which gameweeks are
  // fully decided yet - a gameweek's bonus is only awarded once every
  // fixture in it is finished or postponed (postponed matches get
  // rescheduled into a later gameweek entirely, so they shouldn't hold this
  // one up).
  const { data: matchData, error: matchesError } = await db
    .from("matches")
    .select("id, kickoff_at, status");

  if (matchesError) {
    return NextResponse.json({ error: matchesError.message }, { status: 500 });
  }

  const predictions = (predictionData || []) as unknown as PredictionRow[];
  const matches = (matchData || []) as unknown as MatchRow[];

  const byPlayer = new Map<
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

  for (const p of players || []) {
    byPlayer.set(p.id, { name: p.name, totalPoints: 0, bonus: 0, exact: 0, close: 0, correct: 0, played: 0 });
  }

  for (const row of predictions) {
    const key = row.player_id;
    const name = row.player?.name ?? "Unknown";
    const entry =
      byPlayer.get(key) ?? { name, totalPoints: 0, bonus: 0, exact: 0, close: 0, correct: 0, played: 0 };
    const points = row.points ?? 0;
    entry.totalPoints += points;
    entry.played += 1;
    if (points === 3) entry.exact += 1;
    else if (points === 1.5) entry.close += 1;
    else if (points === 1) entry.correct += 1;
    byPlayer.set(key, entry);
  }

  // Gameweek bonus: group every match into the same weekend/midweek rounds
  // the Predict/Friends tabs page through, then - for each round - count
  // each player's correct-result predictions (points > 0) among that
  // round's *finished* matches only, and award the matching bonus. This is
  // naturally "live": a round's correct-count only ever goes up as more of
  // its fixtures finish (a finished result never gets un-counted), so there
  // is no need to wait for the whole round to be decided before the bonus
  // starts accruing - it just keeps climbing through the week and settles
  // once every fixture in that round has been played. Bonus never rolls
  // over between gameweeks, so each round is scored independently and the
  // results summed.
  const rounds = groupIntoRounds(matches, (m) => m.kickoff_at);

  const predictionsByMatch = new Map<string, PredictionRow[]>();
  for (const row of predictions) {
    const list = predictionsByMatch.get(row.match_id) ?? [];
    list.push(row);
    predictionsByMatch.set(row.match_id, list);
  }

  for (const round of rounds) {
    const finishedMatchIds = new Set(round.items.filter((m) => m.status === "finished").map((m) => m.id));
    if (finishedMatchIds.size === 0) continue;

    const correctCountByPlayer = new Map<string, number>();
    for (const matchId of finishedMatchIds) {
      for (const row of predictionsByMatch.get(matchId) ?? []) {
        if ((row.points ?? 0) > 0) {
          correctCountByPlayer.set(row.player_id, (correctCountByPlayer.get(row.player_id) ?? 0) + 1);
        }
      }
    }

    for (const [playerId, correctCount] of correctCountByPlayer) {
      const bonus = bonusForCorrectCount(correctCount);
      if (bonus === 0) continue;
      const entry = byPlayer.get(playerId);
      if (!entry) continue;
      entry.bonus += bonus;
      entry.totalPoints += bonus;
    }
  }

  const leaderboard = Array.from(byPlayer.entries())
    .map(([playerId, v]) => ({ playerId, ...v }))
    .sort((a, b) => b.totalPoints - a.totalPoints || b.exact - a.exact || b.close - a.close);

  return NextResponse.json({ leaderboard });
}
