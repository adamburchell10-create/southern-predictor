// Shared per-gameweek (per-round) standings computation, used by both the
// overall Leaderboard (app/api/leaderboard/route.ts, which sums every
// gameweek's points+bonus into a season-long tally) and the per-round
// Weekly standings tab (app/api/weekly/route.ts, which shows one
// gameweek's standings at a time). Building both from this single module -
// on top of the same groupIntoRounds() round boundaries used for bonus
// scoring - means the two tabs can never drift out of sync with each other:
// a round's bonus here is exactly the bonus counted towards the overall
// tally.

import { bonusForCorrectCount } from "./scoring";
import { groupIntoRounds } from "./weekGrouping";

export interface GameweekMatch {
  id: string;
  kickoff_at: string;
  status: "scheduled" | "postponed" | "finished";
}

export interface GameweekPrediction {
  player_id: string;
  match_id: string;
  points: number | null;
}

export interface PlayerRow {
  id: string;
  name: string;
}

export interface PlayerStanding {
  playerId: string;
  name: string;
  played: number;
  exact: number;
  close: number;
  result: number;
  bonus: number;
  total: number; // sum of this round's match points + this round's bonus
}

export interface Gameweek {
  key: string; // UK calendar day of the round's earliest fixture
  label: string;
  kind: "weekend" | "midweek";
  fixtureCount: number;
  finishedCount: number;
  standings: PlayerStanding[];
}

const LONDON_TZ = "Europe/London";

const dayLabelFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TZ,
  weekday: "short",
  day: "numeric",
  month: "short",
});

const dayKeyFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function londonDayKey(iso: string): string {
  const parts = dayKeyFormatter.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function labelForRound(items: GameweekMatch[]): string {
  const sorted = [...items].sort((a, b) =>
    a.kickoff_at < b.kickoff_at ? -1 : a.kickoff_at > b.kickoff_at ? 1 : 0
  );
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  const firstLabel = dayLabelFormatter.format(new Date(first.kickoff_at));
  if (londonDayKey(first.kickoff_at) === londonDayKey(last.kickoff_at)) return firstLabel;
  return `${firstLabel} – ${dayLabelFormatter.format(new Date(last.kickoff_at))}`;
}

/**
 * Splits every match into its gameweek/round (same boundaries bonus scoring
 * uses), and works out each player's standings - points, exact/close/result
 * breakdown, and bonus - for that round alone. `predictions` should only be
 * the ones that have been scored (points not null); `liveMatchIds` is every
 * match that has at least one real prediction against it (used, as in
 * groupIntoRounds, so a dead practice round can't trap a live fixture in
 * the wrong round). Every player in `players` is seeded into every round
 * with zeros, so the same roster appears on every page even for a round
 * they didn't predict.
 */
export function computeGameweeks(
  matches: GameweekMatch[],
  predictions: GameweekPrediction[],
  liveMatchIds: Set<string>,
  players: PlayerRow[]
): Gameweek[] {
  const rounds = groupIntoRounds(
    matches,
    (m) => m.kickoff_at,
    (m) => liveMatchIds.has(m.id)
  );

  const predictionsByMatch = new Map<string, GameweekPrediction[]>();
  for (const row of predictions) {
    const list = predictionsByMatch.get(row.match_id) ?? [];
    list.push(row);
    predictionsByMatch.set(row.match_id, list);
  }

  return rounds.map((round) => {
    const finishedMatches = round.items.filter((m) => m.status === "finished");

    const byPlayer = new Map<string, PlayerStanding>();
    for (const p of players) {
      byPlayer.set(p.id, {
        playerId: p.id,
        name: p.name,
        played: 0,
        exact: 0,
        close: 0,
        result: 0,
        bonus: 0,
        total: 0,
      });
    }

    const correctCountByPlayer = new Map<string, number>();

    for (const match of finishedMatches) {
      for (const row of predictionsByMatch.get(match.id) ?? []) {
        const entry = byPlayer.get(row.player_id);
        if (!entry) continue; // prediction from a player no longer on the roster
        const pts = row.points ?? 0;
        entry.played += 1;
        entry.total += pts;
        if (pts === 3) entry.exact += 1;
        else if (pts === 1.5) entry.close += 1;
        else if (pts === 1) entry.result += 1;
        if (pts > 0) {
          correctCountByPlayer.set(row.player_id, (correctCountByPlayer.get(row.player_id) ?? 0) + 1);
        }
      }
    }

    for (const [playerId, correctCount] of correctCountByPlayer) {
      const entry = byPlayer.get(playerId);
      if (!entry) continue;
      entry.bonus = bonusForCorrectCount(correctCount);
      entry.total += entry.bonus;
    }

    const standings = Array.from(byPlayer.values()).sort(
      (a, b) => b.total - a.total || b.exact - a.exact || b.close - a.close
    );

    return {
      key: round.key,
      label: labelForRound(round.items),
      kind: round.kind,
      fixtureCount: round.items.length,
      finishedCount: finishedMatches.length,
      standings,
    };
  });
}
