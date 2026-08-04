import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockLogin = jest.fn();
const mockLoginWithGoogle = jest.fn();
const mockLoginWithPhone = jest.fn();
const mockNavigate = jest.fn();

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    login: mockLogin,
    loginWithGoogle: mockLoginWithGoogle,
    loginWithPhone: mockLoginWithPhone,
    loading: false,
  }),
}));

jest.mock('../services/api', () => ({
  authAPI: { sendPhoneCode: jest.fn() },
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [new URLSearchParams()],
}), { virtual: true });

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en' },
    t: (key) => ({
      email_label: 'Email address',
      password_label: 'Password',
      password_show: 'Show password',
      password_hide: 'Hide password',
      login_tab_email: 'Email',
      login_tab_phone: 'Phone',
      login_method_label: 'Login method',
      login_submit: 'Log in',
      login_invalid_credentials: 'Invalid credentials',
      phone_label: 'Phone number',
      phone_hint: 'Enter your local number',
      phone_code_label: 'SMS code',
      phone_code_placeholder: '6-digit code',
      phone_send_code: 'Get code',
      phone_login_submit: 'Log in / Sign up',
    }[key] || key),
  }),
}));

jest.mock('@react-oauth/google', () => ({
  GoogleLogin: ({ locale, width }) => (
    <div data-testid="google-login" data-locale={locale} data-width={width} />
  ),
}));

jest.mock('../components/LanguageSwitcher', () => () => <select aria-label="Language" />);
jest.mock('../components/CountryCodeSelect', () => ({
  __esModule: true,
  default: () => <button type="button" aria-label="Country code">+86</button>,
  COUNTRIES: [{ iso2: 'CN', dial: '+86' }],
  DEFAULT_COUNTRY: { iso2: 'CN', dial: '+86' },
}));

jest.mock('motion/react', () => {
  const React = require('react');
  const cleanProps = ({ whileHover, whileTap, initial, animate, transition, ...props }) => props;
  return {
    motion: {
      div: React.forwardRef((props, ref) => <div ref={ref} {...cleanProps(props)} />),
      button: React.forwardRef((props, ref) => <button ref={ref} {...cleanProps(props)} />),
    },
  };
});

import Login from '../pages/Login';

describe('Login accessibility and responsive contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockLogin.mockResolvedValue({ success: false, code: 'invalid_credentials' });
  });

  test('associates email fields, supports autofill, and keeps password visibility keyboard reachable', () => {
    render(<Login />);

    expect(screen.getByLabelText('Email address')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveProperty('tabIndex', 0);
  });

  test('exposes login modes as tabs and localizes the Google button', () => {
    render(<Login />);

    const emailTab = screen.getByRole('tab', { name: 'Email' });
    const phoneTab = screen.getByRole('tab', { name: 'Phone' });
    expect(emailTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('google-login')).toHaveAttribute('data-locale', 'en');

    fireEvent.click(phoneTab);
    expect(phoneTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByLabelText('Phone number')).toHaveAttribute('autocomplete', 'tel-national');
    expect(screen.getByLabelText('SMS code')).toHaveAttribute('autocomplete', 'one-time-code');
    expect(screen.getByPlaceholderText('6-digit code')).toBeInTheDocument();
  });

  test('announces a failed login and marks affected fields invalid', async () => {
    render(<Login />);

    fireEvent.change(screen.getByLabelText('Email address'), { target: { value: 'person@example.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong-password' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log in' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid credentials');
    await waitFor(() => {
      expect(screen.getByLabelText('Email address')).toHaveAttribute('aria-invalid', 'true');
      expect(screen.getByLabelText('Password')).toHaveAttribute('aria-describedby', 'login-error');
    });
  });
});
