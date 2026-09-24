/**
 * Standalone fixture/result sync, meant to be run directly with `npx tsx
 * scripts/sync-now.ts` (rather than as a Vercel serverless function).
 *
 * Why this exists as a separate script instead of just calling
 * /api/cron/sync: footballwebpages.co.uk sits behind Cloudflare, and
 * Cloudflare's bot protection returns HTTP 403 for requests from well-known
 * cloud/hosting IP ranges - which includes Vercel's serverless functions
 * *and* GitHub Actions runners (confirmed by testing both directly). A
 * browser User-Agent doesn't help; this is IP-reputation based, not
 * UA-based. So the scrape has to run from somewhere with an ordinary
 * outbound IP - this script is designed to be run from such an environment
 * on a schedule, writing straight into Supabase (the same database the
 * deployed app reads from).
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (and optionally
 * LEAGUE_SLUG) as environment variables.
 */
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { scrapeLeague } from "../lib/scraper";
import { scorePrediction } from "../lib/scoring";

async function main() {
  const leagueSlug = process.env.LEAGUE_SLUG || "southern-football-league-division-one-central";
  const db = supabaseAdmin();

  const scraped = await scrapeLeague(leagueSlug);
  console.log(`Scraped ${scraped.length} matches`);

  let upserted = 0;
  for (const m of scraped) {
    const { error } = await db.from("matches").upsert(
      {
        source_match_id: m.sourceMatchId,
        matchweek: m.matchweek,
        home_team: m.homeTeam,
        away_team: m.awayTeam,
        kickoff_at: m.kickoffAt,
        status: m.status,
        home_score: m.homeScore,
        away_score: m.awayScore,
        source_url: m.sourceUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "source_match_id" }
    );
    if (!error) upserted += 1;
    else console.error("upsert error", m.sourceMatchId, error.message);
  }
  console.log(`Upserted ${upserted} matches`);

  const { data: finishedMatches, error: finishedError } = await db
    .from("matches")
    .select("id, home_score, away_score")
    .eq("status", "finished")
    .not("home_score", "is", null)
    .not("away_score", "is", null);

  let scored = 0;
  if (!finishedError && finishedMatches) {
    for (const match of finishedMatches) {
      const { data: preds, error: predsError } = await db
        .from("predictions")
        .select("id, home_pred, away_pred")
        .eq("match_id", match.id);
      if (predsError || !preds) continue;

      for (const pred of preds) {
        const points = scorePrediction(
          pred.home_pred,
          pred.away_pred,
          match.home_score as number,
          match.away_score as number
        );
        const { error: updateError } = await db.from("predictions").update({ points }).eq("id", pred.id);
        if (!updateError) scored += 1;
      }
    }
  }

  console.log(`Finished matches: ${finishedMatches?.length ?? 0}, predictions (re)scored: ${scored}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
  });
