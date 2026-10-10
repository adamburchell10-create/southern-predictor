/**
 * Manual point overrides - exceptions to the normal scorePrediction()
 * formula for specific player+match combinations, set by hand when Adam
 * wants a different result than the formula gives for that one prediction
 * (rather than changing the formula itself, which would re-score every
 * match all season). Keyed by "playerId:matchId". Both scripts/sync-now.ts
 * and app/api/cron/sync/route.ts check this before falling back to
 * scorePrediction(), so an override survives every future sync instead of
 * getting recomputed away.
 */
export const SCORE_OVERRIDES: Record<string, number> = {
  // Austin Lipman (eb1e5ce6-dd76-4a16-84b8-77ffd1f5ed7c) predicted 1-1 for
  // Marlow vs Royston Town (27cd5312-f8c0-4680-b50c-96897175c487), which
  // finished 3-3 on 10 Oct 2026. The formula scores a correct result with
  // matching goal difference as 1.5 ("close") regardless of how far off the
  // actual goal count is - but Adam wants this specific one scored as 1
  // (correct result only), since 1-1 vs 3-3 is too far off in his view to
  // count as "close".
  "eb1e5ce6-dd76-4a16-84b8-77ffd1f5ed7c:27cd5312-f8c0-4680-b50c-96897175c487": 1,
};
