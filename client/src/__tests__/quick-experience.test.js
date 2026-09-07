import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n';
import QuickExperience from '../pages/QuickExperience';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'new-user' } }) }));
jest.mock('../components/LanguageSwitcher', () => () => null);
jest.mock('../services/api', () => ({ conversationAPI: { createRealtimeTicket: async () => ({ ticket: 'test-ticket' }) } }));
const originalSocket = global.WebSocket;
let ws;
const captureSocket = value => { ws = value; };
beforeEach(async () => {
  await i18n.changeLanguage('en');
  mockNavigate.mockReset();
  global.WebSocket = class {
    static OPEN = 1;
    constructor(url) { this.url = url; this.readyState = 1; this.send = jest.fn(); this.close = jest.fn(); captureSocket(this); }
  };
});
afterEach(() => { global.WebSocket = originalSocket; });
const mount = () => render(<I18nextProvider i18n={i18n}><QuickExperience /></I18nextProvider>);
const emit = (type, payload = {}) => act(() => ws.onmessage({ data: JSON.stringify({ type, payload }) }));

test('new user can start without profile or goal, answer three questions and reach profile after report', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Quick experience' }));
  await waitFor(() => expect(ws.url).toContain('mode=quick_experience'));
  expect(ws.url).not.toContain('token=');
  emit('quick_state', { answers: [], question: 'Please introduce yourself.', report: null });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I enjoy teaching English' } });
  fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
  expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'quick_answer', payload: { text: 'I enjoy teaching English', stage: 0 } }));
  expect(screen.getByRole('button', { name: 'Submit answer' })).toBeDisabled();
  emit('quick_state', { answers: ['one', 'two', 'three'], question: null, report: { strengths: 'Clear motivation.', improvements: 'Add detail.', example: 'I helped a new colleague.' } });
  expect(screen.getByText('Clear motivation.')).toBeInTheDocument();
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Complete profile and goals' }));
  expect(mockNavigate).toHaveBeenCalledWith('/onboarding');
});

test('feedback failure preserves completion and offers retry without fabricated feedback', async () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'Quick experience' }));
  await waitFor(() => expect(ws.onmessage).toBeDefined());
  emit('quick_state', { answers: ['one', 'two', 'three'], question: null, report: null });
  emit('quick_error', { code: 'report_failed' });
  expect(screen.getByRole('alert')).toHaveTextContent('Your answers are saved');
  expect(screen.queryByText('Your strengths')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry feedback' }));
  expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'quick_report_retry', payload: {} }));
});

test('unmount closes the session and disconnect offers reconnect', async () => {
  const { unmount } = mount();
  fireEvent.click(screen.getByRole('button', { name: 'Quick experience' }));
  await waitFor(() => expect(ws.onclose).toBeDefined());
  act(() => ws.onclose());
  expect(screen.getByRole('button', { name: 'Reconnect' })).toBeInTheDocument();
  unmount();
  expect(ws.close).toHaveBeenCalled();
});
