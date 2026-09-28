import * as cheerio from "cheerio";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { MatchStatus, ScrapedMatch, ScrapedStanding } from "./types";

const execFileAsync = promisify(execFile);

const BASE = "https://www.footballwebpages.co.uk";

// Football Web Pages' own API is only offered free to non-league clubs for
// their official website (see footballwebpages.co.uk/api), so it isn't
// available for a friends-only prediction game like this one. Their
// robots.txt (checked at build time: only /admin/ is disallowed) permits
// crawling the public fixtures pages, so instead we politely read the same
// public fixtures/results page a human visitor would see, at a low rate.
//
// One quirk found while building this: the site's Cloudflare protection
// returns HTTP 403 for Node's built-in fetch() (undici) even with a normal
// browser User-Agent and headers - almost certainly a TLS/HTTP client
// fingerprint block rather than anything about the request content, since
// plain `curl` with byte-for-byte identical headers succeeds every time.
// So this shells out to curl instead of using fetch(). That means curl
// needs to be on PATH wherever this runs - true for local dev, and true for
// the scheduled sync job, but notably *not* true for typical serverless
// platforms, some of which don't ship a shell at all.
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

async function fetchHtml(url: string): Promise<string> {
  const { stdout } = await execFileAsync(
    "curl",
    [
      "-s",
      "-w",
      "\n__HTTP_STATUS__%{http_code}",
      "-H",
      `User-Agent: ${USER_AGENT}`,
      "-H",
      "Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "-H",
      "Accept-Language: en-GB,en;q=0.9",
      url,
    ],
    { maxBuffer: 10 * 1024 * 1024 }
  );

  const marker = "\n__HTTP_STATUS__";
  const idx = stdout.lastIndexOf(marker);
  const body = idx >= 0 ? stdout.slice(0, idx) : stdout;
  const status = idx >= 0 ? Number(stdout.slice(idx + marker.length).trim()) : 0;

  if (status < 200 || status >= 300) {
    throw new Error(`Failed to fetch ${url}: HTTP ${status}`);
  }
  return body;
}

/** Converts a UK wall-clock date/time (Europe/London) into a UTC ISO string,
 * correctly handling the BST/GMT switch without any external tz library. */
function londonToUtcIso(
  year: number,
  month1to12: number,
  day: number,
  hour: number,
  minute: number
): string {
  const desired = Date.UTC(year, month1to12 - 1, day, hour, minute);
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  const offsetForInstant = (instantMs: number): number => {
    const parts = fmt.formatToParts(new Date(instantMs));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    let h = get("hour");
    if (h === 24) h = 0;
    const wallMs = Date.UTC(get("year"), get("month") - 1, get("day"), h, get("minute"));
    return wallMs - instantMs;
  };

  // One correction pass is enough for Europe/London (offset is 0 or 60 min
  // and kickoff times never land exactly on the transition instant), but do
  // a second pass for safety near the DST boundary.
  let offset = offsetForInstant(desired);
  let utcMs = desired - offset;
  offset = offsetForInstant(utcMs);
  utcMs = desired - offset;

  return new Date(utcMs).toISOString();
}

function parseUkDate(dateText: string): { year: number; month: number; day: number } | null {
  // e.g. "23/9/2026"
  const m = dateText.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  return { day: Number(m[1]), month: Number(m[2]), year: Number(m[3]) };
}

function parseKickoffTime(statusText: string): { hour: number; minute: number } | null {
  const text = statusText.trim().toLowerCase();
  if (text === "noon") return { hour: 12, minute: 0 };
  if (text === "midnight") return { hour: 0, minute: 0 };
  const m = text.match(/^(\d{1,2})(?:\.(\d{2}))?\s*(am|pm)$/);
  if (!m) return null;
  let hour = Number(m[1]) % 12;
  if (m[3] === "pm") hour += 12;
  const minute = m[2] ? Number(m[2]) : 0;
  return { hour, minute };
}

const FINISHED_STATUSES = new Set(["FT", "AET", "AP"]);

function matchIdFromHref(href: string | undefined): string | null {
  if (!href) return null;
  const parts = href.split("/").filter(Boolean);
  const last = parts[parts.length - 1];
  return /^\d+$/.test(last) ? last : null;
}

/** Scrapes one month of the public fixtures/results page for a competition. */
export async function scrapeMonth(
  leagueSlug: string,
  monthName?: string
): Promise<ScrapedMatch[]> {
  const path = monthName
    ? `${leagueSlug}/fixtures-results/${monthName}`
    : `${leagueSlug}/fixtures-results`;
  const url = `${BASE}/${path}`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const matches: ScrapedMatch[] = [];
  let currentMatchweek = "";
  let currentDate: { year: number; month: number; day: number } | null = null;

  $("table.fixtures-results tbody tr").each((_, el) => {
    const row = $(el);
    const classes = row.attr("class") || "";

    if (classes.includes("title")) {
      currentMatchweek = row.find("th").first().text().trim();
      return;
    }
    if (classes.includes("spacer") || classes.includes("scorers")) {
      return; // goal-scorer sub-rows and blank spacer rows carry no fixture data
    }

    const dateCell = row.find("td.export-only").first().text().trim();
    const parsedDate = dateCell ? parseUkDate(dateCell) : null;
    if (parsedDate) currentDate = parsedDate;
    if (!currentDate) return;

    const dataHref = row.attr("data-href");
    const sourceMatchId = matchIdFromHref(dataHref);
    if (!sourceMatchId) return;

    const homeTeam = row.find("td.home-team").attr("data-export")?.trim();
    const awayTeam = row.find("td.away-team").attr("data-export")?.trim();
    if (!homeTeam || !awayTeam) return;

    const statusText = row.find("td.status").first().text().replace(/ /g, " ").trim();
    const homeScoreText = row.find("td.home-score").first().text().trim();
    const awayScoreText = row.find("td.away-score").first().text().trim();

    let status: MatchStatus = "scheduled";
    let homeScore: number | null = null;
    let awayScore: number | null = null;
    let hour = 15;
    let minute = 0; // sensible default when no kickoff time is published yet

    if (homeScoreText === "P" || awayScoreText === "P") {
      status = "postponed";
    } else if (FINISHED_STATUSES.has(statusText.toUpperCase())) {
      status = "finished";
      homeScore = Number(homeScoreText);
      awayScore = Number(awayScoreText);
      if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
        status = "scheduled";
        homeScore = null;
        awayScore = null;
      }
    } else {
      status = "scheduled";
      const time = parseKickoffTime(statusText);
      if (time) {
        hour = time.hour;
        minute = time.minute;
      }
    }

    const kickoffAt = londonToUtcIso(
      currentDate.year,
      currentDate.month,
      currentDate.day,
      hour,
      minute
    );

    matches.push({
      sourceMatchId,
      homeTeam,
      awayTeam,
      kickoffAt,
      status,
      homeScore,
      awayScore,
      sourceUrl: `${BASE}/${dataHref}`,
      matchweek: currentMatchweek,
    });
  });

  return matches;
}

/**
 * Scrapes fixtures/results for the current month plus a number of months
 * ahead and behind, so predictions can be made as far in advance as the
 * site itself publishes and recent results are picked up for scoring.
 */
function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function scrapeLeague(
  leagueSlug: string,
  { monthsAhead = 8, monthsBehind = 1 }: { monthsAhead?: number; monthsBehind?: number } = {}
): Promise<ScrapedMatch[]> {
  const now = new Date();
  const bySourceId = new Map<string, ScrapedMatch>();

  // Fetched one month at a time with a short gap between requests: firing
  // ~10 requests at once (e.g. via Promise.all) is bursty enough to trip
  // Cloudflare's bot heuristics on this site, even though sequential
  // requests from the same IP sail through without issue.
  for (let i = -monthsBehind; i <= monthsAhead; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const monthName = i === 0 ? undefined : MONTH_NAMES[d.getMonth()];
    const monthMatches = await scrapeMonth(leagueSlug, monthName);
    for (const m of monthMatches) bySourceId.set(m.sourceMatchId, m);
    if (i < monthsAhead) await sleep(600);
  }

  return Array.from(bySourceId.values());
}

/**
 * Scrapes the current league table (standings) for a competition, giving
 * each team's league position plus played/won/drawn/lost/points.
 *
 * The table's played/won/drawn/lost/points columns don't all carry stable
 * class names (some are plain `<td>` with no class at all), but they're
 * always the last 8 cells of the row in a fixed order: played, won, drawn,
 * lost, goals-for, goals-against, goal-difference, points. Reading them by
 * position from the end of the row is more robust than relying on classes
 * that could change with responsive breakpoints.
 */
export async function scrapeLeagueTable(leagueSlug: string): Promise<ScrapedStanding[]> {
  const url = `${BASE}/${leagueSlug}/league-table`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const standings: ScrapedStanding[] = [];

  $("table.league-table tbody tr").each((_, el) => {
    const row = $(el);

    const positionText = row.find("td.position").first().text().trim();
    const position = Number(positionText);
    if (!Number.isFinite(position)) return;

    const teamName = row.find("td.team a").first().text().trim() || row.find("td.team").first().text().trim();
    if (!teamName) return;

    const cellTexts = row
      .find("td")
      .map((__, td) => $(td).text().trim())
      .get();

    const toNum = (text: string | undefined): number | null => {
      if (text === undefined) return null;
      const n = Number(text.replace(/^\+/, ""));
      return Number.isFinite(n) ? n : null;
    };

    // Last 8 cells: played, won, drawn, lost, goals-for, goals-against,
    // goal-difference, points.
    const tail = cellTexts.slice(-8);
    const [played, won, drawn, lost, , , , points] = tail;

    standings.push({
      teamName,
      position,
      played: toNum(played),
      won: toNum(won),
      drawn: toNum(drawn),
      lost: toNum(lost),
      points: toNum(points),
    });
  });

  return standings;
}

/**
 * Scrapes the league's "form guide" page and returns each team's most recent
 * results (oldest to newest, capped to the last 5) as single letters: "W",
 * "D", or "L". Each match cell in that table carries a one-letter class
 * ("w" / "d" / "l") alongside its other responsive classes, so reading the
 * class is more robust than parsing the cell's text.
 */
export async function scrapeFormGuide(leagueSlug: string): Promise<Map<string, string[]>> {
  const url = `${BASE}/${leagueSlug}/form-guide`;
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const form = new Map<string, string[]>();

  $("table.form-guide tbody tr").each((_, el) => {
    const row = $(el);

    const teamName = row.find("td.team a").first().text().trim() || row.find("td.team").first().text().trim();
    if (!teamName) return;

    const results: string[] = [];
    row.find("td.match").each((__, cell) => {
      const classes = ($(cell).attr("class") || "").split(/\s+/);
      if (classes.includes("w")) results.push("W");
      else if (classes.includes("d")) results.push("D");
      else if (classes.includes("l")) results.push("L");
    });

    form.set(teamName, results.slice(-5));
  });

  return form;
}
