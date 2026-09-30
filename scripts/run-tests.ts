import { scorePrediction, bonusForCorrectCount } from "../lib/scoring";
import { groupIntoRounds } from "../lib/weekGrouping";
import { scrapeMonth } from "../lib/scraper";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
  if (!ok) failures++;
}

console.log("--- scoring.ts ---");
check("exact score", scorePrediction(2, 1, 2, 1), 3);
check("close (same goal difference, home win)", scorePrediction(2, 1, 3, 2), 1.5);
check("close (same goal difference, draw)", scorePrediction(0, 0, 2, 2), 1.5);
check("close (same goal difference, off by 2 total - still same margin)", scorePrediction(1, 3, 0, 2), 1.5);
check(
  "close (1 goal off in total, different margin) - Barton Rovers 0-2, predicted 1-2",
  scorePrediction(1, 2, 0, 2),
  1.5
);
check(
  "close (1 goal off in total, different margin) - MK Irish 3-1, predicted 2-1",
  scorePrediction(2, 1, 3, 1),
  1.5
);
check("correct result only (home win, more than 1 goal off, different margin)", scorePrediction(1, 0, 4, 1), 1);
check("correct result only (away win, more than 1 goal off, different margin)", scorePrediction(0, 1, 0, 3), 1);
check("wrong result", scorePrediction(2, 0, 1, 1), 0);
check("wrong result (picked away, actual home)", scorePrediction(0, 2, 2, 0), 0);
check("draw predicted, actual home win", scorePrediction(1, 1, 2, 1), 0);

console.log("\n--- scoring.ts: bonusForCorrectCount ---");
check("below threshold", bonusForCorrectCount(4), 0);
check("bottom of 5-7 band", bonusForCorrectCount(5), 1);
check("top of 5-7 band", bonusForCorrectCount(7), 1);
check("bottom of 8-9 band", bonusForCorrectCount(8), 2);
check("top of 8-9 band", bonusForCorrectCount(9), 2);
check("10+ band", bonusForCorrectCount(10), 3);
check("more than 10", bonusForCorrectCount(11), 3);
check("zero correct", bonusForCorrectCount(0), 0);

console.log("\n--- weekGrouping.ts: groupIntoRounds ---");
{
  // Fri/Sat/Sun/Mon all count as "weekend" fixtures; only Tue/Wed/Thu are
  // "midweek".
  const items = [
    { id: "a", kickoff_at: "2026-09-25T18:45:00.000Z" }, // Fri - weekend
    { id: "b", kickoff_at: "2026-09-26T14:00:00.000Z" }, // Sat - same weekend round
    { id: "c", kickoff_at: "2026-09-27T14:00:00.000Z" }, // Sun - same weekend round
    { id: "d", kickoff_at: "2026-09-28T18:45:00.000Z" }, // Mon - same weekend round
    { id: "e", kickoff_at: "2026-09-30T18:45:00.000Z" }, // Wed - different kind (midweek), new round
    { id: "f", kickoff_at: "2026-10-10T14:00:00.000Z" }, // Sat, >2 days later - new round
  ];
  const rounds = groupIntoRounds(items, (i) => i.kickoff_at);
  check("groups Fri-Mon weekend + midweek + gap into 3 rounds", rounds.length, 3);
  check("weekend round merges Fri+Sat+Sun+Mon into 4 fixtures", rounds[0]?.items.length, 4);
  check("Wed stays its own midweek round (different kind from Mon)", rounds[1]?.items.length, 1);
  check("gap of >2 days starts a new round", rounds[2]?.items.length, 1);
}

async function testScraper() {
  console.log("\n--- scraper.ts (live network check) ---");
  try {
    const matches = await scrapeMonth("southern-football-league-division-one-central");
    console.log(`Scraped ${matches.length} matches for the current month`);
    if (matches.length === 0) {
      console.log("FAIL scraper returned zero matches");
      failures++;
      return;
    }
    const ids = new Set(matches.map((m) => m.sourceMatchId));
    check("no duplicate source match ids", ids.size, matches.length);

    const sample = matches[0];
    console.log("Sample match:", sample);
    const kickoffValid = !Number.isNaN(new Date(sample.kickoffAt).getTime());
    check("sample kickoff parses as a valid date", kickoffValid, true);

    const finishedWithScore = matches.filter(
      (m) => m.status === "finished" && m.homeScore !== null && m.awayScore !== null
    );
    console.log(`${finishedWithScore.length} finished matches with a score this month`);
  } catch (err) {
    console.log("FAIL scraper threw:", err);
    failures++;
  }
}

testScraper().then(() => {
  console.log(`\n${failures === 0 ? "ALL TESTS PASSED" : `${failures} FAILURE(S)`}`);
  process.exit(failures === 0 ? 0 : 1);
});
