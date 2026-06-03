// Mock DB/notification side-effects so requiring the controller is cheap.
jest.mock('../models/db', () => ({ query: jest.fn() }));
jest.mock('../utils/notificationPublisher', () => ({ publishNotification: jest.fn() }));

const userController = require('../controllers/userController');

function mockRes() {
  const res = {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
  return res;
}

// ─── Pure validator: server-side promo table ─────────────────────────

describe('_validatePromo – pure validation', () => {
  test('returns promo object for known code WELCOME20', () => {
    const promo = userController._validatePromo('WELCOME20');
    expect(promo).toMatchObject({ code: 'WELCOME20', discount: 20 });
  });

  test('returns promo object for known code ANNUAL50', () => {
    const promo = userController._validatePromo('ANNUAL50');
    expect(promo).toMatchObject({ code: 'ANNUAL50', discount: 50 });
  });

  test('is case-insensitive and trims whitespace', () => {
    expect(userController._validatePromo('  welcome20 ')).toMatchObject({ code: 'WELCOME20' });
  });

  test('returns null for unknown code', () => {
    expect(userController._validatePromo('NOPE')).toBeNull();
  });

  test('returns null for empty/whitespace/non-string', () => {
    expect(userController._validatePromo('')).toBeNull();
    expect(userController._validatePromo('   ')).toBeNull();
    expect(userController._validatePromo(undefined)).toBeNull();
    expect(userController._validatePromo(null)).toBeNull();
    expect(userController._validatePromo(123)).toBeNull();
  });
});

// ─── Endpoint: POST /api/users/promo/validate ────────────────────────

describe('validatePromoCode – endpoint', () => {
  test('200 + discount payload for valid code', async () => {
    const req = { body: { code: 'WELCOME20' } };
    const res = mockRes();

    await userController.validatePromoCode(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.code).toBe('WELCOME20');
    expect(res.body.discount).toBe(20);
    expect(res.body.description).toBeDefined();
  });

  test('404 for unknown code', async () => {
    const req = { body: { code: 'BOGUS' } };
    const res = mockRes();

    await userController.validatePromoCode(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.valid).toBe(false);
    expect(res.body.error).toBeDefined();
  });

  test('404 when body is missing', async () => {
    const req = {};
    const res = mockRes();

    await userController.validatePromoCode(req, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.valid).toBe(false);
  });
});
