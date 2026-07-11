import { ensureFetchIsSpyable } from './ensure-fetch-spyable';

// WI-1791 regression guard: jest.spyOn(global|globalThis, 'fetch') throws
// "Property `fetch` does not exist in the provided object" on Node builds
// where the built-in `fetch` global is backed by an internal
// accessor/interceptor. jest-mock@30's spyOn/mockRestore cycle `delete`s
// `fetch` on restore instead of restoring the real implementation, so a
// later jest.spyOn(globalThis, 'fetch') call sees it genuinely missing (see
// ensure-fetch-spyable.ts for the full mechanism — reflection APIs like
// hasOwnProperty/getOwnPropertyDescriptor never observe this property at
// all, even right after a successful assignment, so the fix and this guard
// key off `typeof globalThis.fetch` rather than ownership).
//
// Simulate the broken state directly (host-independent) rather than relying
// on a real spyOn/mockRestore cycle actually breaking on this machine.

describe('ensureFetchIsSpyable', () => {
  it('re-installs fetch so jest.spyOn succeeds after it goes missing', () => {
    const realFetch = globalThis.fetch;
    expect(typeof realFetch).toBe('function');

    // Simulate the affected-host broken state: a prior test's buggy
    // mockRestore() wiped `fetch` out via `delete`.
    delete (globalThis as { fetch?: typeof fetch }).fetch;
    expect(typeof globalThis.fetch).not.toBe('function');

    // Without the fix, jest.spyOn throws the literal error from the AC.
    expect(() => jest.spyOn(globalThis, 'fetch')).toThrow(
      'Property `fetch` does not exist in the provided object',
    );

    ensureFetchIsSpyable();

    expect(typeof globalThis.fetch).toBe('function');

    let spy: jest.SpyInstance;
    expect(() => {
      spy = jest
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(new Response('ok'));
    }).not.toThrow();

    spy!.mockRestore();

    // Restore the real implementation regardless of what mockRestore did,
    // so this test can't leak a deleted/mocked fetch into later tests.
    globalThis.fetch = realFetch;
  });

  it('is a no-op when fetch is already present', () => {
    expect(typeof globalThis.fetch).toBe('function');
    const before = globalThis.fetch;

    ensureFetchIsSpyable();

    expect(globalThis.fetch).toBe(before);
  });
});
