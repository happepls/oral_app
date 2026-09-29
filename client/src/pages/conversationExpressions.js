export function isCurrentExpression(payload, task, generations, scenario) {
  const generation = generations.get(String(task?.id)) ?? task?.scoring_generation;
  return !!payload && !!task && task.status !== 'completed'
    && payload.scenario === scenario && String(payload.task_id) === String(task.id)
    && Number.isInteger(generation) && Number.isInteger(payload.scoring_generation)
    && payload.scoring_generation === generation
    && typeof payload.turn_id === 'string' && !!payload.turn_id
    && ['correct', 'polish', 'advance', 'clarify'].includes(payload.teaching_mode)
    && Array.isArray(payload.errors) && Array.isArray(payload.alternatives)
    && (payload.teaching_mode === 'clarify'
      ? payload.protocol_version === 2 && payload.alternatives.length === 0 && payload.errors.length === 0
        && typeof payload.clarification_question === 'string' && !!payload.clarification_question.trim()
        && typeof payload.user_text === 'string'
      : [2, 3].includes(payload.alternatives.length))
    && payload.alternatives.every(item => typeof item === 'string' && !!item.trim());
}

export function isCurrentTeachingState(payload, task, generations, scenario, inputId) {
  const generation = generations.get(String(task?.id)) ?? task?.scoring_generation;
  return !!payload && payload.protocol_version === 2 && !!task && task.status !== 'completed'
    && payload.scenario === scenario && String(payload.task_id) === String(task.id)
    && Number.isInteger(generation) && payload.scoring_generation === generation
    && typeof payload.turn_id === 'string' && !!payload.turn_id
    && typeof payload.input_id === 'string' && !!payload.input_id && payload.input_id === inputId
    && ['transcribing', 'analyzing', 'rendering', 'ready', 'retry'].includes(payload.status);
}
