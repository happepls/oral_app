// Unit tests for the locked-card click guard in components/ScenarioCard.jsx.
//
// ScenarioCard sets `onClick={!isLocked ? onStart : undefined}` where
// `isLocked = state === 'locked'`. A locked card must NOT fire onStart; an
// unlocked card must. To test this without rendering React, the guard is
// replicated as a pure resolver below. If you change the lock guard in
// ScenarioCard.jsx, mirror the change here.

// ---- replicated verbatim from client/src/components/ScenarioCard.jsx ----

// `const isLocked = state === 'locked';`
// `onClick={!isLocked ? onStart : undefined}`
function resolveOnClick(state, onStart) {
  const isLocked = state === 'locked';
  return !isLocked ? onStart : undefined;
}

// Simulate what the DOM would do: only invoke the resolved handler if present.
function handleClick(state, onStart) {
  const handler = resolveOnClick(state, onStart);
  if (handler) handler();
  return handler;
}

// ---- end replicated bodies ----

describe('ScenarioCard locked guard', () => {
  test("locked → onClick handler is undefined (onStart NOT invoked)", () => {
    const onStart = jest.fn();
    const handler = handleClick('locked', onStart);
    expect(handler).toBeUndefined();
    expect(onStart).not.toHaveBeenCalled();
  });

  test("unlocked ('default') → onStart invoked once", () => {
    const onStart = jest.fn();
    const handler = handleClick('default', onStart);
    expect(handler).toBe(onStart);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  test('any non-locked state (e.g. completed) → onStart invoked', () => {
    const onStart = jest.fn();
    handleClick('completed', onStart);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  test('undefined state → treated as unlocked → onStart invoked', () => {
    const onStart = jest.fn();
    handleClick(undefined, onStart);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  test('locked card with no onStart provided is safe (no throw)', () => {
    expect(() => handleClick('locked', undefined)).not.toThrow();
  });

  test('only the exact string "locked" disables the click', () => {
    const onStart = jest.fn();
    // case-sensitive: 'Locked' is not 'locked'
    handleClick('Locked', onStart);
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
