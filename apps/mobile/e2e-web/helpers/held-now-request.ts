export type RequestView = {
  method(): string;
  url(): string;
};

export type HeldNowRequestDiscriminator = {
  method: 'GET';
  url: string;
};

const REQUEST_DISCRIMINATOR_QUERY_PARAM = '__e2e_request';

export function createHeldNowRequestDiscriminator(
  request: RequestView,
  correlation: string,
): HeldNowRequestDiscriminator {
  const url = new URL(request.url());
  url.searchParams.set(REQUEST_DISCRIMINATOR_QUERY_PARAM, correlation);

  return {
    method: 'GET',
    url: url.toString(),
  };
}

export function matchesHeldNowRequest(
  candidate: RequestView,
  discriminator: HeldNowRequestDiscriminator,
): boolean {
  return (
    candidate.method() === discriminator.method &&
    candidate.url() === discriminator.url
  );
}
