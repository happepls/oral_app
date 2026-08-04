import React, { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';

jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
}), { virtual: true });

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key) => ({
      bottom_nav_label: 'Primary navigation',
      bottom_nav_home: 'Home',
      bottom_nav_goals: 'Goals',
      bottom_nav_profile: 'Profile',
      'qa_ui.scenario_progress': 'Progress',
      'qa_ui.scenario_locked': 'Locked',
      'qa_ui.scenario_done': 'Completed',
      'qa_ui.scenario_start': 'Start practice',
      'qa_ui.scenario_continue': 'Continue practice',
      'qa_ui.scenario_unlock_options': 'View unlock options',
      'qa_ui.level_beginner': 'Beginner',
      'qa_ui.level_intermediate': 'Intermediate',
      'qa_ui.level_advanced': 'Advanced',
    }[key] || key),
  }),
}));

import { AccessibleDialog } from '../components/AccessibleDialog';
import BottomNav from '../components/BottomNav';
import { ScenarioCard } from '../components/ScenarioCard';

function DialogHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open dialog</button>
      {open && (
        <AccessibleDialog
          title="Choose a question"
          description="Pick one question"
          closeLabel="Close dialog"
          onClose={() => setOpen(false)}
          panelClassName="max-w-sm"
        >
          <button>Last action</button>
        </AccessibleDialog>
      )}
    </>
  );
}

describe('Discovery accessible UI primitives', () => {
  let appRoot;

  beforeEach(() => {
    appRoot = document.createElement('div');
    appRoot.id = 'root';
    document.body.appendChild(appRoot);
  });

  afterEach(() => {
    appRoot.remove();
  });

  test('dialog traps focus, closes with Escape, and restores the trigger', () => {
    render(<DialogHarness />, { container: appRoot });
    const trigger = screen.getByRole('button', { name: 'Open dialog' });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole('dialog', { name: 'Choose a question' })).toBeInTheDocument();
    const close = screen.getByRole('button', { name: 'Close dialog' });
    const last = screen.getByRole('button', { name: 'Last action' });
    expect(close).toHaveFocus();
    expect(appRoot).toHaveAttribute('aria-hidden', 'true');

    close.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(close).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(appRoot).not.toHaveAttribute('aria-hidden');
  });

  test('scenario cards expose descriptions, progress, and an actionable unlock reason', () => {
    const onUnlock = jest.fn();
    render(
      <ScenarioCard
        title="Airport check-in"
        description="Ask for a window seat and check your luggage"
        progress={45}
        state="locked"
        unlockReason="Complete available scenarios or upgrade to Pro."
        onUnlock={onUnlock}
      />,
      { container: appRoot },
    );

    expect(screen.getByText('Ask for a window seat and check your luggage')).toBeVisible();
    expect(screen.getByRole('progressbar', { name: 'Progress' })).toHaveAttribute('aria-valuenow', '45');
    const unlockButton = screen.getByRole('button', { name: 'View unlock options' });
    expect(unlockButton).toHaveAccessibleDescription('Complete available scenarios or upgrade to Pro.');
    fireEvent.click(unlockButton);
    expect(onUnlock).toHaveBeenCalledTimes(1);
  });

  test('bottom navigation has localized names without exposing icon font text', () => {
    render(
      <BottomNav currentPage="home" />,
      { container: appRoot },
    );

    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Home' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getAllByText(/home|flag|person/).every((node) => node.getAttribute('aria-hidden') === 'true')).toBe(true);
  });
});
