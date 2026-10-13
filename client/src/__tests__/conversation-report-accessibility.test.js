import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../i18n';

jest.mock('motion/react', () => {
  const React = require('react');
  const cleanProps = ({ whileHover, whileTap, whileInView, viewport, initial, animate, transition, ...props }) => props;
  return {
    motion: {
      div: React.forwardRef((props, ref) => <div ref={ref} {...cleanProps(props)} />),
      span: React.forwardRef((props, ref) => <span ref={ref} {...cleanProps(props)} />),
      button: React.forwardRef((props, ref) => <button ref={ref} {...cleanProps(props)} />),
    },
  };
});

import { PracticeReport } from '../components/PracticeReport';

describe('Conversation practice report accessibility', () => {
  let appRoot;

  beforeEach(() => {
    appRoot = document.createElement('div');
    appRoot.id = 'root';
    document.body.appendChild(appRoot);
  });

  afterEach(() => {
    appRoot.remove();
  });

  test('exposes a modal report without inventing detailed AI scores', () => {
    render(
      <I18nextProvider i18n={i18n}><PracticeReport
        scenarioTitle="问候与自我介绍"
        scenarioScore={72}
        reviewData={{ analysis: { overall_score: 72, detail_scores: { pronunciation: 82 } } }}
        messages={[]}
        onClose={jest.fn()}
        onRestart={jest.fn()}
        onNextScenario={jest.fn()}
        onSelectOther={jest.fn()}
      /></I18nextProvider>,
      { container: appRoot },
    );

    expect(screen.getByRole('dialog', { name: '练习报告' })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: '本场景总分 72 分' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('AI 详细维度暂未生成');
    expect(screen.queryByRole('progressbar', { name: /评分/ })).not.toBeInTheDocument();
  });

  test('closes with Escape and restores focus to the previous control', () => {
    const onClose = jest.fn();
    const trigger = document.createElement('button');
    trigger.textContent = '查看报告';
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(
      <I18nextProvider i18n={i18n}><PracticeReport
        scenarioTitle="问候与自我介绍"
        scenarioScore={72}
        reviewData={{ analysis: {} }}
        messages={[]}
        onClose={onClose}
        onRestart={jest.fn()}
        onNextScenario={jest.fn()}
        onSelectOther={jest.fn()}
      /></I18nextProvider>,
      { container: appRoot },
    );

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();
    expect(trigger).toHaveFocus();
    trigger.remove();
  });
});
