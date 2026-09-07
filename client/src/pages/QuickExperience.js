import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../contexts/AuthContext';
import { conversationAPI } from '../services/api';
import LanguageSwitcher from '../components/LanguageSwitcher';

export default function QuickExperience() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [started, setStarted] = useState(false);
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ answers: [], question: null, report: null });
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [recording, setRecording] = useState(false);
  const [voiceReady, setVoiceReady] = useState(false);
  const socket = useRef(null);
  const audio = useRef(null);
  const mic = useRef(null);
  const playback = useRef([]);
  const nextStart = useRef(0);
  const micTimer = useRef(null);
  const mounted = useRef(true);
  const micGeneration = useRef(0);

  function stopPlayback() {
    playback.current.forEach(source => { try { source.stop(); } catch {} });
    playback.current = [];
    nextStart.current = 0;
  }

  function stopMic() {
    micGeneration.current += 1;
    clearTimeout(micTimer.current);
    if (mic.current) {
      mic.current.processor.disconnect();
      mic.current.source.disconnect();
      mic.current.stream.getTracks().forEach(track => track.stop());
      mic.current.context.close();
      mic.current = null;
    }
    if (mounted.current) setRecording(false);
  }

  function send(type, payload = {}) {
    if (socket.current?.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify({ type, payload }));
      return true;
    }
    return false;
  }

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stopMic(); stopPlayback(); audio.current?.close(); };
  }, []);

  useEffect(() => {
    if (!started) return undefined;
    let active = true;
    let ws;
    const controller = new AbortController();
    setConnected(false); setVoiceReady(false); setError(''); setBusy(true);
    const timeout = setTimeout(() => { if (active) { setBusy(false); setError('unavailable'); ws?.close(); } }, 20000);
    (async () => {
      try {
        const realtime = await conversationAPI.createRealtimeTicket({ signal: controller.signal });
        if (!active) return;
        const host = ['localhost', '127.0.0.1'].includes(window.location.hostname) && window.location.port === '3000' ? `${window.location.hostname}:8081` : window.location.host;
        const params = new URLSearchParams({ ticket: realtime.ticket, sessionId: `quick-${user.id}`, mode: 'quick_experience', scenario: 'English interview', voice: 'Tina' });
        ws = new WebSocket(`${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${host}/api/v1/realtime?${params}`);
        socket.current = ws;
        ws.onmessage = event => {
          if (!active) return;
          let message;
          try { message = JSON.parse(event.data); } catch { return; }
          const payload = message.payload || {};
          if (message.type === 'quick_state') {
            clearTimeout(timeout); setState(payload); setConnected(true); setBusy(false); setError(''); setText('');
          } else if (message.type === 'quick_busy') setBusy(true);
          else if (message.type === 'quick_voice_busy') setVoiceReady(false);
          else if (message.type === 'quick_voice_ready') setVoiceReady(true);
          else if (message.type === 'quick_error' || message.type === 'error') { setError(payload.code || 'unavailable'); setBusy(false); }
          else if (message.type === 'quick_audio' && audio.current) {
            const bytes = Uint8Array.from(atob(payload.audio), c => c.charCodeAt(0));
            const samples = new DataView(bytes.buffer);
            const buffer = audio.current.createBuffer(1, bytes.length / 2, 24000);
            const output = buffer.getChannelData(0);
            for (let i = 0; i < output.length; i += 1) output[i] = samples.getInt16(i * 2, true) / 32768;
            const source = audio.current.createBufferSource();
            source.buffer = buffer; source.connect(audio.current.destination);
            const when = Math.max(audio.current.currentTime, nextStart.current);
            source.start(when); nextStart.current = when + buffer.duration;
            playback.current.push(source);
            source.onended = () => { playback.current = playback.current.filter(item => item !== source); };
          }
        };
        ws.onclose = () => { if (active) { clearTimeout(timeout); setConnected(false); setBusy(false); setVoiceReady(false); stopMic(); setError(previous => previous || 'disconnected'); } };
        ws.onerror = () => { if (active) { setError('unavailable'); setBusy(false); } };
      } catch (e) { if (active) { clearTimeout(timeout); setError('unavailable'); setBusy(false); } }
    })();
    const heartbeat = setInterval(() => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'ping' })); }, 20000);
    return () => { active = false; clearTimeout(timeout); clearInterval(heartbeat); controller.abort(); ws?.close(); stopMic(); stopPlayback(); };
  }, [started, revision, user.id]);

  async function enableVoice() {
    try {
      if (!audio.current) audio.current = new (window.AudioContext || window.webkitAudioContext)();
      await audio.current.resume();
      stopPlayback(); send('quick_voice');
    } catch { setError('audio_failed'); }
  }

  async function toggleMic() {
    if (recording) { stopMic(); if (send('user_audio_ended')) setBusy(true); return; }
    const generation = ++micGeneration.current;
    let stream;
    let context;
    try {
      stopPlayback();
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current || generation !== micGeneration.current || socket.current?.readyState !== WebSocket.OPEN) { stream.getTracks().forEach(track => track.stop()); return; }
      context = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      await context.resume();
      if (!mounted.current || generation !== micGeneration.current || socket.current?.readyState !== WebSocket.OPEN) { stream.getTracks().forEach(track => track.stop()); await context.close(); return; }
      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      processor.onaudioprocess = event => {
        const input = event.inputBuffer.getChannelData(0);
        const ratio = context.sampleRate / 16000;
        const pcm = new Uint8Array(Math.floor(input.length / ratio) * 2);
        const view = new DataView(pcm.buffer);
        for (let i = 0; i < pcm.length / 2; i += 1) view.setInt16(i * 2, Math.max(-1, Math.min(1, input[Math.floor(i * ratio)])) * 32767, true);
        send('audio_stream', { audio: btoa(String.fromCharCode(...pcm)) });
      };
      source.connect(processor); processor.connect(context.destination);
      mic.current = { context, source, processor, stream };
      setRecording(true); setError('');
      micTimer.current = setTimeout(() => { stopMic(); if (send('user_audio_ended')) setBusy(true); }, 55000);
    } catch { stream?.getTracks().forEach(track => track.stop()); if (context?.state !== 'closed') context?.close(); stopMic(); if (mounted.current) setError('mic_denied'); }
  }

  const finish = () => navigate(user.native_language ? '/goal-setting' : '/onboarding');
  const button = 'min-h-11 px-5 py-3 rounded-xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed';
  return (
    <main className="min-h-[100dvh] bg-slate-50 dark:bg-slate-950 px-4 py-8 text-slate-900 dark:text-white">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-8"><img src="/guaji-logo.svg" alt="Guaji" className="h-10 w-10" /><LanguageSwitcher /></div>
        <h1 className="text-2xl font-bold mb-3">{t('quick_title')}</h1>
        <p className="text-slate-600 dark:text-slate-300 mb-6">{t('quick_intro')}</p>
        {!started ? <><button onClick={() => setStarted(true)} className={`${button} w-full bg-primary text-white`}>{t('quick_start')}</button><button onClick={finish} className={`${button} w-full mt-3 text-primary`}>{t('quick_profile')}</button></> : <>
          <p role="status" className="mb-4 text-sm">{t('quick_progress', { count: state.answers.length })}{busy ? ` · ${t('qa_ui.loading')}` : ''}</p>
          {state.question && <section className="bg-white dark:bg-slate-800 rounded-2xl p-5 border border-slate-200 dark:border-slate-700 mb-5"><p lang="en" className="text-lg leading-relaxed">{state.question}</p></section>}
          {state.report ? <section className="space-y-5 bg-white dark:bg-slate-800 rounded-2xl p-5">
            {['strengths', 'improvements', 'example'].map(key => <div key={key}><h2 className="font-semibold mb-2">{t(`quick_${key}`)}</h2><p lang="en" className="whitespace-pre-wrap break-words leading-relaxed">{state.report[key]}</p></div>)}
          </section> : state.question ? <>
            <div className="flex flex-wrap gap-2 mb-4"><button disabled={!connected || busy || recording} onClick={enableVoice} className={`${button} border border-slate-300`}>{t('quick_listen')}</button><button disabled={!connected || busy || !voiceReady} onClick={toggleMic} className={`${button} bg-primary text-white`}>{t(recording ? 'quick_stop' : 'quick_record')}</button></div>
            <label htmlFor="quick-answer" className="block text-sm mb-2">{t('quick_type')}</label>
            <textarea id="quick-answer" lang="en" rows={4} maxLength={4000} disabled={busy || recording || !connected} value={text} onChange={event => setText(event.target.value)} className="w-full p-3 rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800" />
            <button disabled={!connected || busy || recording || !text.trim()} onClick={() => { stopPlayback(); if (send('quick_answer', { text, stage: state.answers.length })) setBusy(true); }} className={`${button} w-full mt-3 bg-primary text-white`}>{t('quick_send')}</button>
          </> : null}
          {error && <p role="alert" className="mt-4 text-sm text-red-700 dark:text-red-300">{t(`quick_error_${error}`, { defaultValue: t('quick_error_unavailable') })}</p>}
          {!connected && !busy && <button onClick={() => setRevision(n => n + 1)} className={`${button} mt-3 border border-slate-300`}>{t('quick_reconnect')}</button>}
          {connected && state.answers.length === 3 && !state.report && !busy && <button onClick={() => { if (send('quick_report_retry')) setBusy(true); }} className={`${button} mt-3 border border-slate-300`}>{t('quick_report_retry')}</button>}
          <button onClick={finish} className={`${button} w-full mt-6 text-primary`}>{t('quick_profile')}</button>
        </>}
      </div>
    </main>
  );
}
