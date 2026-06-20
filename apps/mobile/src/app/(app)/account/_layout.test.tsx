import { unstable_settings, ACCOUNT_PRESENTATION } from './_layout';

describe('account nested layout', () => {
  it('seeds the index route and presents the account surface modally', () => {
    expect(unstable_settings).toEqual({ initialRouteName: 'index' });
    expect(ACCOUNT_PRESENTATION).toBe('modal');
  });
});
