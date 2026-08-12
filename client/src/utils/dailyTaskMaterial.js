export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function rotateSentencesForVariant(sentences, variant = 0) {
  if (!Array.isArray(sentences) || sentences.length <= 1) return sentences || [];
  const normalizedVariant = Math.max(0, Number(variant) || 0);
  const cycle = Math.floor(normalizedVariant / sentences.length);
  const source = cycle % 2 === 0 ? sentences : [...sentences].reverse();
  const offset = normalizedVariant % sentences.length;
  if (offset === 0) return source;
  return [...source.slice(offset), ...source.slice(0, offset)];
}

function stableHash(value) {
  let hash = 0;
  for (const char of String(value || '')) {
    hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function hasPendingTask(scenario) {
  const tasks = Array.isArray(scenario?.tasks) ? scenario.tasks : [];
  return tasks.some(task => (
    typeof task !== 'object' || task?.status !== 'completed'
  ));
}

export function pickProgressAwareRecallScenario(
  scenarios,
  { goalId = '', dateKey = getLocalDateKey(), variant = 0 } = {}
) {
  if (!Array.isArray(scenarios) || scenarios.length === 0) return null;
  const eligible = scenarios.filter(
    scenario => Array.isArray(scenario?.tasks) && scenario.tasks.length > 0
  );
  if (eligible.length === 0) return scenarios[0] || null;

  // Keep today's recall focused on unfinished practice. Once everything is
  // complete, all scenarios become valid review material again.
  const pending = eligible.filter(hasPendingTask);
  const pool = pending.length > 0 ? pending : eligible;

  const parsedDate = Date.parse(`${dateKey}T00:00:00`);
  const dayOrdinal = Number.isFinite(parsedDate)
    ? Math.floor(parsedDate / 86400000)
    : 0;
  const offset = Math.max(0, Number(variant) || 0);
  const index = (stableHash(goalId) + dayOrdinal + offset) % pool.length;
  return pool[index];
}
