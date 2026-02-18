// Manual mock for stripe SDK — resolves imports until stripe is added to dependencies.
// Jest auto-discovers __mocks__/stripe.ts at rootDir for third-party module mocking.

const mockStripeInstance = {
  webhooks: {
    constructEventAsync: jest.fn(),
  },
  customers: {
    create: jest.fn(),
    retrieve: jest.fn(),
  },
  subscriptions: {
    create: jest.fn(),
    update: jest.fn(),
    retrieve: jest.fn(),
  },
  checkout: {
    sessions: {
      create: jest.fn(),
    },
  },
};

const Stripe = jest.fn().mockReturnValue(mockStripeInstance);

// Static methods exposed by the Stripe SDK
(Stripe as unknown as Record<string, unknown>).createFetchHttpClient = jest
  .fn()
  .mockReturnValue({});
(Stripe as unknown as Record<string, unknown>).createSubtleCryptoProvider = jest
  .fn()
  .mockReturnValue({});

export default Stripe;
