import React, { useEffect, useRef, useState } from 'react';
import { Lock, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AccessibleDialog } from './AccessibleDialog';
import { aiAPI, userAPI } from '../services/api';
import { changedProgressScenarios, isScenarioLocked, MAX_GOAL_SCENARIOS, scenarioPayload, scenarioTaskText, validateGoalScenarios } from '../utils/goalScenarios';

const inputClass = 'w-full rounded-xl border border-slate-300 bg-white p-3 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-600 dark:bg-slate-900 dark:text-white dark:disabled:bg-slate-700';
const buttonClass = 'inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50';

export default function GoalScenarioEditor({ goal, nativeLanguage, onClose, onSaved }) {
  const { t } = useTranslation();
  const nextKey = useRef(0);
  const makeRow = scenario => ({ ...scenario, key: ++nextKey.current, locked: Boolean(isScenarioLocked(scenario)), hasProgress: scenario.tasks?.some(task => Number(task?.score) > 0 || Number(task?.interaction_count) > 0), tasks: (scenario.tasks || []).map(scenarioTaskText) });
  const [scenarios, setScenarios] = useState(() => goal.scenarios.map(makeRow));
  const [errors, setErrors] = useState({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(null);
  const requestRef = useRef(null);
  const saveRef = useRef(false);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; requestRef.current?.abort(); };
  }, []);
  const busy = saving || generating !== null;
  const changedProgress = changedProgressScenarios(goal.scenarios, scenarios);
  const close = () => { if (!saveRef.current) { requestRef.current?.abort(); onClose(); } };
  const update = (key, transform) => {
    setScenarios(rows => rows.map(row => row.key === key ? transform(row) : row));
    setErrors({}); setError('');
  };
  const generate = async (row = null) => {
    if (requestRef.current || saveRef.current || row?.locked || (!row && scenarios.length >= MAX_GOAL_SCENARIOS)) return;
    if (row && !window.confirm(t('qa_ui.scenario_regenerate_confirm'))) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setGenerating(row?.key ?? 'new'); setError('');
    try {
      const result = await aiAPI.generateScenario({
        target_language: goal.target_language,
        target_level: goal.target_level,
        type: goal.type,
        interests: Array.isArray(goal.interests) ? goal.interests.join(', ') : goal.interests || '',
        native_language: nativeLanguage || 'zh',
        exclude_titles: scenarios.map(item => item.title.trim()).filter(Boolean),
      }, { signal: controller.signal });
      if (controller.signal.aborted || !mountedRef.current) return;
      if (!result?.scenario || typeof result.scenario.title !== 'string'
        || !Array.isArray(result.scenario.tasks) || result.scenario.tasks.some(task => typeof task !== 'string')) throw new Error(t('qa_ui.scenario_generate_failed'));
      const generated = makeRow(result.scenario);
      const candidate = row ? scenarios.map(item => item.key === row.key ? generated : item) : [...scenarios, generated];
      // Validate the generated card and duplicates without blocking because a
      // different manually-added card is still being filled in.
      const generatedErrors = validateGoalScenarios([generated], t);
      if (Object.keys(generatedErrors).length || scenarios.some(item => item.title.trim() === generated.title.trim())) throw new Error(t('qa_ui.scenario_generate_failed'));
      setScenarios(candidate); setErrors({});
    } catch (err) {
      if (!controller.signal.aborted && mountedRef.current) setError(err.message || t('qa_ui.scenario_generate_failed'));
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
      if (mountedRef.current) setGenerating(null);
    }
  };
  const save = async event => {
    event.preventDefault();
    if (saveRef.current || requestRef.current) return;
    const validation = validateGoalScenarios(scenarios, t);
    setErrors(validation); setError('');
    if (Object.keys(validation).length) return;
    if (changedProgress.length && !window.confirm(t('qa_ui.scenario_progress_confirm'))) return;
    saveRef.current = true; setSaving(true);
    try {
      const result = await userAPI.updateGoalScenarios(goal.id, scenarioPayload(scenarios));
      if (!result?.goal) throw new Error(t('qa_ui.scenario_save_failed'));
      if (mountedRef.current) onSaved(result.goal);
    } catch (err) {
      if (mountedRef.current) {
        setError(err.message || t('qa_ui.scenario_save_failed'));
        setErrors(Object.fromEntries((err.fields || []).map(field => [String(field.field).replace(/\[(\d+)\]/g, '.$1'), field.message])));
      }
    } finally {
      saveRef.current = false;
      if (mountedRef.current) setSaving(false);
    }
  };
  const fieldError = name => errors[name] && <p id={`error-${name}`} className="text-xs text-red-600 mt-1">{errors[name]}</p>;
  return (
    <AccessibleDialog title={t('qa_ui.edit_scenarios')} closeLabel={t('qa_ui.scenario_close')} onClose={close} panelClassName="max-w-3xl rounded-2xl max-h-[90dvh] flex flex-col overflow-hidden">
      <header className="p-5 pr-16 border-b border-slate-100 dark:border-slate-700">
        <h2 className="text-lg font-semibold">{t('qa_ui.edit_scenarios')}</h2>
        <p className="text-sm text-slate-500 mt-1 break-words">{goal.description}</p>
        <p className="text-xs text-slate-500 mt-1">{t('qa_ui.scenario_editor_help')}</p>
      </header>
      <form onSubmit={save} className="flex min-h-0 flex-col">
        <div className="overflow-y-auto p-4 sm:p-5 space-y-4">
          {scenarios.map((row, index) => (
            <fieldset key={row.key} disabled={busy || row.locked} className={`border rounded-xl p-3 sm:p-4 ${row.locked ? 'bg-slate-50 border-slate-200 dark:bg-slate-800' : 'border-slate-200 dark:border-slate-600'}`}>
              <legend className="px-1 text-sm font-semibold">{t('qa_ui.scenario_number', { count: index + 1 })}</legend>
              {row.locked && <p className="flex items-start gap-2 text-sm text-slate-500 mb-3"><Lock className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />{t('qa_ui.scenario_edit_locked')}</p>}
              {!row.locked && row.hasProgress && <p className="text-sm text-amber-800 dark:text-amber-300 mb-3">{t('qa_ui.scenario_progress_help')}</p>}
              <label className="block text-xs font-medium mb-1" htmlFor={`scenario-${row.key}`}>{t('qa_ui.scenario_title_label')}</label>
              <input id={`scenario-${row.key}`} className={inputClass} value={row.title} aria-invalid={Boolean(errors[`scenarios.${index}.title`])} aria-describedby={errors[`scenarios.${index}.title`] ? `error-scenarios.${index}.title` : undefined} onChange={event => update(row.key, old => ({ ...old, title: event.target.value }))} />
              {fieldError(`scenarios.${index}.title`)}
              <div className="space-y-2 mt-3">
                {row.tasks.map((task, taskIndex) => {
                  const name = `scenarios.${index}.tasks.${taskIndex}`;
                  return <div key={taskIndex}>
                    <label className="block text-xs font-medium mb-1" htmlFor={`task-${row.key}-${taskIndex}`}>{t('qa_ui.scenario_task_label', { count: taskIndex + 1 })}</label>
                    <textarea rows={2} id={`task-${row.key}-${taskIndex}`} className={`${inputClass} resize-y`} value={task} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name] ? `error-${name}` : undefined} onChange={event => update(row.key, old => ({ ...old, tasks: old.tasks.map((text, i) => i === taskIndex ? event.target.value : text) }))} />
                    {fieldError(name)}
                  </div>;
                })}
              </div>
              {fieldError(`scenarios.${index}.tasks`)}
              {!row.locked && <div className="flex justify-between gap-2 flex-wrap mt-2">
                <button type="button" className={`${buttonClass} text-primary hover:bg-primary/5`} onClick={() => generate(row)}><Sparkles className="w-4 h-4" aria-hidden="true" />{t('qa_ui.scenario_regenerate')}</button>
                <button type="button" className={`${buttonClass} text-red-600 hover:bg-red-50`} disabled={scenarios.length === 1 || busy} onClick={() => { setScenarios(rows => rows.filter(item => item.key !== row.key)); setErrors({}); }}><Trash2 className="w-4 h-4" aria-hidden="true" />{t('qa_ui.scenario_delete')}</button>
              </div>}
            </fieldset>
          ))}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || scenarios.length >= MAX_GOAL_SCENARIOS} onClick={() => { setScenarios(rows => [...rows, makeRow({ title: '', tasks: ['', '', ''] })]); setErrors({}); }} className={`${buttonClass} border border-slate-300`}><Plus className="w-4 h-4" aria-hidden="true" />{t('qa_ui.scenario_add_manual')}</button>
            <button type="button" disabled={busy || scenarios.length >= MAX_GOAL_SCENARIOS} onClick={() => generate()} className={`${buttonClass} text-primary border border-primary/30`}><Sparkles className="w-4 h-4" aria-hidden="true" />{t('qa_ui.scenario_add_ai')}</button>
            <span className="text-xs text-slate-500 self-center">{scenarios.length}/{MAX_GOAL_SCENARIOS}</span>
          </div>
          {fieldError('scenarios')}
          {changedProgress.length > 0 && <p role="status" className="rounded-xl bg-amber-50 text-amber-900 p-3 text-sm">{t('qa_ui.scenario_progress_warning', { titles: changedProgress.map(row => row.title).join('、') })}</p>}
          {generating !== null && <p role="status" className="text-sm text-primary">{t('qa_ui.scenario_generating')}</p>}
          {error && <p role="alert" className="rounded-xl bg-red-50 text-red-700 p-3 text-sm">{error}</p>}
        </div>
        <footer className="flex justify-end gap-2 border-t border-slate-100 dark:border-slate-700 p-4 shrink-0">
          <button type="button" className={`${buttonClass} border border-slate-300`} disabled={saving} onClick={close}>{t('qa_ui.scenario_cancel')}</button>
          <button type="submit" className={`${buttonClass} bg-primary text-white`} disabled={busy}>{t(saving ? 'qa_ui.scenario_saving' : 'qa_ui.scenario_save')}</button>
        </footer>
      </form>
    </AccessibleDialog>
  );
}
