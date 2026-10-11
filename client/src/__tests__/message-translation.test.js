import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import TranslatableMessage from '../components/TranslatableMessage';
import { aiAPI } from '../services/api';

jest.mock('../services/api', () => ({ aiAPI: { translate: jest.fn() } }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../components/MessageBubble', () => ({ MessageBubble: props => <div>{props.message}{props.translation}</div> }));
const greeting = { responseId: 'greeting', audioPlayed: true };
const props = { message: greeting, content: 'こんにちは', nativeLanguage: 'Chinese', type: 'ai' };
beforeEach(() => aiAPI.translate.mockReset());

test('greeting and subsequent replies translate to native language', async () => {
  aiAPI.translate.mockResolvedValue({ translation: '你好' });
  const view = render(<TranslatableMessage {...props} />);
  fireEvent.click(screen.getByRole('button'));
  await screen.findByText('こんにちは你好');
  expect(aiAPI.translate).toHaveBeenLastCalledWith('こんにちは', 'Chinese', expect.any(Object));
  view.rerender(<TranslatableMessage {...props} message={{ responseId: 'reply', audioPlayed: true }} content="ありがとう" />);
  fireEvent.click(screen.getByRole('button'));
  await screen.findByText('ありがとう你好');
  expect(aiAPI.translate).toHaveBeenLastCalledWith('ありがとう', 'Chinese', expect.any(Object));
});

test.each(['message', 'language', 'content'])('late translation cannot cross changed %s', async changed => {
  let resolve;
  aiAPI.translate.mockReturnValue(new Promise(r => { resolve = r; }));
  const view = render(<TranslatableMessage {...props} />);
  fireEvent.click(screen.getByRole('button'));
  const next = changed === 'message' ? { message: { responseId: 'next', audioPlayed: true } }
    : changed === 'language' ? { nativeLanguage: 'English' } : { content: '次の質問' };
  view.rerender(<TranslatableMessage {...props} {...next} />);
  await act(async () => resolve({ translation: '过期译文' }));
  expect(screen.queryByText(/过期译文/)).not.toBeInTheDocument();
  expect(aiAPI.translate.mock.calls[0][2].signal.aborted).toBe(true);
});

test('failed translation offers retry and cached translation without language is ignored', async () => {
  aiAPI.translate.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ translation: '你好' });
  render(<TranslatableMessage {...props} message={{ ...greeting, translation: 'old cache' }} />);
  expect(screen.queryByText(/old cache/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button'));
  await screen.findByRole('alert');
  fireEvent.click(screen.getByRole('button'));
  await screen.findByText('こんにちは你好');
});
