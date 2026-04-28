import { firstParam } from './route-params';

describe('firstParam', () => {
  it('returns the value unchanged for a plain string', () => {
    expect(firstParam('foo')).toBe('foo');
  });

  it('returns undefined for undefined input', () => {
    expect(firstParam(undefined)).toBeUndefined();
  });

  // [BUG-635] Expo Router yields string[] when a key appears more than once
  // in the URL. The historical bug: code called FileSystem.readAsStringAsync
  // with the array, which was coerced to "uri1,uri2" and failed silently.
  it('[BUG-635] returns the first element of a string[] from Expo Router', () => {
    expect(firstParam(['file:///photo-1.jpg', 'file:///photo-2.jpg'])).toBe(
      'file:///photo-1.jpg'
    );
  });

  it('returns undefined for an empty array', () => {
    expect(firstParam([])).toBeUndefined();
  });
});
