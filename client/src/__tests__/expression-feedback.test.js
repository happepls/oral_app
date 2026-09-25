import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import ExpressionFeedback from '../components/ExpressionFeedback';
import { isCurrentExpression } from '../pages/conversationExpressions';
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
