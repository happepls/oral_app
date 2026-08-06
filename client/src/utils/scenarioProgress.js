const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

export function getTaskPracticeProgress(task) {
  if (!task || typeof task !== 'object') return 0;
  if (task.status === 'completed') return 100;

  const explicitProgress = Number(task.progress);
  const score = Number(task.score);
  const interactionCount = Number(task.interaction_count);
  const hasTrace = (
    ['in_progress', 'active', 'practicing'].includes(task.status)
    || (Number.isFinite(interactionCount) && interactionCount > 0)
    || Boolean(task.feedback)
  );

  let progress = 0;
  if (Number.isFinite(explicitProgress) && explicitProgress > 0) {
    progress = Math.max(progress, explicitProgress);
  }
  if (Number.isFinite(score) && score > 0) {
    progress = Math.max(progress, (score / 9) * 100);
  }
  if (hasTrace) progress = Math.max(progress, 1);
  return clamp(progress, 0, 99);
}

export function calcScenarioProgress(scenario) {
  const tasks = Array.isArray(scenario?.tasks) ? scenario.tasks : [];
  if (tasks.length === 0) return 0;
  const average = tasks.reduce(
    (sum, task) => sum + getTaskPracticeProgress(task),
    0
  ) / tasks.length;
  const rounded = Math.round(average);
  return average > 0 ? Math.max(1, rounded) : 0;
}

export function getScenarioPracticeStatus(scenario) {
  const progress = calcScenarioProgress(scenario);
  if (progress === 100) return 'completed';
  if (progress > 0) return 'in-progress';
  return 'not-started';
}
