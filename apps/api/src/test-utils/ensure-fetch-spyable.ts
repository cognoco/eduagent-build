// WI-1791: on Node builds where the built-in `fetch` global is backed by an
// internal accessor/interceptor rather than a plain own data property,
// `Object.prototype.hasOwnProperty`/`getOwnPropertyDescriptor` never observe
// it (confirmed empirically — true even immediately after a successful
// assignment), so jest-mock@30's `spyOn(global|globalThis, 'fetch')` always
// computes `isMethodOwner = false` and its restore closure always takes the
// `delete object[methodKey]` branch. That `delete` doesn't fall back to the
// real implementation — it wipes `fetch` out entirely, so a later
// `jest.spyOn(globalThis, 'fetch')` (in the next test or describe block)
// throws "Property `fetch` does not exist in the provided object" because
// `globalThis.fetch` is now genuinely falsy.
//
// Reflection-based re-pinning (`Object.defineProperty`) does not fix this —
// it never registers as an own property here either. Instead, capture the
// real implementation once per test file (module load, before any test or
// spy has run) and, before every test, plainly reassign it whenever it has
// gone missing. Plain assignment is what jest-mock's own spyOn uses to
// install its mock in the first place, so it's known to work here even
// though it's invisible to `hasOwnProperty`.
const ORIGINAL_FETCH: typeof fetch | undefined = globalThis.fetch;

export function ensureFetchIsSpyable(): void {
  if (typeof globalThis.fetch === 'function') {
    return;
  }
  if (typeof ORIGINAL_FETCH === 'function') {
    globalThis.fetch = ORIGINAL_FETCH;
  }
}
