import { ResponseAudioRouter } from './responseAudioRouter';
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function fixture() {
  const play = jest.fn(); const flush = jest.fn();
  return { play, flush, router: new ResponseAudioRouter({ play, flush }) };
}
test('text activation cannot let a later resolved Blob overtake an earlier packet', async () => {
  const { router, play, flush } = fixture();
  const first = deferred();
  router.receive(first.promise);
  router.receive(Promise.resolve({ responseId: 'a', pcm: 'second' }));
  router.activate('a');
  const done = router.finish('a');
  await Promise.resolve();
  expect(play).not.toHaveBeenCalled();
  first.resolve({ responseId: 'a', pcm: 'first' });
  await done;
  expect(play.mock.calls).toEqual([['first'], ['second']]);
  expect(flush).toHaveBeenCalledTimes(1);
});
test('future packets survive the previous transcript and old done does not flush a new response', async () => {
  const { router, play, flush } = fixture();
  await router.receive({ responseId: 'b', pcm: 'future' });
  router.activate('a');
  expect(play).not.toHaveBeenCalled();
  router.activate('b');
  expect(play).toHaveBeenCalledWith('future');
  await router.finish('a');
  expect(flush).not.toHaveBeenCalled();
  await router.finish('b');
  expect(flush).toHaveBeenCalledTimes(1);
});
test('cut invalidates a pending conversion without blocking the new generation', async () => {
  const { router, play } = fixture();
  const late = deferred();
  router.activate('a');
  const old = router.receive(late.promise);
  router.reset();
  router.activate('b');
  await router.receive({ responseId: 'b', pcm: 'new' });
  late.resolve({ responseId: 'a', pcm: 'old' });
  await old;
  expect(play.mock.calls).toEqual([['new']]);
  expect(router.activate('a')).toBe(false);
});
test('done before transcript flushes the short queued prefix once activated', async () => {
  const { router, play, flush } = fixture();
  await router.receive({ responseId: 'a', pcm: 'short' });
  await router.finish('a');
  expect(flush).not.toHaveBeenCalled();
  router.activate('a');
  await router.serial;
  expect(play).toHaveBeenCalledWith('short');
  expect(flush).toHaveBeenCalledTimes(1);
});
