// Transaction rollback path tests for user.js model methods that wrap
// multi-statement work in a BEGIN/COMMIT block via db.pool.connect().
// We mock the pg pool/client so an INSERT can be forced to throw, then
// assert ROLLBACK was issued and the client was released back to the pool.

jest.mock('../models/db', () => ({
  query: jest.fn(),
  pool: { connect: jest.fn() },
}));

const db = require('../models/db');
const User = require('../models/user');

// Build a fake pg client whose query() resolves a configurable sequence
// of results, optionally throwing on a chosen call index.
function makeClient() {
  const client = {
    query: jest.fn(),
    release: jest.fn(),
  };
  return client;
}

describe('User.create – transaction rollback', () => {
  afterEach(() => jest.clearAllMocks());

  test('rolls back and releases client when user_identities INSERT throws', async () => {
    const client = makeClient();
    db.pool.connect.mockResolvedValue(client);

    // Call sequence inside User.create:
    //   1. BEGIN
    //   2. INSERT INTO users ... RETURNING id   -> ok
    //   3. INSERT INTO user_identities ...       -> THROW
    //   4. ROLLBACK (in catch)
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 'new-user-id' }] }) // INSERT users
      .mockRejectedValueOnce(new Error('identities insert failed')) // INSERT user_identities
      .mockResolvedValueOnce({}); // ROLLBACK

    await expect(User.create('alice', 'alice@example.com', 'pw')).rejects.toThrow(
      'identities insert failed'
    );

    // BEGIN was issued, ROLLBACK was issued, COMMIT was NOT.
    const queriedSql = client.query.mock.calls.map((c) => c[0]);
    expect(queriedSql).toContain('BEGIN');
    expect(queriedSql).toContain('ROLLBACK');
    expect(queriedSql).not.toContain('COMMIT');

    // Client must always be returned to the pool.
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});

describe('User.createGoal – transaction rollback', () => {
  afterEach(() => jest.clearAllMocks());

  test('rolls back and releases client when the task INSERT throws', async () => {
    const client = makeClient();
    db.pool.connect.mockResolvedValue(client);

    // Spy on User.update so we can prove it is NOT reached on the rollback path
    // (it runs only after a successful COMMIT).
    const updateSpy = jest.spyOn(User, 'update').mockResolvedValue({});

    const goalData = {
      target_language: 'English',
      target_level: 'Intermediate',
      scenarios: [
        { title: 'Cafe', tasks: ['Order a coffee'] },
      ],
    };

    // Call sequence inside User.createGoal:
    //   1. BEGIN
    //   2. UPDATE user_goals ... abandoned     -> ok
    //   3. INSERT INTO user_goals ... RETURNING -> ok (returns newGoal)
    //   4. INSERT INTO user_tasks ...           -> THROW
    //   5. ROLLBACK (in catch)
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // UPDATE abandon previous active goals
      .mockResolvedValueOnce({ rows: [{ id: 42 }] }) // INSERT user_goals
      .mockRejectedValueOnce(new Error('task insert failed')) // INSERT user_tasks
      .mockResolvedValueOnce({}); // ROLLBACK

    await expect(User.createGoal('u1', goalData)).rejects.toThrow('task insert failed');

    const queriedSql = client.query.mock.calls.map((c) => c[0]);
    expect(queriedSql).toContain('BEGIN');
    expect(queriedSql).toContain('ROLLBACK');
    expect(queriedSql).not.toContain('COMMIT');

    // Client released exactly once.
    expect(client.release).toHaveBeenCalledTimes(1);

    // Post-commit side effect must not run when the transaction failed.
    expect(updateSpy).not.toHaveBeenCalled();

    updateSpy.mockRestore();
  });
});

describe('goal lifecycle transactions', () => {
  afterEach(() => jest.clearAllMocks());

  test('archiving the active goal activates the latest paused goal atomically', async () => {
    const client = makeClient();
    db.pool.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 7, status: 'active' }] }) // owned goal
      .mockResolvedValueOnce({ rows: [{ id: 7, status: 'archived' }] }) // archive
      .mockResolvedValueOnce({ rows: [] }) // no remaining active goal
      .mockResolvedValueOnce({ rows: [{ id: 6 }] }) // activate paused fallback
      .mockResolvedValueOnce({}); // COMMIT

    await expect(User.archiveGoal('u1', 7)).resolves.toEqual({
      goal: { id: 7, status: 'archived' },
      active_goal_id: 6,
    });

    const sql = client.query.mock.calls.map(call => call[0]).join('\n');
    expect(sql).toContain("SET status = 'archived'");
    expect(sql).toContain("status = 'paused'");
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('switch refuses completed and archived goals without pausing the current goal', async () => {
    const client = makeClient();
    db.pool.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // target status is not active/paused
      .mockResolvedValueOnce({}); // ROLLBACK

    await expect(User.switchActiveGoal('u1', 9)).resolves.toBeNull();
    const sql = client.query.mock.calls.map(call => call[0]).join('\n');
    expect(sql).toContain("status IN ('active', 'paused')");
    expect(sql).not.toContain("SET status = 'paused'");
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('deleting an active goal cascades in PostgreSQL and selects a fallback', async () => {
    const client = makeClient();
    db.pool.connect.mockResolvedValue(client);
    client.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 7, status: 'active' }] })
      .mockResolvedValueOnce({ rows: [] }) // DELETE
      .mockResolvedValueOnce({ rows: [] }) // active lookup
      .mockResolvedValueOnce({ rows: [{ id: 5 }] }) // fallback
      .mockResolvedValueOnce({}); // COMMIT

    await expect(User.deleteGoal('u1', 7)).resolves.toEqual({
      deleted_goal_id: 7,
      active_goal_id: 5,
    });
    expect(client.query.mock.calls.some(call => String(call[0]).includes('DELETE FROM user_goals'))).toBe(true);
    expect(client.query).toHaveBeenLastCalledWith('COMMIT');
  });
});
