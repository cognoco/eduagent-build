import { unstable_settings } from './_layout';

describe('subject hub nested layout', () => {
  it('seeds the index route for cross-stack pushes', () => {
    expect(unstable_settings).toEqual({ initialRouteName: 'index' });
  });
});
