import { scorePrediction } from "../lib/scoring";
import { scrapeMonth } from "../lib/scraper";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  console.log(`${ok ? "PASS" : "FAIL"} ${label} (got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)})`);
  if (!ok) failures++;
}

console.log("--- scoring.ts ---");
check("exact score", scorePrediction(2, 1, 2, 1), 3);
check("close (same diff, home win)", scorePrediction(2, 1, 3, 2), 1.5);
check("close (same diff, draw)", scorePrediction(0, 0, 2, 2), 1.5);
check("correct result only (home win, wrong diff)", scorePrediction(1, 0, 4, 1), 1);
check("correct result only (away win, wrong diff)", scorePrediction(0, 1, 0, 3), 1);
check("wrong result", scorePrediction(2, 0, 1, 1), 0);
check("wrong result (picked away, actual home)", scorePrediction(0, 2, 2, 0), 0);
check("draw predicted, actual home win", scorePrediction(1, 1, 2, 1), 0);

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
