const COMPLETION_SCORE = 9;
const MAX_PROGRESS_PER_TURN = 33;

/**
 * Translate the scoring contract into user-facing progress.
 *
 * Scores may jump by as much as five points, but one real interaction must
 * never advance the progress bar by more than 33 percentage points. A task
 * remains at 99% while it is waiting for explicit completion confirmation.
 */
export function calculateTaskProgress({
  score,
  interactionCount,
  taskCompleted = false,
  previousProgress = null,
}) {
  if (taskCompleted) return 100;

  const safeScore = Math.max(0, Number(score) || 0);
  const safeCount = Math.max(0, Number(interactionCount) || 0);
  const scoreProgress = Math.min(100, Math.round((safeScore / COMPLETION_SCORE) * 100));
  const turnCap = Math.min(99, safeCount * MAX_PROGRESS_PER_TURN);
  let progress = Math.min(scoreProgress, turnCap);

  if (previousProgress !== null && previousProgress !== undefined) {
    const previous = Math.max(0, Math.min(99, Number(previousProgress) || 0));
    progress = Math.min(progress, previous + MAX_PROGRESS_PER_TURN);
    // A delayed or duplicate backend snapshot must not move the same task
    // backwards. Task switches reset previousProgress before calling us.
    progress = Math.max(previous, progress);
  }

  return Math.max(0, Math.min(99, progress));
}

export { COMPLETION_SCORE, MAX_PROGRESS_PER_TURN };
