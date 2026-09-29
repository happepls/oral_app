import React from 'react';
import { render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { PracticeReport } from './PracticeReport';

jest.mock('motion/react', () => {
  const React = jest.requireActual('react');
  const motionProps = new Set(['whileHover', 'whileTap', 'whileInView', 'viewport', 'initial', 'animate', 'transition']);
  const cleanProps = props => Object.fromEntries(Object.entries(props).filter(([key]) => !motionProps.has(key)));
  return {
    motion: {
      div: React.forwardRef(function MotionDiv(props, ref) { return <div ref={ref} {...cleanProps(props)} />; }),
      span: React.forwardRef(function MotionSpan(props, ref) { return <span ref={ref} {...cleanProps(props)} />; }),
      button: React.forwardRef(function MotionButton(props, ref) { return <button ref={ref} {...cleanProps(props)} />; }),
    },
  };
});

const detailScores = { pronunciation: 61, fluency: 72, intonation: 83, vocabulary: 94 };
const pendingText = 'Assessment is pending; no score is available yet.';

function renderReport(analysis, extra = {}) {
  const i18n = createInstance();
  i18n.init({
    lng: 'en', fallbackLng: 'en', initImmediate: false, showSupportNotice: false,
    resources: { en: { translation: { practiceReport: { assessmentPending: pendingText } } } },
    interpolation: { escapeValue: false },
  });
  return render(
    <I18nextProvider i18n={i18n}>
      <PracticeReport
        scenarioTitle="自我介绍与职业背景说明"
        scenarioScore={100}
        reviewData={{ analysis, ...extra }}
        onClose={jest.fn()}
        onRestart={jest.fn()}
        onSelectOther={jest.fn()}
      />
    </I18nextProvider>,
  );
}

function stars() {
  return document.querySelectorAll('svg.lucide-star');
}

test('task completion at 100 never replaces the backend assessment of 73', () => {
  renderReport({ overall_score: 73, stars: 4, detail_scores: detailScores });
  expect(screen.getByRole('img', { name: '本场景总分 73 分' })).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: '本场景总分 100 分' })).not.toBeInTheDocument();
  expect(screen.queryByText(pendingText)).not.toBeInTheDocument();
  expect(stars()).toHaveLength(5);
  expect([...stars()].filter(star => star.getAttribute('fill') === '#FBBF24')).toHaveLength(4);
  const bars = screen.getAllByRole('progressbar');
  expect(bars.map(bar => Number(bar.getAttribute('aria-valuenow')))).toEqual([61, 72, 83, 94]);
});

test.each([
  { overall_score: null, stars: null, detail_scores: null, evaluation_status: 'pending' },
  { overall_score: 99, stars: 5, detail_scores: detailScores, evaluation_status: 'pending' },
  { overall_score: null, stars: 5, detail_scores: { pronunciation: null, fluency: null, intonation: null, vocabulary: null } },
  {},
])('pending or missing evidence never turns into zero, stars or invented dimensions: %p', analysis => {
  renderReport(analysis);
  expect(screen.getByText(pendingText)).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /本场景总分/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(stars()).toHaveLength(0);
});

test('top-level pending status also suppresses stale numerical results', () => {
  renderReport({ overall_score: 73, stars: 4, detail_scores: detailScores }, { evaluation_status: 'pending' });
  expect(screen.getByText(pendingText)).toBeInTheDocument();
  expect(screen.queryByRole('img', { name: /本场景总分/ })).not.toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(stars()).toHaveLength(0);
});

test('backend zero is a valid completed assessment, including zero-valued dimensions and stars', () => {
  renderReport({ overall_score: 0, stars: 0, detail_scores: {
    pronunciation: 0, fluency: 0, intonation: 0, vocabulary: 0,
  } });
  expect(screen.getByRole('img', { name: '本场景总分 0 分' })).toBeInTheDocument();
  expect(screen.queryByText(pendingText)).not.toBeInTheDocument();
  expect(screen.getAllByRole('progressbar')).toHaveLength(4);
  screen.getAllByRole('progressbar').forEach(bar => expect(bar).toHaveAttribute('aria-valuenow', '0'));
  expect(stars()).toHaveLength(5);
  expect([...stars()].every(star => star.getAttribute('fill') === 'none')).toBe(true);
});

test.each([null, undefined, '73', '', true, NaN, Infinity, -1, 101])(
  'invalid overall score %p cannot be coerced into a valid assessment', overallScore => {
    renderReport({ overall_score: overallScore, stars: 4 });
    expect(screen.getByText(pendingText)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /本场景总分/ })).not.toBeInTheDocument();
    expect(stars()).toHaveLength(0);
  },
);

test.each([null, undefined, '82', '', true, NaN, Infinity, -1, 101])(
  'invalid backend dimension %p is not displayed as a measured skill', pronunciation => {
    renderReport({ overall_score: 73, stars: 4, detail_scores: { ...detailScores, pronunciation } });
    expect(screen.getByRole('img', { name: '本场景总分 73 分' })).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByText(/AI 详细维度暂未生成/)).toBeInTheDocument();
  },
);

test.each([null, undefined, '4', '', true, NaN, Infinity, -1, 6])(
  'invalid star rating %p does not fall back to task progress', rating => {
    renderReport({ overall_score: 73, stars: rating, detail_scores: detailScores });
    expect(screen.getByRole('img', { name: '本场景总分 73 分' })).toBeInTheDocument();
    expect(screen.getAllByRole('progressbar')).toHaveLength(4);
    expect(stars()).toHaveLength(0);
  },
);
