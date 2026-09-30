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
  items: T[];
}

export function groupIntoRounds<T>(items: T[], getKickoffIso: (item: T) => string): Array<Round<T>> {
  // 1. Bucket fixtures by UK calendar day.
  const byDay = new Map<string, { key: string; items: T[] }>();
  for (const item of items) {
    const key = londonDayKey(getKickoffIso(item));
    if (!byDay.has(key)) byDay.set(key, { key, items: [] });
    byDay.get(key)!.items.push(item);
  }
  const days = Array.from(byDay.values()).sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));

  // 2. Merge consecutive days of the same kind (weekend/midweek) into
  // rounds, splitting whenever the kind changes or there's a gap of more
  // than 2 days since the previous fixture day.
  const groups: Array<{ key: string; items: T[]; kind: "weekend" | "midweek"; lastDayKey: string }> = [];
  for (const day of days) {
    const kind: "weekend" | "midweek" = londonIsWeekend(getKickoffIso(day.items[0])) ? "weekend" : "midweek";
    const last = groups[groups.length - 1];
    const canMerge = last !== undefined && last.kind === kind && daysBetweenDayKeys(last.lastDayKey, day.key) <= 2;

    if (canMerge && last) {
      last.items.push(...day.items);
      last.lastDayKey = day.key;
    } else {
      groups.push({ key: day.key, items: [...day.items], kind, lastDayKey: day.key });
    }
  }

  return groups.map((g) => ({ key: g.key, items: g.items }));
}
