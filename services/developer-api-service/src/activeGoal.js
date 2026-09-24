// Read the active goal and every task in one PostgreSQL snapshot. A paginated
// account-wide task list cannot represent the state of a learning session.
async function readActiveGoal(db, userId) {
  const { rows } = await db.query(`
    SELECT g.id, g.type, g.description, g.target_language, g.target_level,
           g.current_proficiency, g.completion_time_days, g.interests,
           g.scenarios, g.status, g.created_at, g.updated_at,
           COALESCE((SELECT json_agg(t ORDER BY t.id) FROM (
             SELECT id, scenario_title, task_description, status, score,
                    interaction_count, scoring_generation, feedback, completed_at
             FROM user_tasks WHERE user_id = $1 AND goal_id = g.id
           ) t), '[]'::json) AS task_states,
           EXISTS(SELECT 1 FROM user_goals WHERE user_id = $1 AND status = 'paused') AS has_other_goals
    FROM user_goals g WHERE g.user_id = $1 AND g.status = 'active'
    ORDER BY g.created_at DESC, g.id DESC LIMIT 1`, [userId]);
  if (!rows[0]) return { goal: null, has_other_goals: false };
  const { task_states: tasks, has_other_goals, ...goal } = rows[0];
  goal.scenarios = (goal.scenarios || []).map(scenario => ({
    ...scenario,
    tasks: (scenario.tasks || []).map(task => {
      const text = typeof task === 'string' ? task : task.text || task.task_description;
      const inScenario = tasks.filter(candidate => candidate.scenario_title === scenario.title);
      // Scenario JSON can retain old IDs when a goal is cloned. Prefer a live
      // ID, then resolve the legacy text against rows belonging to this goal.
      const current = (task.id != null && inScenario.find(candidate => String(candidate.id) === String(task.id)))
        || inScenario.find(candidate => candidate.task_description === text);
      // Missing rows have no authoritative scoring generation; never invent 0.
      const score = Number(current?.score || 0);
      return {
        ...(typeof task === 'object' ? task : {}),
        ...current,
        id: current?.id ?? null,
        text,
        score,
        status: current?.status || 'pending',
        interaction_count: current?.interaction_count ?? 0,
        scoring_generation: current?.scoring_generation ?? null,
        progress: current?.status === 'completed' ? 100 : Math.min(99, Math.round(score / 9 * 100)),
      };
    }),
  }));
  return { goal, has_other_goals };
}

module.exports = { readActiveGoal };
