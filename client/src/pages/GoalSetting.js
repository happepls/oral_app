import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { userAPI, aiAPI } from '../services/api';


function GoalSetting() {
  const navigate = useNavigate();
  const { user, loading, updateProfile } = useAuth();
  
  const [step, setStep] = useState(1);
  const [type, setType] = useState('daily_conversation');
  const [description, setDescription] = useState('');
  const [targetLevel, setTargetLevel] = useState('Intermediate');
  const [completionDays, setCompletionDays] = useState(30);
  const [scenarios, setScenarios] = useState([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingScenario, setEditingScenario] = useState(null);
  const [showAddScenario, setShowAddScenario] = useState(false);
  const [newScenario, setNewScenario] = useState({ title: '', tasks: ['', '', ''] });
  const [selectedVoice, setSelectedVoice] = useState(localStorage.getItem('ai_voice') || 'Cherry');

  const VOICE_OPTIONS = [
    { id: 'Serena', name: 'Serena', desc: '温柔女声' },
    { id: 'Momo', name: 'Momo', desc: '活泼女声' },
    { id: 'Ryan', name: 'Ryan', desc: '活力男声' },
    { id: 'Nofish', name: 'Nofish', desc: '稳重男声' }
  ];

  const handleVoiceSelect = (voiceId) => {
    setSelectedVoice(voiceId);
    localStorage.setItem('ai_voice', voiceId);
  };

  // Fields moved from Onboarding
  const [targetLanguage, setTargetLanguage] = useState(user?.target_language || 'English');
  const [currentProficiency, setCurrentProficiency] = useState(user?.points || 30);
  const [interests, setInterests] = useState(user?.interests || '');
  const nativeLanguage = user?.native_language || 'Chinese';

  const handleGenerateScenarios = async () => {
    setIsGenerating(true);
    setError('');

    // First update user profile with target_language, interests, points
    try {
      await updateProfile({
        target_language: targetLanguage,
        interests: interests,
        points: parseInt(currentProficiency)
      });
    } catch (err) {
      console.error('Failed to update profile:', err);
    }
    
    try {
      const result = await aiAPI.generateScenarios({
        type,
        target_language: targetLanguage,
        target_level: targetLevel,
        interests: interests,
        description,
        native_language: nativeLanguage
      });

      if (result.scenarios && result.scenarios.length > 0) {
        setScenarios(result.scenarios.map((s, idx) => ({ ...s, id: idx })));
        setStep(2);
      } else {
        setError('AI 未返回有效场景，请重试。');
      }
    } catch (err) {
      console.error('AI generation failed:', err);
      setError('场景生成失败，请检查网络后重试。');
    }

    setIsGenerating(false);
  };

  const handleRemoveScenario = (id) => {
    setScenarios(scenarios.filter(s => s.id !== id));
  };

  const handleEditScenario = (scenario) => {
    setEditingScenario({ ...scenario, tasks: [...scenario.tasks] });
  };

  const handleSaveEdit = () => {
    if (!editingScenario.title.trim()) {
      setError('Scenario title cannot be empty.');
      return;
    }
    const validTasks = editingScenario.tasks.filter(t => t.trim());
    if (validTasks.length === 0) {
      setError('At least one task is required.');
      return;
    }
    setScenarios(scenarios.map(s => 
      s.id === editingScenario.id 
        ? { ...editingScenario, tasks: validTasks }
        : s
    ));
    setEditingScenario(null);
    setError('');
  };

  const handleAddTask = () => {
    if (editingScenario) {
      setEditingScenario({
        ...editingScenario,
        tasks: [...editingScenario.tasks, '']
      });
    } else if (showAddScenario) {
      setNewScenario({
        ...newScenario,
        tasks: [...newScenario.tasks, '']
      });
    }
  };

  const handleRemoveTask = (taskIndex) => {
    if (editingScenario) {
      if (editingScenario.tasks.length <= 1) {
        setError('At least one task is required.');
        return;
      }
      const newTasks = editingScenario.tasks.filter((_, idx) => idx !== taskIndex);
      setEditingScenario({ ...editingScenario, tasks: newTasks });
    } else if (showAddScenario) {
      if (newScenario.tasks.length <= 1) {
        setError('At least one task is required.');
        return;
      }
      const newTasks = newScenario.tasks.filter((_, idx) => idx !== taskIndex);
      setNewScenario({ ...newScenario, tasks: newTasks });
    }
  };

  const handleAddNewScenario = () => {
    if (!newScenario.title.trim()) {
      setError('Scenario title cannot be empty.');
      return;
    }
    const validTasks = newScenario.tasks.filter(t => t.trim());
    if (validTasks.length === 0) {
      setError('At least one task is required.');
      return;
    }
    const maxId = scenarios.length > 0 ? Math.max(...scenarios.map(s => s.id)) : -1;
    setScenarios([...scenarios, { 
      id: maxId + 1, 
      title: newScenario.title.trim(), 
      tasks: validTasks 
    }]);
    setNewScenario({ title: '', tasks: ['', '', ''] });
    setShowAddScenario(false);
    setError('');
  };

  const handleSubmit = async () => {
    if (scenarios.length === 0) {
      setError('Please keep at least one scenario.');
      return;
    }

    setError('');
    setSuccess('');

    try {
      const goalData = {
        type,
        description: description || `${targetLanguage} ${type.replace(/_/g, ' ')} 练习`,
        target_language: targetLanguage,
        target_level: targetLevel,
        current_proficiency: parseInt(currentProficiency),
        completion_time_days: completionDays,
        interests: interests,
        scenarios: scenarios.map(s => ({
          title: s.title,
          tasks: s.tasks
        }))
      };

      const result = await userAPI.createGoal(goalData);

      if (result) {
        setSuccess('目标设置成功！开始练习吧！');
        setTimeout(() => navigate('/discovery'), 1500);
      }
    } catch (err) {
      console.error(err);
      setError(err.message || '设置目标失败，请重试。');
    }
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center bg-background-light dark:bg-background-dark p-4">
      <div className="flex w-full max-w-lg flex-col items-center justify-start flex-grow pt-8">
        <div className="w-full px-4">
          {step === 1 && (
            <>
              <h1 className="text-slate-900 dark:text-white text-3xl font-bold mb-2">设定学习目标</h1>
              <p className="text-slate-600 dark:text-slate-400 mb-8">明确目标是成功的一半</p>

              <div className="space-y-4">
                {error && (
                  <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-lg text-sm">
                    {error}
                  </div>
                )}

                {/* Target Language - moved from Onboarding */}
                <div>
                  <label htmlFor="targetLanguage" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    学习语言
                  </label>
                  <select
                    id="targetLanguage"
                    value={targetLanguage}
                    onChange={(e) => setTargetLanguage(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
                  >
                    <option value="English">英语</option>
                    <option value="Japanese">日语</option>
                    <option value="Chinese">中文</option>
                    <option value="French">法语</option>
                    <option value="Spanish">西班牙语</option>
                    <option value="Korean">韩语</option>
                  </select>
                </div>

                {/* Current Proficiency - moved from Onboarding */}
                <div>
                  <label htmlFor="currentProficiency" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    当前水平 (0-100)
                  </label>
                  <input
                    type="range"
                    id="currentProficiency"
                    min="0"
                    max="100"
                    value={currentProficiency}
                    onChange={(e) => setCurrentProficiency(e.target.value)}
                    className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700"
                  />
                  <div className="text-right text-sm text-slate-500">{currentProficiency}</div>
                </div>

                <div>
                  <label htmlFor="type" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    目标类型
                  </label>
                  <select
                    id="type"
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
                  >
                    <option value="daily_conversation">日常对话</option>
                    <option value="business_meeting">商务会议</option>
                    <option value="travel_survival">旅行生存</option>
                    <option value="exam_prep">考试备考</option>
                    <option value="presentation">演讲技巧</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="targetLevel" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    目标等级
                  </label>
                  <select
                    id="targetLevel"
                    value={targetLevel}
                    onChange={(e) => setTargetLevel(e.target.value)}
                    disabled={loading}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
                  >
                    <option value="Beginner">初级</option>
                    <option value="Intermediate">中级</option>
                    <option value="Advanced">高级</option>
                    <option value="Native">母语水平</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="days" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    计划完成天数
                  </label>
                  <input
                    type="number"
                    id="days"
                    min="7"
                    max="180"
                    value={completionDays}
                    onChange={(e) => setCompletionDays(parseInt(e.target.value) || 30)}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
                  />
                </div>

                {/* Interests - moved from Onboarding */}
                <div>
                  <label htmlFor="interests" className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    兴趣爱好 / 学习难点
                  </label>
                  <textarea
                    id="interests"
                    value={interests}
                    onChange={(e) => setInterests(e.target.value)}
                    rows="3"
                    disabled={loading}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none disabled:opacity-50"
                    placeholder="例如：商务谈判, 旅游对话, 雅思口语..."
                  ></textarea>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-4">
                    AI 导师音色
                  </label>
                  <div className="grid grid-cols-2 gap-3 mb-8">
                    {VOICE_OPTIONS.map((voice) => (
                      <button
                        key={voice.id}
                        type="button"
                        onClick={() => handleVoiceSelect(voice.id)}
                        className={`flex flex-col items-center p-3 rounded-xl border-2 transition-all ${
                          selectedVoice === voice.id
                            ? 'border-primary bg-primary/5 dark:bg-primary/10'
                            : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                      >
                        <span className="text-2xl mb-1">
                          {['Ryan', 'Nofish'].includes(voice.id) ? '👨‍💼' : '👩‍💼'}
                        </span>
                        <span className="font-bold text-slate-900 dark:text-white">{voice.name}</span>
                        <span className="text-xs text-slate-500">{voice.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleGenerateScenarios}
                  disabled={loading || isGenerating}
                  className="w-full mt-6 flex items-center justify-center rounded-lg h-12 px-5 bg-primary text-white text-base font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  {isGenerating ? '正在生成场景...' : '生成练习场景'}
                </button>
              </div>
            </>
          )}

          {step === 2 && !editingScenario && !showAddScenario && (
            <>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-slate-900 dark:text-white text-2xl font-bold">练习场景</h1>
                <button
                  onClick={() => setStep(1)}
                  className="text-primary text-sm hover:underline"
                >
                  返回修改
                </button>
              </div>
              <p className="text-slate-600 dark:text-slate-400 mb-4">
                已为你生成 {scenarios.length} 个专属练习场景，可自由编辑、添加或删除。
              </p>

              {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-lg text-sm mb-4">
                  {error}
                </div>
              )}
              {success && (
                <div className="bg-green-500/10 border border-green-500/50 text-green-500 px-4 py-3 rounded-lg text-sm mb-4">
                  {success}
                </div>
              )}

              <button
                onClick={() => setShowAddScenario(true)}
                className="w-full mb-4 flex items-center justify-center gap-2 rounded-lg h-10 px-4 border-2 border-dashed border-slate-400 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:border-primary hover:text-primary transition-colors"
              >
                <span className="material-symbols-outlined text-xl">add</span>
                添加场景
              </button>

              <div className="space-y-3 max-h-[50vh] overflow-y-auto mb-6">
                {scenarios.map((scenario) => (
                  <div
                    key={scenario.id}
                    className="bg-slate-100 dark:bg-slate-800 rounded-lg p-4 relative group"
                  >
                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={() => handleEditScenario(scenario)}
                        className="text-slate-400 hover:text-primary p-1"
                        title="Edit scenario"
                      >
                        <span className="material-symbols-outlined text-xl">edit</span>
                      </button>
                      <button
                        onClick={() => handleRemoveScenario(scenario.id)}
                        className="text-slate-400 hover:text-red-500 p-1"
                        title="Remove scenario"
                      >
                        <span className="material-symbols-outlined text-xl">close</span>
                      </button>
                    </div>
                    <h3 className="text-slate-900 dark:text-white font-medium mb-2 pr-16">{scenario.title}</h3>
                    <ul className="text-slate-600 dark:text-slate-400 text-sm space-y-1">
                      {scenario.tasks.map((task, idx) => {
                        const taskText = typeof task === 'object' ? (task.text || task.description || JSON.stringify(task)) : task;
                        return (
                          <li key={idx} className="flex items-start">
                            <span className="text-primary mr-2">{idx + 1}.</span>
                            {taskText}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>

              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading || scenarios.length === 0}
                className="w-full mt-6 flex items-center justify-center rounded-lg h-12 px-5 bg-primary text-white text-base font-bold hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                确认并开始学习
              </button>
            </>
          )}

          {step === 2 && editingScenario && (
            <>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-slate-900 dark:text-white text-2xl font-bold">编辑场景</h1>
                <button
                  onClick={() => { setEditingScenario(null); setError(''); }}
                  className="text-primary text-sm hover:underline"
                >
                  取消
                </button>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-lg text-sm mb-4">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    场景标题
                  </label>
                  <input
                    type="text"
                    value={editingScenario.title}
                    onChange={(e) => setEditingScenario({ ...editingScenario, title: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
                    placeholder="场景标题"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    练习子任务
                  </label>
                  <div className="space-y-2">
                    {editingScenario.tasks.map((task, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-slate-500 text-sm w-6">{idx + 1}.</span>
                        <input
                          type="text"
                          value={task}
                          onChange={(e) => {
                            const newTasks = [...editingScenario.tasks];
                            newTasks[idx] = e.target.value;
                            setEditingScenario({ ...editingScenario, tasks: newTasks });
                          }}
                          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary outline-none text-sm"
                          placeholder={`子任务 ${idx + 1}`}
                        />
                        {editingScenario.tasks.length > 1 && (
                          <button
                            onClick={() => handleRemoveTask(idx)}
                            className="text-slate-400 hover:text-red-500"
                          >
                            <span className="material-symbols-outlined text-xl">remove_circle</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleAddTask}
                    className="mt-2 text-primary text-sm flex items-center gap-1 hover:underline"
                  >
                    <span className="material-symbols-outlined text-lg">add</span>
                    添加子任务
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleSaveEdit}
                  className="w-full mt-4 flex items-center justify-center rounded-lg h-12 px-5 bg-primary text-white text-base font-bold hover:bg-primary/90 transition-colors"
                >
                  保存修改
                </button>
              </div>
            </>
          )}

          {step === 2 && showAddScenario && (
            <>
              <div className="flex items-center justify-between mb-6">
                <h1 className="text-slate-900 dark:text-white text-2xl font-bold">添加新场景</h1>
                <button
                  onClick={() => { setShowAddScenario(false); setNewScenario({ title: '', tasks: ['', '', ''] }); setError(''); }}
                  className="text-primary text-sm hover:underline"
                >
                  取消
                </button>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/50 text-red-500 px-4 py-3 rounded-lg text-sm mb-4">
                  {error}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    场景标题
                  </label>
                  <input
                    type="text"
                    value={newScenario.title}
                    onChange={(e) => setNewScenario({ ...newScenario, title: e.target.value })}
                    className="w-full px-4 py-3 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary focus:ring-2 focus:ring-primary/50 outline-none"
                    placeholder="例如：职场面试"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                    练习子任务
                  </label>
                  <div className="space-y-2">
                    {newScenario.tasks.map((task, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <span className="text-slate-500 text-sm w-6">{idx + 1}.</span>
                        <input
                          type="text"
                          value={task}
                          onChange={(e) => {
                            const newTasks = [...newScenario.tasks];
                            newTasks[idx] = e.target.value;
                            setNewScenario({ ...newScenario, tasks: newTasks });
                          }}
                          className="flex-1 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:border-primary outline-none text-sm"
                          placeholder={`子任务 ${idx + 1}`}
                        />
                        {newScenario.tasks.length > 1 && (
                          <button
                            onClick={() => handleRemoveTask(idx)}
                            className="text-slate-400 hover:text-red-500"
                          >
                            <span className="material-symbols-outlined text-xl">remove_circle</span>
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleAddTask}
                    className="mt-2 text-primary text-sm flex items-center gap-1 hover:underline"
                  >
                    <span className="material-symbols-outlined text-lg">add</span>
                    添加子任务
                  </button>
                </div>

                <button
                  type="button"
                  onClick={handleAddNewScenario}
                  className="w-full mt-4 flex items-center justify-center rounded-lg h-12 px-5 bg-primary text-white text-base font-bold hover:bg-primary/90 transition-colors"
                >
                  添加场景
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default GoalSetting;
