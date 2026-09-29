export function isCurrentTeachingState(payload, task, generations, scenario, inputId) {
  const generation = generations.get(String(task?.id)) ?? task?.scoring_generation;
  return !!payload && payload.protocol_version === 2 && !!task && task.status !== 'completed'
    && payload.scenario === scenario && String(payload.task_id) === String(task.id)
    && Number.isInteger(generation) && payload.scoring_generation === generation
    && typeof payload.turn_id === 'string' && !!payload.turn_id
    && typeof payload.input_id === 'string' && !!payload.input_id && payload.input_id === inputId
    && ['transcribing', 'analyzing', 'rendering', 'ready', 'retry'].includes(payload.status);
}
