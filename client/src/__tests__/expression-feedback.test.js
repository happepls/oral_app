import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import ExpressionFeedback from '../components/ExpressionFeedback';
import { isCurrentExpression, isCurrentTeachingState } from '../pages/conversationExpressions';
import zh from '../i18n/locales/zh.json';

const feedback = {
  turn_id: 'turn-1', task_id: 42, scoring_generation: 3, scenario: 'Restaurant',
  teaching_mode: 'correct', off_topic: false,
  errors: [{ original: 'I want eat steak', corrected: 'I want to eat steak', explanation_l1: 'want 后接 to 加动词原形。' }],
  alternatives: ["I'd like the steak, please.", 'Could I have the steak?'],
};

async function setup(props = {}) {
  const i18n = createInstance();
  await i18n.init({ lng: 'zh', resources: { zh: { translation: zh } } });
  const wrap = values => <I18nextProvider i18n={i18n}><ExpressionFeedback {...values} /></I18nextProvider>;
  const values = { feedback, onSend: jest.fn(() => true), ...props };
  return { ...render(wrap(values)), values, wrap };
}

test('chip fills answer and sends once as a student utterance', async () => {
  const { values } = await setup();
  const chip = screen.getByRole('button', { name: feedback.alternatives[0] });
  fireEvent.click(chip);
  expect(screen.getByRole('textbox')).toHaveValue(feedback.alternatives[0]);
  expect(values.onSend).toHaveBeenCalledWith(feedback.alternatives[0], feedback);
  fireEvent.click(chip);
  expect(values.onSend).toHaveBeenCalledTimes(1);
  expect(chip).toBeDisabled();
  expect(screen.getByText('已发送回答')).toBeInTheDocument();
});

test('student can edit and submit; failed send stays retryable', async () => {
  const onSend = jest.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
  await setup({ onSend });
  fireEvent.change(screen.getByRole('textbox'), { target: { value: 'I would like steak.' } });
  fireEvent.click(screen.getByRole('button', { name: '发送我的回答' }));
  expect(screen.getByRole('status')).toHaveTextContent('发送未成功');
  fireEvent.click(screen.getByRole('button', { name: '发送我的回答' }));
  expect(onSend).toHaveBeenLastCalledWith('I would like steak.', feedback);
});

test('missing feedback silently renders nothing; errors optional; disconnected disables', async () => {
  const { container, rerender, wrap, values } = await setup({ feedback: null });
  expect(container).toBeEmptyDOMElement();
  rerender(wrap({ ...values, feedback: { ...feedback, teaching_mode: 'advance', errors: [] }, disabled: true }));
  expect(screen.queryByText('I want eat steak')).not.toBeInTheDocument();
  const chip = screen.getByRole('button', { name: feedback.alternatives[0] });
  expect(chip).toBeDisabled();
  fireEvent.click(chip);
  expect(values.onSend).not.toHaveBeenCalled();
});

test('only exact nonzero authoritative task generation is accepted', () => {
  const task = { id: 42, scoring_generation: 3, status: 'pending' };
  const generations = new Map();
  const accept = value => isCurrentExpression(value, task, generations, 'Restaurant');
  expect(accept(feedback)).toBe(true);
  for (const bad of [null, { ...feedback, task_id: 43 }, { ...feedback, scoring_generation: 0 },
    { ...feedback, scoring_generation: undefined }, { ...feedback, scenario: 'Football' },
    { ...feedback, alternatives: ['one'] }]) expect(accept(bad)).toBe(false);
  generations.set('42', 4);
  expect(accept(feedback)).toBe(false);
  expect(isCurrentExpression(feedback, { id: 42 }, new Map(), 'Restaurant')).toBe(false);
});

test('clarification shows recognized text without invented example chips and sends an edited new answer', async () => {
  const clarification = { ...feedback, protocol_version: 2, teaching_mode: 'clarify', errors: [], alternatives: [],
    user_text: '予算は五十か五百です。', clarification_question: '金額と単位を確認してください。' };
  const { values } = await setup({ feedback: clarification });
  expect(screen.getByRole('textbox')).toHaveValue(clarification.user_text);
  expect(screen.getByText(clarification.clarification_question)).toBeInTheDocument();
  expect(screen.queryByText('点选句子作为自己的回答发送，也可以跟着说一遍。')).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole('textbox'), { target: { value: '予算は五百円です。' } });
  fireEvent.click(screen.getByRole('button', { name: '发送我的回答' }));
  expect(values.onSend).toHaveBeenCalledWith('予算は五百円です。', clarification);
  expect(isCurrentExpression(clarification, { id: 42, scoring_generation: 3 }, new Map(), 'Restaurant')).toBe(true);
  expect(isCurrentExpression({ ...clarification, protocol_version: 1 }, { id: 42, scoring_generation: 3 }, new Map(), 'Restaurant')).toBe(false);
});

test('waiting and retry states are bound to the current recording and generation', () => {
  const state = { ...feedback, protocol_version: 2, input_id: 'record-2', status: 'analyzing' };
  const task = { id: 42, scoring_generation: 3 };
  expect(isCurrentTeachingState(state, task, new Map(), 'Restaurant', 'record-2')).toBe(true);
  for (const bad of [{ ...state, input_id: 'record-1' }, { ...state, scoring_generation: 4 },
    { ...state, protocol_version: 1 }, { ...state, status: 'anything' }, { ...state, turn_id: null }]) {
    expect(isCurrentTeachingState(bad, task, new Map(), 'Restaurant', 'record-2')).toBe(false);
  }
});
