// One projection for list, active-goal and editor responses. Database tasks are
// authoritative; JSONB supplies scenario order and presentation metadata only.
function overlayGoalTasks(goal, dbTasks) {
  if (!Array.isArray(goal.scenarios)) return goal;
  const taskByIdentity = new Map(dbTasks.map(task => [JSON.stringify([task.scenario_title, task.task_description]), task]));
  return {
    ...goal,
    scenarios: goal.scenarios.map(scenario => ({
      ...scenario,
      tasks: scenario.tasks.map(task => {
        const text = typeof task === 'string' ? task : task.text;
        const row = taskByIdentity.get(JSON.stringify([scenario.title, text]));
        const score = row ? row.score : 0;
        return {
          id: row ? row.id : null, text,
          status: row ? row.status : 'pending', score,
          interaction_count: row ? row.interaction_count : 0,
          // Missing persistence is not a valid generation-zero task.
          scoring_generation: row?.scoring_generation ?? null,
          progress: row?.status === 'completed' ? 100 : Math.min(99, Math.round((score / 9) * 100)),
        };
      }),
    })),
  };
}

function conflict(code, message, lockedScenarios) {
  const error = new Error(message);
  error.code = code;
  error.status = 409;
  if (lockedScenarios) error.lockedScenarios = lockedScenarios;
  return error;
}

async function replaceGoalScenarios(db, userId, goalId, scenarios) {
  const client = await db.pool.connect();
  try {
    await client.query('BEGIN');
    const goal = (await client.query(
      'SELECT * FROM user_goals WHERE id = $1 AND user_id = $2 FOR UPDATE', [goalId, userId]
    )).rows[0];
    if (!goal) {
      await client.query('ROLLBACK');
      return null;
    }
    if (!['active', 'paused'].includes(goal.status)) {
      throw conflict('goal_not_editable', '仅进行中或已暂停的目标可以编辑场景');
    }
    // Scoring locks tasks before updating the goal. Never wait for its task
    // lock while holding the goal lock: NOWAIT avoids that reverse-order deadlock.
    const tasks = (await client.query(
      'SELECT * FROM user_tasks WHERE goal_id = $1 ORDER BY id FOR UPDATE NOWAIT', [goalId]
    )).rows;
    const original = Array.isArray(goal.scenarios) ? goal.scenarios : [];
    const texts = scenario => scenario.tasks.map(task => typeof task === 'string' ? task : task.text);
    const unchanged = (a, b) => a && b && a.title === b.title && JSON.stringify(texts(a)) === JSON.stringify(texts(b));
    const locked = [...new Set(tasks.filter(task => task.status === 'completed').map(task => task.scenario_title))];
    const changedLocked = locked.filter(title => !unchanged(
      original.find(scenario => scenario.title === title), scenarios.find(scenario => scenario.title === title)
    ));
    if (changedLocked.length) throw conflict('scenario_locked', '已完成任务的场景不能修改或删除', changedLocked);

    const identity = (title, text) => JSON.stringify([title, text]);
    const requested = new Set(scenarios.flatMap(scenario => scenario.tasks.map(text => identity(scenario.title, text))));
    const removed = tasks.filter(task => !requested.has(identity(task.scenario_title, task.task_description)));
    if (removed.some(task => task.status !== 'pending')) {
      throw conflict('scenario_locked', '只有未完成任务可以修改或删除', [...new Set(removed.map(task => task.scenario_title))]);
    }
    if (removed.length) {
      // New text receives a new ID. Old scoring windows remain tied to deleted
      // IDs, so they cannot award points to replacements even at generation 0.
      // Unchanged identities keep their original ID, score and generation.
      await client.query('DELETE FROM user_tasks WHERE goal_id = $1 AND id = ANY($2::int[]) AND status = $3',
        [goalId, removed.map(task => task.id), 'pending']);
    }
    const retained = new Set(tasks.filter(task => requested.has(identity(task.scenario_title, task.task_description)))
      .map(task => identity(task.scenario_title, task.task_description)));
    for (const scenario of scenarios) {
      for (const text of scenario.tasks) {
        if (!retained.has(identity(scenario.title, text))) {
          await client.query('INSERT INTO user_tasks (user_id, goal_id, scenario_title, task_description) VALUES ($1, $2, $3, $4)',
            [userId, goalId, scenario.title, text]);
        }
      }
    }
    const storedScenarios = scenarios.map(scenario => {
      const old = original.find(item => item.title === scenario.title);
      // Preserve server-side images/metadata if the scenario did not change;
      // a stale editor cannot overwrite a newly generated cover image.
      if (unchanged(old, scenario)) return { ...old, title: scenario.title, tasks: scenario.tasks };
      return { title: scenario.title, tasks: scenario.tasks, ...(scenario.image_url ? { image_url: scenario.image_url } : {}) };
    });
    const updatedTasks = (await client.query('SELECT * FROM user_tasks WHERE goal_id = $1 ORDER BY id', [goalId])).rows;
    // Adding/removing pending tasks changes the denominator used by the existing
    // task-completion flow. Recompute the same completed/total percentage here,
    // without changing task scores, completion thresholds or the goal's status.
    const completedCount = updatedTasks.filter(task => task.status === 'completed').length;
    const proficiency = updatedTasks.length ? Math.round((completedCount / updatedTasks.length) * 100) : 0;
    const updated = (await client.query(
      'UPDATE user_goals SET scenarios = $1, current_proficiency = $3, updated_at = NOW() WHERE id = $2 RETURNING *',
      [JSON.stringify(storedScenarios), goalId, proficiency]
    )).rows[0];
    const response = overlayGoalTasks(updated, updatedTasks);
    await client.query('COMMIT');
    return response;
  } catch (error) {
    await client.query('ROLLBACK');
    if (['55P03', '40P01'].includes(error.code)) throw conflict('scenarios_busy', '练习进度正在更新，请稍后重试保存');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { overlayGoalTasks, replaceGoalScenarios };
