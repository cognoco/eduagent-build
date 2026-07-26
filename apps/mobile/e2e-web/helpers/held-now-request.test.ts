import {
  createHeldNowRequestDiscriminator,
  matchesHeldNowRequest,
  type RequestView,
} from './held-now-request';

function requestView(method: string, url: string): RequestView {
  return {
    method: () => method,
    url: () => url,
  };
}

describe('held Now request discriminator', () => {
  it('matches the exact held request across distinct lifecycle wrappers', () => {
    const heldUrl =
      'https://api-stg.mentomate.com/v1/now?scope=self&__e2e_request=wi-2234';
    const routedRequest = requestView('GET', heldUrl);
    const responseRequest = requestView('GET', heldUrl);

    expect(responseRequest).not.toBe(routedRequest);
    expect(
      matchesHeldNowRequest(responseRequest, {
        method: 'GET',
        url: heldUrl,
      }),
    ).toBe(true);
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
    const heldUrl =
      'https://api-stg.mentomate.com/v1/now?scope=self&__e2e_request=wi-2234';

    expect(
      matchesHeldNowRequest(
        requestView('GET', 'https://api-stg.mentomate.com/v1/now?scope=self'),
        { method: 'GET', url: heldUrl },
      ),
    ).toBe(false);
    expect(
      matchesHeldNowRequest(
        requestView(
          'GET',
          'https://api-stg.mentomate.com/v1/now?scope=supporter-hub&__e2e_request=wi-2234',
        ),
        { method: 'GET', url: heldUrl },
      ),
    ).toBe(false);
    expect(
      matchesHeldNowRequest(requestView('POST', heldUrl), {
        method: 'GET',
        url: heldUrl,
      }),
    ).toBe(false);
  });
});
