/**
 * Superbru-style football prediction scoring.
 *
 *  3 points  - exact score predicted correctly
 *  1.5 points - correct result AND correct goal difference, but not the exact score
 *               (e.g. predicted 2-1, actual 3-2: both home wins by 1 goal)
 *  1 point   - correct result only (right team won, or correctly predicted a draw),
 *               but the goal difference was wrong
 *  0 points  - wrong result
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

  if (predDiff === actualDiff) {
    // Same goal difference implies the same result (win/draw/loss) too.
    return 1.5;
  }

  const resultOf = (diff: number): "home" | "away" | "draw" =>
    diff > 0 ? "home" : diff < 0 ? "away" : "draw";

  if (resultOf(predDiff) === resultOf(actualDiff)) {
    return 1;
  }

  return 0;
}
