import { scorePrediction, bonusForCorrectCount } from "../lib/scoring";
import { groupIntoRounds } from "../lib/weekGrouping";
import { computeGameweeks } from "../lib/gameweeks";
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

console.log("\n--- weekGrouping.ts: groupIntoRounds with isLive (dead-round splitting) ---");
{
  // Reproduces the real bug: a dead Saturday practice round (no real
  // predictions) would otherwise trap a single live Monday fixture in a
  // "weekend" round by itself, splitting it away from the live Tue/Wed
  // midweek round it's practically part of and costing a bonus tier.
  const items = [
    { id: "sat1", kickoff_at: "2026-09-26T14:00:00.000Z", live: false }, // Sat - dead
    { id: "sat2", kickoff_at: "2026-09-26T14:00:00.000Z", live: false }, // Sat - dead
    { id: "mon1", kickoff_at: "2026-09-28T18:45:00.000Z", live: true }, // Mon - live
    { id: "tue1", kickoff_at: "2026-09-29T14:00:00.000Z", live: true }, // Tue - live
    { id: "wed1", kickoff_at: "2026-09-30T18:45:00.000Z", live: true }, // Wed - live
  ];
  const rounds = groupIntoRounds(
    items,
    (i) => i.kickoff_at,
    (i) => i.live
  );
  check("splits into 2 rounds (dead Saturday, live Mon+Tue+Wed)", rounds.length, 2);
  const deadRound = rounds.find((r) => r.items.every((i) => !i.live));
  const liveRound = rounds.find((r) => r.items.every((i) => i.live));
  check("dead round keeps just the 2 Saturday fixtures", deadRound?.items.length, 2);
  check("live round folds Mon into the following midweek round", liveRound?.items.length, 3);
  check(
    "live round contains Mon+Tue+Wed, not a Saturday fixture",
    liveRound?.items.map((i) => i.id).sort(),
    ["mon1", "tue1", "wed1"]
  );
}

console.log("\n--- weekGrouping.ts: groupIntoRounds - a single mixed round doesn't cascade ---");
{
  // Reproduces a bug found while building the Weekly tab: a single live
  // day (e.g. someone predicting one far-future fixture early) stuck in
  // an otherwise-dead round used to get folded into the next round, which
  // - if that next round was itself entirely dead, as most future rounds
  // are months before anyone's predicted them - would then look "mixed"
  // too (dead days of its own + the just-folded-in live day) and get
  // folded again, and again, snowballing the same live day through every
  // subsequent dead round all the way to the end of the fixture list and
  // merging a whole season into one bogus round. The fix: decide what's
  // mixed from each round's original makeup, not from what it picks up
  // along the way, so a relocation only ever happens once, one hop.
  const items = [
    { id: "sat1", kickoff_at: "2026-09-26T14:00:00.000Z", live: false }, // Sat - dead
    { id: "mon1", kickoff_at: "2026-09-28T18:45:00.000Z", live: true }, // Mon - live (same weekend round as sat1)
    { id: "tue1", kickoff_at: "2026-09-29T14:00:00.000Z", live: false }, // Tue - dead midweek round
    { id: "wed1", kickoff_at: "2026-09-30T18:45:00.000Z", live: false }, // Wed - dead, same midweek round
    { id: "sat2", kickoff_at: "2026-10-10T14:00:00.000Z", live: false }, // Sat, >2 days later - new dead round
    { id: "sat3", kickoff_at: "2026-10-24T14:00:00.000Z", live: false }, // Sat, >2 days later still - new dead round
    { id: "sat4", kickoff_at: "2026-11-07T14:00:00.000Z", live: false }, // Sat, >2 days later again - new dead round
  ];
  const rounds = groupIntoRounds(
    items,
    (i) => i.kickoff_at,
    (i) => i.live
  );
  check("5 distinct rounds, not one giant merged blob", rounds.length, 5);
  check(
    "fixture counts per round stay small and distinct (no cascade)",
    rounds.map((r) => r.items.length),
    [1, 3, 1, 1, 1]
  );
  const liveRound = rounds.find((r) => r.items.some((i) => i.live));
  check(
    "the live Monday fixture lands in the following midweek round with Tue+Wed, nothing else",
    liveRound?.items.map((i) => i.id).sort(),
    ["mon1", "tue1", "wed1"]
  );
  check("the far-future rounds stay standalone and untouched", rounds[2]?.items[0]?.id, "sat2");
  check("the far-future rounds stay standalone and untouched (middle)", rounds[3]?.items[0]?.id, "sat3");
  check("the far-future rounds stay standalone and untouched (last)", rounds[4]?.items[0]?.id, "sat4");
}

console.log("\n--- gameweeks.ts: computeGameweeks ---");
{
  // Two rounds: a weekend round (Sat+Sun) and a midweek round (Wed), each
  // with its own finished matches and predictions, so per-round standings
  // (and bonus) should be scoped to that round only - not accumulated
  // across rounds.
  const players = [
    { id: "p1", name: "Alice" },
    { id: "p2", name: "Bob" },
  ];
  const matches = [
    { id: "m1", kickoff_at: "2026-09-26T14:00:00.000Z", status: "finished" as const }, // Sat
    { id: "m2", kickoff_at: "2026-09-27T14:00:00.000Z", status: "finished" as const }, // Sun
    { id: "m3", kickoff_at: "2026-09-30T18:45:00.000Z", status: "finished" as const }, // Wed
  ];
  const predictions = [
    { player_id: "p1", match_id: "m1", points: 3 },
    { player_id: "p1", match_id: "m2", points: 1 },
    { player_id: "p2", match_id: "m1", points: 1.5 },
    { player_id: "p1", match_id: "m3", points: 3 },
  ];
  const liveMatchIds = new Set(["m1", "m2", "m3"]);
  const gameweeks = computeGameweeks(matches, predictions, liveMatchIds, players);

  check("splits into 2 gameweeks (weekend, midweek)", gameweeks.length, 2);
  const weekend = gameweeks.find((g) => g.kind === "weekend");
  const midweek = gameweeks.find((g) => g.kind === "midweek");

  const alice = weekend?.standings.find((s) => s.playerId === "p1");
  check("Alice's weekend total is just this round's points (3 + 1), no bonus yet", alice?.total, 4);
  check("Alice's weekend exact count", alice?.exact, 1);
  check("Alice's weekend result count", alice?.result, 1);

  const bob = weekend?.standings.find((s) => s.playerId === "p2");
  check("Bob is seeded with zeros even with just 1 prediction this round", bob?.total, 1.5);

  const aliceMidweek = midweek?.standings.find((s) => s.playerId === "p1");
  check("Alice's midweek total doesn't include her weekend points", aliceMidweek?.total, 3);
  const bobMidweek = midweek?.standings.find((s) => s.playerId === "p2");
  check("Bob is still seeded with zeros in a round he didn't predict", bobMidweek?.total, 0);
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
