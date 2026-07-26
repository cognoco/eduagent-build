export type RequestView = {
  method(): string;
  url(): string;
};

export type HeldNowRequestDiscriminator = {
  method: 'GET';
  url: string;
};

export type HeldNowResponseView = {
  url(): string;
};

export type HeldNowRouteView<Response extends HeldNowResponseView> = {
  fetch(options: {
    method: HeldNowRequestDiscriminator['method'];
    url: string;
  }): Promise<Response>;
  fulfill(options: { response: Response }): Promise<void>;
};

const REQUEST_DISCRIMINATOR_QUERY_PARAM = '__e2e_request';
const HELD_NOW_RESPONSE_TIMEOUT_MS = 15_000;

export function createHeldNowRequestDiscriminator(
  request: RequestView,
  correlation: string,
): HeldNowRequestDiscriminator {
  const method = request.method();
  if (method !== 'GET') {
    throw new Error(`Held Now request must use GET, received ${method}`);
  }
  const url = new URL(request.url());
  url.searchParams.set(REQUEST_DISCRIMINATOR_QUERY_PARAM, correlation);

  return {
    method,
    url: url.toString(),
  };
}

export function isHeldNowCaptureCandidate(
  request: RequestView,
  captureEnabled: boolean,
): boolean {
  const url = new URL(request.url());
  return (
    captureEnabled &&
    request.method() === 'GET' &&
    url.pathname.endsWith('/v1/now') &&
    url.searchParams.get('scope') === 'self'
  );
}

export async function fetchAndFulfillHeldNowResponse<
  Response extends HeldNowResponseView,
>(
  route: HeldNowRouteView<Response>,
  discriminator: HeldNowRequestDiscriminator,
): Promise<Response> {
  const response = await route.fetch({
    method: discriminator.method,
    url: discriminator.url,
  });
  if (response.url() !== discriminator.url) {
    throw new Error(
      `Held Now response URL mismatch: expected ${discriminator.url}, received ${response.url()}`,
    );
  }
  await route.fulfill({ response });
  return response;
}

export async function waitForHeldNowResponse<Response>(
  responsePromise: Promise<Response>,
): Promise<Response> {
  let timeout: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(
        new Error(
          `Timed out after ${HELD_NOW_RESPONSE_TIMEOUT_MS}ms waiting for route-owned held Now response`,
        ),
      );
    }, HELD_NOW_RESPONSE_TIMEOUT_MS);
  });

  try {
    return await Promise.race([responsePromise, timeoutPromise]);
  } finally {
    clearTimeout(timeout);
  }
}
