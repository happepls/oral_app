export const MAX_GOAL_SCENARIOS = 12;

export const scenarioTaskText = task => typeof task === 'string' ? task : task?.text || task?.task_description || '';
export const isScenarioLocked = scenario => scenario.tasks?.some(task => task?.status === 'completed');

export function scenarioPayload(scenarios) {
  return scenarios.map(scenario => ({
    title: scenario.title.trim(),
    tasks: scenario.tasks.map(task => scenarioTaskText(task).trim()),
    ...(scenario.image_url ? { image_url: scenario.image_url } : {}),
  }));
}

export function validateGoalScenarios(scenarios, t) {
  const errors = {};
  if (!scenarios.length || scenarios.length > MAX_GOAL_SCENARIOS) {
    errors.scenarios = t('qa_ui.scenario_count_error');
  }
  const titles = new Set();
  scenarios.forEach((scenario, index) => {
    const title = scenario.title.trim();
    if (!title || [...title].length > 100) errors[`scenarios.${index}.title`] = t('qa_ui.scenario_title_error');
    else if (titles.has(title)) errors[`scenarios.${index}.title`] = t('qa_ui.scenario_duplicate_title');
    titles.add(title);
    const tasks = scenario.tasks.map(task => scenarioTaskText(task).trim());
    if (tasks.length !== 3) errors[`scenarios.${index}.tasks`] = t('qa_ui.scenario_tasks_error');
    tasks.forEach((task, taskIndex) => {
      if (!task || [...task].length > 300) errors[`scenarios.${index}.tasks.${taskIndex}`] = t('qa_ui.scenario_task_error');
      else if (tasks.indexOf(task) !== taskIndex) errors[`scenarios.${index}.tasks.${taskIndex}`] = t('qa_ui.scenario_duplicate_task');
    });
  });
  return errors;
}

export function changedProgressScenarios(original, edited) {
  return original.filter(scenario => !isScenarioLocked(scenario) && scenario.tasks?.some(task => (
    (Number(task?.score) > 0 || Number(task?.interaction_count) > 0)
    && !edited.some(next => next.title.trim() === scenario.title.trim()
      && next.tasks.some(text => scenarioTaskText(text).trim() === scenarioTaskText(task).trim()))
  )));
}

const updatePrefix = userId => `goal_scenarios_updated:${userId}:`;
const eventName = 'goal-scenarios-updated';

export function publishGoalScenariosUpdate(userId, goalId) {
  const detail = { userId: String(userId), goalId: String(goalId), revision: `${Date.now()}-${Math.random()}` };
  try { localStorage.setItem(`${updatePrefix(userId)}${goalId}`, JSON.stringify(detail)); } catch { /* Storage can be disabled. */ }
  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

export function subscribeGoalScenariosUpdates(userId, getGoalId, onChange) {
  const pendingGoals = new Set();
  const accept = value => {
    if (value?.userId !== String(userId) || !value?.goalId) return;
    if (getGoalId() == null) pendingGoals.add(value.goalId);
    else if (value.goalId === String(getGoalId())) onChange();
  };
  const local = event => accept(event.detail);
  const storage = event => {
    if (!event.key?.startsWith(updatePrefix(userId)) || !event.newValue) return;
    try { accept(JSON.parse(event.newValue)); } catch { /* Ignore malformed storage events. */ }
  };
  window.addEventListener(eventName, local);
  window.addEventListener('storage', storage);
  const unsubscribe = () => {
    window.removeEventListener(eventName, local);
    window.removeEventListener('storage', storage);
  };
  // A goal request can still be in flight when another tab saves. Check queued
  // notices as soon as the authoritative goal ID becomes known, before WS setup.
  unsubscribe.check = () => {
    if (pendingGoals.delete(String(getGoalId()))) onChange();
  };
  return unsubscribe;
}
