// Shared helpers for splitting fixtures into "matchweeks" and paging
// between them. Used by both the Predict tab and the Friends tab so the
// boundaries and labels always agree.
//
// A matchweek here isn't a Monday-Sunday calendar week - it's a cluster of
// fixture dates of the same kind (weekend, or midweek) that are close
// together. That's what actually splits a season into rounds for a league
// like this: a Tue/Wed midweek round is its own page, a Sat/Sun weekend
// round is its own page, even when they happen to fall in the same
// calendar week.

export type MatchweekKind = "weekend" | "midweek";

export interface Matchweek<T> {
  key: string; // ISO date of the earliest fixture in the group - stable sort/index key
  label: string;
  kind: MatchweekKind;
  items: T[];
}

function dayKey(d: Date): string {
  // Local calendar day, e.g. "2026-09-23" - grouping is done in the
  // viewer's local time since that's also how kickoff times are displayed.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isWeekendDay(d: Date): boolean {
  const day = d.getDay();
  return day === 0 || day === 6;
}

function daysBetween(a: Date, b: Date): number {
  const MS_PER_DAY = 1000 * 60 * 60 * 24;
  const aMid = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const bMid = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((bMid.getTime() - aMid.getTime()) / MS_PER_DAY);
}

function fmtDay(d: Date): string {
  return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
}

export function groupByMatchweek<T>(items: T[], getDate: (item: T) => string): Array<Matchweek<T>> {
  // 1. Bucket fixtures by local calendar day.
  const byDay = new Map<string, { date: Date; items: T[] }>();
  for (const item of items) {
    const date = new Date(getDate(item));
    const key = dayKey(date);
    if (!byDay.has(key)) byDay.set(key, { date, items: [] });
    byDay.get(key)!.items.push(item);
  }
  const days = Array.from(byDay.values()).sort((a, b) => a.date.getTime() - b.date.getTime());

  // 2. Merge consecutive days of the same kind (weekend/midweek) into
  // rounds, splitting whenever the kind changes or there's a gap of more
  // than 2 days since the previous fixture date.
  const groups: Array<Matchweek<T>> = [];
  for (const day of days) {
    const kind: MatchweekKind = isWeekendDay(day.date) ? "weekend" : "midweek";
    const last = groups[groups.length - 1];
    const lastDay = last?.items.length ? new Date(getDate(last.items[last.items.length - 1])) : null;

    const canMerge =
      last &&
      last.kind === kind &&
      lastDay !== null &&
      daysBetween(lastDay, day.date) <= 2;

    if (canMerge) {
      last.items.push(...day.items);
    } else {
      groups.push({ key: day.date.toISOString(), label: "", kind, items: [...day.items] });
    }
  }

  // 3. Label each group from its actual date range.
  for (const group of groups) {
    const dates = group.items.map((i) => new Date(getDate(i))).sort((a, b) => a.getTime() - b.getTime());
    const first = dates[0];
    const last = dates[dates.length - 1];
    const sameDay = dayKey(first) === dayKey(last);
    group.label = sameDay ? fmtDay(first) : `${fmtDay(first)} – ${fmtDay(last)}`;
  }

  return groups;
}

export function isCurrentMatchweek<T>(group: Matchweek<T>, getDate: (item: T) => string): boolean {
  const today = dayKey(new Date());
  return group.items.some((i) => {
    const d = new Date(getDate(i));
    return dayKey(d) === today;
  });
}

/** Index of the matchweek that should be shown first: the earliest one that
 * isn't entirely in the past, otherwise the most recent past one. */
export function defaultMatchweekIndex<T>(groups: Array<Matchweek<T>>, getDate: (item: T) => string): number {
  if (groups.length === 0) return 0;
  const now = Date.now();
  const idx = groups.findIndex((g) => g.items.some((i) => new Date(getDate(i)).getTime() >= now));
  return idx === -1 ? groups.length - 1 : idx;
}
