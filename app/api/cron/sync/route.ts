import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { scrapeLeague } from "@/lib/scraper";
import { scorePrediction } from "@/lib/scoring";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const provided = req.headers.get("x-cron-secret");
  if (!secret || provided !== secret) return unauthorized();

  const leagueSlug = process.env.LEAGUE_SLUG || "southern-football-league-division-one-central";
  const db = supabaseAdmin();

  const scraped = await scrapeLeague(leagueSlug);

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
  }

  // Recompute points for every prediction attached to a finished match with
  // a final score. This is cheap for a small friends league and means a
  // correction to a scoreline (or a re-run of this job) always self-heals
  // the leaderboard rather than drifting out of sync.
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
        const { error: updateError } = await db
          .from("predictions")
          .update({ points })
          .eq("id", pred.id);
        if (!updateError) scored += 1;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    matchesScraped: scraped.length,
    matchesUpserted: upserted,
    finishedMatches: finishedMatches?.length ?? 0,
    predictionsScored: scored,
    ranAt: new Date().toISOString(),
  });
}

// Handy for manually checking the endpoint is alive (doesn't run the sync).
export async function GET() {
  return NextResponse.json({ ok: true, message: "POST with x-cron-secret header to run a sync." });
}
