// ---------------------------------------------------------------------------
// Stripe SDK Wrapper — Tests
// ---------------------------------------------------------------------------

jest.mock('stripe', () => {
  const mockStripeInstance = {
    webhooks: {
      constructEventAsync: jest.fn(),
    },
  };

  const StripeMock = jest.fn().mockReturnValue(mockStripeInstance);

  // Static methods
  StripeMock.createFetchHttpClient = jest.fn().mockReturnValue({});
  StripeMock.createSubtleCryptoProvider = jest.fn().mockReturnValue({});

  return {
    __esModule: true,
    default: StripeMock,
  };
});

import Stripe from 'stripe';
import { createStripeClient, verifyWebhookSignature } from './stripe';

const StripeMock = Stripe as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createStripeClient', () => {
  it('creates a Stripe instance with the provided secret key', () => {
    const client = createStripeClient('sk_test_123');

    expect(StripeMock).toHaveBeenCalledWith('sk_test_123', {
      apiVersion: expect.any(String),
      httpClient: expect.anything(),
    });
    expect(client).toBeDefined();
  });

  it('uses the fetch HTTP client for Workers compatibility', () => {
    createStripeClient('sk_test_456');

    expect(Stripe.createFetchHttpClient).toHaveBeenCalled();
  });
});

describe('verifyWebhookSignature', () => {
  it('calls constructEventAsync with correct parameters', async () => {
    const mockEvent = { id: 'evt_123', type: 'customer.subscription.created' };
    const instance = StripeMock.mock.results[0]?.value ?? {
      webhooks: { constructEventAsync: jest.fn() },
    };

    // Create a client first so we have an instance
    createStripeClient('unused');
    const latestInstance =
      StripeMock.mock.results[StripeMock.mock.results.length - 1].value;
    latestInstance.webhooks.constructEventAsync.mockResolvedValue(mockEvent);

    const result = await verifyWebhookSignature(
      '{"test": true}',
      'sig_header',
      'whsec_secret'
    );

    expect(result).toEqual(mockEvent);
  });

  it('uses SubtleCrypto provider for Workers runtime', async () => {
    createStripeClient('unused');
    const latestInstance =
      StripeMock.mock.results[StripeMock.mock.results.length - 1].value;
    latestInstance.webhooks.constructEventAsync.mockResolvedValue({
      id: 'evt_1',
    });

    await verifyWebhookSignature('payload', 'sig', 'secret');

    expect(Stripe.createSubtleCryptoProvider).toHaveBeenCalled();
  });

  it('propagates errors from signature verification', async () => {
    createStripeClient('unused');
    const latestInstance =
      StripeMock.mock.results[StripeMock.mock.results.length - 1].value;
    latestInstance.webhooks.constructEventAsync.mockRejectedValue(
      new Error('Signature verification failed')
    );

    await expect(
      verifyWebhookSignature('payload', 'bad_sig', 'secret')
    ).rejects.toThrow('Signature verification failed');
  });
});
