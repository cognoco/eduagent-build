import {
  createHeldNowRequestDiscriminator,
  fetchAndFulfillHeldNowResponse,
  isHeldNowCaptureCandidate,
  type RequestView,
  waitForHeldNowResponse,
} from './held-now-request';

function requestView(method: string, url: string): RequestView {
  return {
    method: () => method,
    url: () => url,
  };
}

describe('held Now request discriminator', () => {
  it('keeps ownership when the response lifecycle hides the continued URL rewrite', async () => {
    const originalUrl = 'https://api-stg.mentomate.com/v1/now?scope=self';
    const discriminator = createHeldNowRequestDiscriminator(
      requestView('GET', originalUrl),
      'wi-2234',
    );
    const responseRequest = requestView('GET', originalUrl);
    const exactResponse = { url: () => discriminator.url };
    const lifecycle: string[] = [];
    const route = {
      async fetch(options: { method: 'GET'; url: string }) {
        expect(options).toEqual(discriminator);
        lifecycle.push('fetch');
        return exactResponse;
      },
      async fulfill(options: { response: typeof exactResponse }) {
        expect(options.response).toBe(exactResponse);
        lifecycle.push('fulfill');
      },
    };

    expect(responseRequest.url()).not.toBe(discriminator.url);
    await expect(
      fetchAndFulfillHeldNowResponse(route, discriminator),
    ).resolves.toBe(exactResponse);
    expect(lifecycle).toEqual(['fetch', 'fulfill']);
  });

  it('adds an explicit correlation to the exact held request URL', () => {
    expect(
      createHeldNowRequestDiscriminator(
        requestView('GET', 'https://api-stg.mentomate.com/v1/now?scope=self'),
        'wi-2234',
      ),
    ).toEqual({
      method: 'GET',
      url: 'https://api-stg.mentomate.com/v1/now?scope=self&__e2e_request=wi-2234',
    });
  });

  it('rejects adjacent Now requests', () => {
    expect(
      isHeldNowCaptureCandidate(
        requestView('GET', 'https://api-stg.mentomate.com/v1/now?scope=self'),
        true,
      ),
    ).toBe(true);
    expect(
      isHeldNowCaptureCandidate(
        requestView(
          'GET',
          'https://api-stg.mentomate.com/v1/now?scope=supporter-hub&__e2e_request=wi-2234',
        ),
        true,
      ),
    ).toBe(false);
    expect(
      isHeldNowCaptureCandidate(
        requestView('POST', 'https://api-stg.mentomate.com/v1/now?scope=self'),
        true,
      ),
    ).toBe(false);
    expect(
      isHeldNowCaptureCandidate(
        requestView(
          'GET',
          'https://api-stg.mentomate.com/v1/now?scope=self&__e2e_request=adjacent',
        ),
        true,
      ),
    ).toBe(false);
    expect(
      isHeldNowCaptureCandidate(
        requestView('GET', 'https://api-stg.mentomate.com/v1/now?scope=self'),
        false,
      ),
    ).toBe(false);
  });

  it('rejects a response that loses the exact correlated URL', async () => {
    const discriminator = createHeldNowRequestDiscriminator(
      requestView('GET', 'https://api-stg.mentomate.com/v1/now?scope=self'),
      'wi-2234',
    );
    const fulfill = jest.fn();
    const route = {
      async fetch() {
        return {
          url: () => 'https://api-stg.mentomate.com/v1/now?scope=self',
        };
      },
      fulfill,
    };

    await expect(
      fetchAndFulfillHeldNowResponse(route, discriminator),
    ).rejects.toThrow('Held Now response URL mismatch');
    expect(fulfill).not.toHaveBeenCalled();
  });

  it('retains and clears the 15-second response bound', async () => {
    jest.useFakeTimers();
    try {
      await expect(
        waitForHeldNowResponse(Promise.resolve('response')),
      ).resolves.toBe('response');
      expect(jest.getTimerCount()).toBe(0);

      const timedResponse = waitForHeldNowResponse(
        new Promise<never>(() => undefined),
      );
      const timedExpectation = expect(timedResponse).rejects.toThrow(
        'Timed out after 15000ms waiting for route-owned held Now response',
      );
      await jest.advanceTimersByTimeAsync(15_000);
      await timedExpectation;
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.useRealTimers();
    }
  });
});
