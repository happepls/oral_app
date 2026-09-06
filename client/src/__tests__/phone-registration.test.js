import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '../i18n/locales/en.json';
import Register from '../pages/Register';
import { buildPhoneNumber } from '../components/PhoneAuthForm';
import { authAPI } from '../services/api';

const mockRegister = jest.fn();
const mockLoginWithPhone = jest.fn();
const mockNavigate = jest.fn();
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ register: mockRegister, loginWithPhone: mockLoginWithPhone, loading: false }) }));
jest.mock('../services/api', () => ({ authAPI: { sendPhoneCode: jest.fn() } }));
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }), { virtual: true });
jest.mock('../components/LanguageSwitcher', () => () => <span>English</span>);
jest.mock('motion/react', () => {
  const React = require('react');
  const clean = ({ whileHover, whileTap, initial, animate, transition, ...props }) => props;
  return { motion: { div: React.forwardRef((props, ref) => <div ref={ref} {...clean(props)} />), button: React.forwardRef((props, ref) => <button ref={ref} {...clean(props)} />) } };
});

const i18n = i18next.createInstance();
i18n.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false }, initImmediate: false });
const mount = () => render(<I18nextProvider i18n={i18n}><Register /></I18nextProvider>);
const phoneMode = () => fireEvent.click(screen.getByRole('tab', { name: 'Phone' }));
const enterPhone = (value = '13800138000') => fireEvent.change(screen.getByLabelText('Phone number'), { target: { value } });
const enterCode = () => fireEvent.change(screen.getByLabelText('SMS code'), { target: { value: '123456' } });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

beforeEach(() => {
  jest.clearAllMocks();
  mockLoginWithPhone.mockResolvedValue({ success: true, user: { id: 'new-phone-user' } });
  mockRegister.mockResolvedValue({ success: true });
  authAPI.sendPhoneCode.mockResolvedValue({ success: true });
});
afterEach(() => jest.useRealTimers());

test('email signup is still the default and submits its original fields', async () => {
  mount();
  expect(screen.getByRole('tab', { name: 'Email' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.change(document.getElementById('register-name'), { target: { value: 'learner' } });
  fireEvent.change(document.getElementById('register-email'), { target: { value: 'learner@example.com' } });
  for (const id of ['register-password', 'register-confirm']) fireEvent.change(document.getElementById(id), { target: { value: 'GoodPassword1' } });
  fireEvent.submit(screen.getByRole('tabpanel'));
  await waitFor(() => expect(mockRegister).toHaveBeenCalledWith({ username: 'learner', email: 'learner@example.com', password: 'GoodPassword1' }));
  expect(mockLoginWithPhone).not.toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith('/discovery');
});

test('phone signup sends E.164 and signs in without an email or password', async () => {
  mount(); phoneMode(); enterPhone();
  expect(document.querySelector('input[type="email"]')).toBeNull();
  expect(document.querySelector('input[type="password"]')).toBeNull();
  expect(screen.getByLabelText('SMS code')).toHaveAttribute('autocomplete', 'one-time-code');
  fireEvent.click(screen.getByRole('button', { name: 'Get code' }));
  expect(await screen.findByRole('status')).toHaveTextContent(en.phone_code_sent);
  expect(authAPI.sendPhoneCode).toHaveBeenCalledWith('+8613800138000', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  enterCode(); fireEvent.submit(screen.getByRole('tabpanel'));
  await waitFor(() => expect(mockLoginWithPhone).toHaveBeenCalledWith('+8613800138000', '123456'));
  expect(mockRegister).not.toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith('/discovery');
});

test('register modes support arrow-key navigation', () => {
  mount();
  const email = screen.getByRole('tab', { name: 'Email' });
  email.focus(); fireEvent.keyDown(email, { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Phone' })).toHaveFocus();
  expect(screen.getByRole('tab', { name: 'Phone' })).toHaveAttribute('aria-selected', 'true');
});

test.each(['', '123', '13800ABC8000', '+441234567890'])('invalid or mismatched phone %s cannot send', value => {
  mount(); phoneMode(); enterPhone(value);
  fireEvent.click(screen.getByRole('button', { name: 'Get code' }));
  expect(screen.getByRole('alert')).toBeInTheDocument();
  expect(authAPI.sendPhoneCode).not.toHaveBeenCalled();
});

test('repeat sends are disabled until the deadline, and then work', async () => {
  jest.useFakeTimers(); mount(); phoneMode(); enterPhone();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Get code' })); });
  expect(screen.getByRole('button', { name: 'Retry in 60s' })).toBeDisabled();
  act(() => jest.advanceTimersByTime(60000));
  expect(screen.getByRole('button', { name: 'Resend' })).toBeEnabled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Resend' })); });
  expect(authAPI.sendPhoneCode).toHaveBeenCalledTimes(2);
});

test('changing numbers aborts delivery UI and ignores its late success', async () => {
  const pending = deferred(); authAPI.sendPhoneCode.mockReturnValue(pending.promise);
  mount(); phoneMode(); enterPhone();
  fireEvent.click(screen.getByRole('button', { name: 'Get code' }));
  const signal = authAPI.sendPhoneCode.mock.calls[0][1].signal;
  enterCode(); enterPhone('13900139000');
  expect(signal.aborted).toBe(true);
  expect(screen.getByLabelText('SMS code')).toHaveValue('');
  await act(async () => pending.resolve({ success: true }));
  expect(screen.queryByRole('status')).toBeNull();
});

test('send failure is announced, and 429 respects the server retry delay', async () => {
  authAPI.sendPhoneCode.mockRejectedValue(Object.assign(new Error('limited'), { status: 429, retryAfter: 120 }));
  mount(); phoneMode(); enterPhone();
  fireEvent.click(screen.getByRole('button', { name: 'Get code' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(en.phone_rate_limited);
  expect(screen.getByRole('button', { name: 'Retry in 120s' })).toBeDisabled();
  expect(screen.queryByRole('status')).toBeNull();
});

test('failed verification remains on signup; successful retry can continue', async () => {
  mockLoginWithPhone.mockResolvedValueOnce({ success: false });
  mount(); phoneMode(); enterPhone(); enterCode();
  fireEvent.submit(screen.getByRole('tabpanel'));
  expect(await screen.findByRole('alert')).toHaveTextContent(en.phone_login_fail);
  expect(mockNavigate).not.toHaveBeenCalled();
  fireEvent.submit(screen.getByRole('tabpanel'));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/discovery'));
});

test('duplicate submits are ignored and unmount aborts a pending send', async () => {
  const pending = deferred(); mockLoginWithPhone.mockReturnValue(pending.promise);
  const view = mount(); phoneMode(); enterPhone(); enterCode();
  fireEvent.submit(screen.getByRole('tabpanel')); fireEvent.submit(screen.getByRole('tabpanel'));
  expect(mockLoginWithPhone).toHaveBeenCalledTimes(1);
  await act(async () => pending.resolve({ success: false }));
  const delivery = deferred(); authAPI.sendPhoneCode.mockReturnValue(delivery.promise);
  fireEvent.click(screen.getByRole('button', { name: 'Get code' }));
  const signal = authAPI.sendPhoneCode.mock.calls[0][1].signal;
  view.unmount(); expect(signal.aborted).toBe(true);
  await act(async () => delivery.resolve({ success: true }));
});

test.each([
  ['CN', '+86 138-0013-8000', '+8613800138000'],
  ['JP', '090-1234-5678', '+819012345678'],
  ['IT', '06 6982', '+39066982'],
  ['US', '(415) 555-2671', '+14155552671'],
  ['CN', '13800138000x', null],
])('normalizes %s %s without corrupting the account identifier', (country, input, expected) => {
  expect(buildPhoneNumber(country, input)).toBe(expected);
});
