// ---------------------------------------------------------------------------
// [WI-2952] Shared type for the persisted-learning-text safety gate
// (MMT-ADR-0036 §4 item 6). Moved here from
// `apps/api/src/services/learning-text-safety/scan.ts` because it is returned
// by an exported service function AND crosses the services/ →
// inngest/functions/ boundary — the anti-pattern rule ("A type is
// client-facing if it's returned by an exported service function, appears in
// a route response, or is used by more than one file") requires it live in
// `@eduagent/schemas`. `scan.ts` re-exports it so existing imports keep
// working.
// ---------------------------------------------------------------------------

/**
 * [WI-2952] Provenance and producer vendor, INSEPARABLE in the type.
 *
 * `ScanLearningTextInput` carries them as two independent fields, so
 * `{provenance:'user', producerVendor:'anthropic'}` and
 * `{provenance:'llm', producerVendor:null}` both compile. On a path whose only
 * job is to keep a producing vendor out of the judge pool that is the wrong
 * shape: the first is a category error (a learner is not a vendor) and the
 * second is the exact fail-closed hole that silently drops learner text.
 *
 * This union makes both unrepresentable. A caller cannot declare `'llm'`
 * without naming who produced it, and cannot attach a vendor to text a human
 * typed.
 *
 * `producerVendor` is the VENDOR (`anthropic`), never the model id
 * (`claude-sonnet-4-6`) — judge exclusion matches vendor names, so a model id
 * excludes nothing and lets the producing vendor grade its own output. The type
 * cannot catch that (both are `string`); only a test asserting the vendor is
 * absent from the RESOLVED judge pool can.
 */
export type LearningTextAuthor =
  | { readonly provenance: 'llm'; readonly producerVendor: string }
  | { readonly provenance: 'user' }
  | { readonly provenance: 'migration' };
