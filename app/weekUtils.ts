// Shared helpers for grouping fixtures into Monday-start weeks and paging
// between them. Used by both the Predict tab and the Friends tab so the
// week boundaries and labels always agree.

export function startOfWeek(d: Date): string {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // 0 = Monday
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

export function weekLabel(isoWeekStart: string): string {
  const start = new Date(isoWeekStart);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
  return `${fmt(start)} – ${fmt(end)}`;
}

export function isCurrentWeek(isoWeekStart: string): boolean {
  return isoWeekStart === startOfWeek(new Date());
}

export function groupByWeek<T>(items: T[], getDate: (item: T) => string): Array<[string, T[]]> {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = startOfWeek(new Date(getDate(item)));
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(item);
  }
  return Array.from(buckets.entries()).sort(([a], [b]) => (a < b ? -1 : 1));
}

/** Index of the week that should be shown first: the current week if it has
 * any fixtures, otherwise the nearest upcoming week, otherwise the most
 * recent past week, otherwise 0. */
export function defaultWeekIndex(grouped: Array<[string, unknown[]]>): number {
  if (grouped.length === 0) return 0;
  const now = startOfWeek(new Date());
  const idx = grouped.findIndex(([weekKey]) => weekKey >= now);
  return idx === -1 ? grouped.length - 1 : idx;
}
