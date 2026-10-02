// Server-safe rewrite of app/weekUtils.ts's groupByMatchweek(), used to
// figure out which matches belong to the same "gameweek" for bonus-points
// purposes (see app/api/leaderboard/route.ts). Same clustering rule as the
// Predict/Friends UI - weekend fixtures (Fri/Sat/Sun/Mon) cluster together,
// midweek fixtures (Tue/Wed/Thu) cluster together, splitting whenever the
// kind changes or there's a gap of more than 2 days - but computed from
// each kickoff's Europe/London calendar day instead of the server
// process's own timezone (Vercel's serverless functions run in UTC), so
// the grouping always matches what a UK-based friend sees as one
// page/round in the app.
//
// One wrinkle bonus scoring needs that the UI grouping doesn't: an
// optional `isLive` predicate marking which matches actually have real
// predictions on them. Without it, a day with zero real predictions (e.g.
// an old practice round that got wiped in a leaderboard reset) can "trap"
// an adjacent live day in a round of the wrong kind - e.g. a single live
// Monday fixture getting bundled with a long-dead Saturday round instead
// of the midweek round it's practically part of, splitting a player's
// correct-result count across two rounds and costing them a bonus tier.
// When a round ends up mixing dead and live days, the dead days are left
// in a (harmless, contributes-nothing) round of their own, and the live
// days are folded into the very next round instead - falling back to the
// previous round if there is no next one.
//
// That split should only ever kick in for a round that's already been
// played, though - it exists purely to protect bonus scoring for a round
// whose grouping is otherwise settled, from stale "dead" artifacts (wiped
// practice data, old resets). An upcoming round that simply hasn't had all
// of its matches predicted yet (totally normal - people predict close to
// kickoff, not the moment fixtures are known) is not "mixed" in that
// sense, and splitting it apart would be wrong: e.g. a Tue+Wed midweek
// round where only the Wednesday match has a prediction in so far would
// otherwise get prised apart, with Wednesday relocated into a following
// weekend round it has nothing to do with, purely because Tuesday hadn't
// been predicted on yet. The optional `isFinished` predicate marks which
// matches have actually been played; a round is only eligible for the
// dead/live split if at least one of its matches has.

const LONDON_TZ = "Europe/London";

const dayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const weekdayFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TZ,
  weekday: "short",
});

function londonDayKey(iso: string): string {
  const parts = dayFormatter.formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function londonIsWeekend(iso: string): boolean {
  const wd = weekdayFormatter.format(new Date(iso));
  // Fri, Sat, Sun, Mon all count as "weekend" fixtures.
  return wd === "Fri" || wd === "Sat" || wd === "Sun" || wd === "Mon";
}

function daysBetweenDayKeys(a: string, b: string): number {
  const toUtcMidnight = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  return Math.round((toUtcMidnight(b) - toUtcMidnight(a)) / MS_PER_DAY);
}

export interface Round<T> {
  key: string; // UK calendar day (YYYY-MM-DD) of the round's earliest fixture
  kind: "weekend" | "midweek";
  items: T[];
}

interface DayBucket<T> {
  key: string;
  items: T[];
  live: boolean;
  finished: boolean;
}

interface Group<T> {
  kind: "weekend" | "midweek";
  lastDayKey: string;
  days: DayBucket<T>[];
}

export function groupIntoRounds<T>(
  items: T[],
  getKickoffIso: (item: T) => string,
  isLive: (item: T) => boolean = () => true,
  isFinished: (item: T) => boolean = () => false
): Array<Round<T>> {
  // 1. Bucket fixtures by UK calendar day, noting which days have any
  // "live" (e.g. actually-predicted) activity, and which have actually
  // been played.
  const byDay = new Map<string, DayBucket<T>>();
  for (const item of items) {
    const key = londonDayKey(getKickoffIso(item));
    if (!byDay.has(key)) byDay.set(key, { key, items: [], live: false, finished: false });
    const bucket = byDay.get(key)!;
    bucket.items.push(item);
    if (isLive(item)) bucket.live = true;
    if (isFinished(item)) bucket.finished = true;
  }
  const days = Array.from(byDay.values()).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // 2. Merge consecutive days of the same kind (weekend/midweek) into
  // rounds, splitting whenever the kind changes or there's a gap of more
  // than 2 days since the previous fixture day.
  const groups: Group<T>[] = [];
  for (const day of days) {
    const kind: "weekend" | "midweek" = londonIsWeekend(getKickoffIso(day.items[0])) ? "weekend" : "midweek";
    const last = groups[groups.length - 1];
    const canMerge = last !== undefined && last.kind === kind && daysBetweenDayKeys(last.lastDayKey, day.key) <= 2;

    if (canMerge && last) {
      last.days.push(day);
      last.lastDayKey = day.key;
    } else {
      groups.push({ kind, lastDayKey: day.key, days: [day] });
    }
  }

  // 3. Split dead days out of any round that mixes dead and live days, and
  // fold the live days into the next round (or the previous one, if this
  // is the last round) - in a single hop, based on each round's ORIGINAL
  // composition (snapshotted below) rather than by mutating `groups` in
  // place as we go. That distinction matters once there's a long run of
  // entirely-dead future rounds (e.g. a whole season's worth of unplayed
  // fixtures with no predictions yet): mutating in place let a single
  // relocated live day get re-detected as "mixed" in the round it just
  // landed in and get kicked forward again on the very next loop
  // iteration, cascading the same live day through every subsequent dead
  // round until it finally lodged in some unrelated round near the end of
  // the season. Snapshotting first means a round's relocation is decided
  // once, from how it actually looked before any relocation happened, so
  // it can never be re-triggered by a hand-me-down from its neighbour.
  const hasFinished = groups.map((g) => g.days.some((d) => d.finished));
  const ownDead = groups.map((g, i) => (hasFinished[i] ? g.days.filter((d) => !d.live) : []));
  const ownLive = groups.map((g, i) => (hasFinished[i] ? g.days.filter((d) => d.live) : []));

  const finalDays: DayBucket<T>[][] = groups.map((g, i) => (hasFinished[i] ? [...ownDead[i]] : [...g.days]));
  const extraGroups: Group<T>[] = [];

  for (let i = 0; i < groups.length; i++) {
    if (!hasFinished[i]) continue; // nothing played yet in this round - no bonus to protect, leave its natural grouping alone

    if (ownDead[i].length === 0 || ownLive[i].length === 0) {
      // Not mixed - a purely-live round's days weren't seeded above, so
      // add them back; a purely-dead round needs no change.
      if (ownDead[i].length === 0) finalDays[i].push(...ownLive[i]);
      continue;
    }
    // Mixed: this round's live days move out, one hop, to the next round
    // (or the previous one, or a new standalone round of their own).
    if (i + 1 < groups.length) finalDays[i + 1].push(...ownLive[i]);
    else if (i - 1 >= 0) finalDays[i - 1].push(...ownLive[i]);
    else extraGroups.push({ kind: groups[i].kind, lastDayKey: groups[i].lastDayKey, days: ownLive[i] });
  }

  const finalGroups = groups
    .map((g, i) => ({ kind: g.kind, lastDayKey: g.lastDayKey, days: finalDays[i] }))
    .concat(extraGroups);

  return finalGroups
    .filter((g) => g.days.length > 0)
    .map((g) => {
      const sortedDays = [...g.days].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
      return { key: sortedDays[0].key, kind: g.kind, items: sortedDays.flatMap((d) => d.items) };
    });
}
