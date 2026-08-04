import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

const mockNavigate = jest.fn();
const mockRefreshProfile = jest.fn();
const mockLogout = jest.fn();
const mockGetStats = jest.fn();
const mockGetSubscription = jest.fn();
const mockGetUserHistory = jest.fn();
const mockGetConversationDetail = jest.fn();
const mockUpdateProfile = jest.fn();
const mockSubmitFeedback = jest.fn();
let mockParams = {};
let mockLocation = { pathname: '/profile' };

jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      nickname: 'Alex',
      email: 'alex@example.invalid',
      native_language: 'English',
      subscription_status: 'free',
    },
    loading: false,
    refreshProfile: mockRefreshProfile,
    logout: mockLogout,
  }),
}));

jest.mock('../services/api', () => ({
  historyAPI: {
    getStats: (...args) => mockGetStats(...args),
    getUserHistory: (...args) => mockGetUserHistory(...args),
    getConversationDetail: (...args) => mockGetConversationDetail(...args),
  },
  userAPI: {
    getSubscription: (...args) => mockGetSubscription(...args),
    updateProfile: (...args) => mockUpdateProfile(...args),
  },
  feedbackAPI: { submit: (...args) => mockSubmitFeedback(...args) },
}));

jest.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useParams: () => mockParams,
  useSearchParams: () => [new URLSearchParams()],
  useLocation: () => mockLocation,
}), { virtual: true });

jest.mock('../components/BottomNav', () => () => <nav aria-label="Primary navigation" />);

const translations = {
  'qa_ui.profile_title': 'My account',
  'qa_ui.profile_identity': 'Account identity',
  'qa_ui.profile_learning_summary': 'Learning summary',
  'qa_ui.profile_learning_records': 'Learning records',
  'qa_ui.profile_account_settings': 'Account settings',
  'qa_ui.menu_history': 'Conversation history',
  'qa_ui.menu_subscription': 'Subscription',
  'qa_ui.menu_theme': 'Theme',
  'qa_ui.menu_feedback': 'Feedback',
  'qa_ui.daily_checkin_plain': 'Daily check-in',
  'qa_ui.achievements_plain': 'Achievements',
  'qa_ui.feedback_title': 'Feedback',
  'qa_ui.feedback_dialog_description': 'Send feedback',
  'qa_ui.feedback_type': 'Feedback type',
  'qa_ui.feedback_category_feature': 'Suggestion',
  'qa_ui.feedback_category_problem': 'Problem',
  'qa_ui.feedback_category_other': 'Other',
  'qa_ui.feedback_content': 'Feedback details',
  'qa_ui.feedback_placeholder': 'Describe the issue',
  'qa_ui.feedback_submit': 'Submit feedback',
  'qa_ui.close_dialog': 'Close dialog',
  'qa_ui.history_title': 'Conversation history',
  'qa_ui.history_detail': 'Conversation details',
  'qa_ui.history_search_label': 'Search conversation history',
  'qa_ui.history_search_placeholder': 'Search conversations',
  'qa_ui.history_load_more': 'Load more conversations',
  'qa_ui.history_transcript': 'Conversation transcript',
  'qa_ui.history_speaker_you': 'You',
  'qa_ui.history_speaker_ai': 'AI tutor',
  'qa_ui.history_back_to_list': 'Back to conversation history',
  'qa_ui.back_profile': 'Back to profile',
  'qa_ui.subscription_title': 'Upgrade membership',
  'qa_ui.subscription_subtitle': 'Unlock features',
  'qa_ui.subscription_back': 'Back',
  'qa_ui.subscription_free': 'Free plan',
  'qa_ui.subscription_free_price': 'Free',
  'qa_ui.subscription_free_conversations': 'Free conversations',
  'qa_ui.subscription_basic_scenarios': 'Basic scenarios',
  'qa_ui.subscription_daily_checkin': 'Daily check-in',
  'qa_ui.subscription_feature_unlimited': 'Unlimited conversations',
  'qa_ui.subscription_feature_scenarios': 'All scenarios',
  'qa_ui.subscription_feature_feedback': 'Realtime feedback',
  'qa_ui.subscription_feature_progress': 'Progress tracking',
  'qa_ui.subscription_feature_support': 'Priority support',
  'qa_ui.subscription_feature_early': 'Early access',
  'qa_ui.subscription_interval_week': 'week',
  'qa_ui.subscription_interval_month': 'month',
  'qa_ui.subscription_interval_year': 'year',
  'price_cny_reference': 'Approx. {{price}} (reference rate)',
  'qa_ui.subscription_subscribe_now': 'Subscribe now',
  'qa_ui.subscription_promo': 'Promo code',
  'qa_ui.subscription_promo_placeholder': 'Enter promo code',
  'qa_ui.subscription_apply': 'Apply',
  'qa_ui.subscription_promo_hint': 'Promo hint',
  'qa_ui.subscription_renewal': 'Renews automatically',
  'qa_ui.subscription_stripe': 'Processed by Stripe',
};

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    i18n: { language: 'en-US' },
    t: (key, values = {}) => {
      const template = translations[key] || key;
      return Object.entries(values).reduce((text, [name, value]) => text.replace(`{{${name}}}`, String(value)), template);
    },
  }),
}));

import Profile from '../pages/Profile';
import History from '../pages/History';
import Subscription from '../pages/Subscription';

describe('account surfaces UX contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockParams = {};
    mockLocation = { pathname: '/profile' };
    mockRefreshProfile.mockResolvedValue({});
    mockGetStats.mockResolvedValue({ totalSessions: 3, totalDurationMinutes: 90 });
    mockGetSubscription.mockResolvedValue({ status: 'inactive' });
    mockUpdateProfile.mockResolvedValue({});
    mockSubmitFeedback.mockResolvedValue({ success: true });
  });

  test('uses semantic account actions and an accessible, keyboard-dismissible feedback dialog', async () => {
    render(<Profile />);

    expect(await screen.findByRole('button', { name: 'Conversation history' })).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: /Theme/ })).toHaveAttribute('aria-checked', 'false');

    const feedbackTrigger = screen.getByRole('button', { name: 'Feedback' });
    feedbackTrigger.focus();
    fireEvent.click(feedbackTrigger);

    const dialog = screen.getByRole('dialog', { name: 'Feedback' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByLabelText('Feedback details')).toHaveAttribute('aria-describedby');
    expect(screen.getByRole('button', { name: 'Close dialog' })).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(feedbackTrigger).toHaveFocus();
  });

  test('supports history search, progressive disclosure, and explicit speaker labels', async () => {
    mockGetUserHistory.mockResolvedValue(Array.from({ length: 25 }, (_, index) => ({
      sessionId: `session-${index}`,
      topic: index === 0 ? 'Coffee order' : `Practice ${index}`,
      startTime: '2026-08-03T10:00:00Z',
    })));
    const { unmount } = render(<History />);

    expect(await screen.findByLabelText('Search conversation history')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load more conversations' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search conversation history'), { target: { value: 'Coffee' } });
    expect(screen.getByRole('button', { name: /Coffee order/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Practice 2/ })).not.toBeInTheDocument();
    unmount();

    mockParams = { sessionId: 'session-0' };
    mockGetConversationDetail.mockResolvedValue({
      topic: 'Coffee order',
      startTime: '2026-08-03T10:00:00Z',
      messages: [
        { id: 'a', role: 'assistant', content: 'Hello' },
        { id: 'u', role: 'user', content: 'A latte, please' },
      ],
    });
    render(<History />);
    expect(await screen.findByText('AI tutor')).toBeInTheDocument();
    expect(screen.getByText('You')).toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Conversation transcript' })).toBeInTheDocument();
  });

  test('shows the Stripe USD weekly price with the corrected CNY reference', async () => {
    global.fetch = jest.fn(async (url) => {
      if (String(url).includes('products-with-prices')) {
        return {
          ok: true,
          json: async () => ({ data: [{
            id: 'weekly', name: 'Weekly', description: 'Weekly plan', metadata: { tier: 'weekly' },
            prices: [{ id: 'price-1', unit_amount: 499, currency: 'usd', recurring: { interval: 'week' } }],
          }] }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    render(<Subscription />);
    expect(await screen.findByText('$4.99/week')).toBeInTheDocument();
    expect(screen.getByText(/CN¥33\.71/)).toBeInTheDocument();
    expect(screen.getByLabelText('Promo code')).toBeInTheDocument();
  });
});
