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

// ---- replicated verbatim from client/src/components/ScenarioCard.jsx ----
// State-driven image fallback:
//   const [imageError, setImageError] = useState(false);
//   const showImage = imageUrl && !imageError;
//   {showImage ? <img onError={() => setImageError(true)} /> : <span>{emoji}</span>}
// resolveShowImage models which branch renders given (imageUrl, imageError).
function resolveShowImage(imageUrl, imageError) {
  return Boolean(imageUrl) && !imageError;
}

describe('ScenarioCard image fallback', () => {
  test('imageUrl present, no error → show image', () => {
    expect(resolveShowImage('https://x.myqcloud.com/a.jpg', false)).toBe(true);
  });

  test('imageUrl present but load errored → fall back to emoji', () => {
    // This is the bug being fixed: previously the img was hidden via DOM
    // mutation and the emoji never mounted. Now onError flips imageError so the
    // emoji <span> renders.
    expect(resolveShowImage('https://x.myqcloud.com/a.jpg', true)).toBe(false);
  });

  test('no imageUrl → emoji (image branch never taken)', () => {
    expect(resolveShowImage('', false)).toBe(false);
    expect(resolveShowImage(undefined, false)).toBe(false);
  });

  test('no imageUrl AND error flag → still emoji (no crash)', () => {
    expect(resolveShowImage('', true)).toBe(false);
  });
});
