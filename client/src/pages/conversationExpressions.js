export function isCurrentExpression(payload, task, generations, scenario) {
  const generation = generations.get(String(task?.id)) ?? task?.scoring_generation;
  return !!payload && !!task && task.status !== 'completed'
    && payload.scenario === scenario && String(payload.task_id) === String(task.id)
    && Number.isInteger(generation) && Number.isInteger(payload.scoring_generation)
    && payload.scoring_generation === generation
    && typeof payload.turn_id === 'string' && !!payload.turn_id
    && ['correct', 'polish', 'advance'].includes(payload.teaching_mode)
    && Array.isArray(payload.errors) && Array.isArray(payload.alternatives)
    && [2, 3].includes(payload.alternatives.length)
    && payload.alternatives.every(item => typeof item === 'string' && !!item.trim());
}
