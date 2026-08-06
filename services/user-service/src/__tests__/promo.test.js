jest.mock('../models/db', () => ({ query: jest.fn() }));
jest.mock('../utils/notificationPublisher', () => ({ publishNotification: jest.fn() }));

const mockValidatePromotionCode = jest.fn();
jest.mock('../stripe/stripeService', () => ({
  stripeService: { validatePromotionCode: mockValidatePromotionCode },
}));

const userController = require('../controllers/userController');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.body = data; return this; },
  };
}

describe('legacy promotion-code validation alias', () => {
  beforeEach(() => mockValidatePromotionCode.mockReset());

  test('returns Stripe promotion details', async () => {
    mockValidatePromotionCode.mockResolvedValue({
      code: 'WELCOME20',
      percent_off: 20,
      amount_off: null,
      currency: null,
      description: '20% off',
    });
    const res = mockRes();

    await userController.validatePromoCode({ body: { code: 'WELCOME20' } }, res);

    expect(mockValidatePromotionCode).toHaveBeenCalledWith('WELCOME20');
    expect(res.statusCode).toBe(200);
    expect(res.body).toMatchObject({ valid: true, code: 'WELCOME20', discount: 20 });
  });

  test('returns 404 for an unknown or inactive Stripe promotion code', async () => {
    mockValidatePromotionCode.mockResolvedValue(null);
    const res = mockRes();

    await userController.validatePromoCode({ body: { code: 'BOGUS' } }, res);

    expect(res.statusCode).toBe(404);
    expect(res.body.valid).toBe(false);
  });

  test('returns 502 when Stripe validation is unavailable', async () => {
    mockValidatePromotionCode.mockRejectedValue(new Error('network timeout'));
    const res = mockRes();

    await userController.validatePromoCode({ body: { code: 'WELCOME20' } }, res);

    expect(res.statusCode).toBe(502);
    expect(res.body.valid).toBe(false);
  });
});
