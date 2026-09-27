/**
 * Football prediction scoring.
 *
 *  3 points   - exact score predicted correctly
 *  1.5 points - a "close" prediction, which is either of:
 *                 (a) correct goal difference (same margin), e.g. predicted
 *                     2-1, actual 3-2: both home wins by 1 goal, or
 *                 (b) the predicted scoreline is only 1 goal away in total
 *                     from the actual scoreline, e.g. predicted 1-2, actual
 *                     0-2 (home score off by 1, away score exact - one goal
 *                     of total difference), or predicted 2-1, actual 3-1
 *                     (home score off by 1)
 *  1 point    - correct result only (right team won, or correctly predicted
 *               a draw), not covered by either "close" case above
 *  0 points   - wrong result
 */
export function scorePrediction(
  predHome: number,
  predAway: number,
  actualHome: number,
  actualAway: number
): number {
  if (
    !Number.isFinite(predHome) ||
    !Number.isFinite(predAway) ||
    !Number.isFinite(actualHome) ||
    !Number.isFinite(actualAway)
  ) {
    return 0;
  }

  if (predHome === actualHome && predAway === actualAway) {
    return 3;
  }

  const predDiff = predHome - predAway;
  const actualDiff = actualHome - actualAway;
  const sameMargin = predDiff === actualDiff; // implies the same result too

  const resultOf = (diff: number): "home" | "away" | "draw" =>
    diff > 0 ? "home" : diff < 0 ? "away" : "draw";
  const correctResult = resultOf(predDiff) === resultOf(actualDiff);

  // Total goals the prediction was "away" from the actual scoreline, e.g.
  // predicted 1-2 vs actual 0-2 is off by 1 (home only); predicted 2-1 vs
  // actual 3-2 is off by 2 (both scores off by 1 each). Only counts as
  // "close" alongside a correct result - being 1 goal off in total but
  // calling the wrong team to win (or a draw that wasn't) isn't close.
  const totalDistance = Math.abs(predHome - actualHome) + Math.abs(predAway - actualAway);
  const oneGoalOff = totalDistance === 1 && correctResult;

  if (sameMargin || oneGoalOff) {
    return 1.5;
  }

  if (correctResult) {
    return 1;
  }

  return 0;
}
