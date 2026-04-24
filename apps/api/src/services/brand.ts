// ---------------------------------------------------------------------------
// [SUG-1] Brand constants for server-rendered HTML
//
// API routes render a handful of transactional HTML surfaces (billing
// success/cancel, consent landing) that cannot pull from the mobile
// design-token pipeline. These constants keep the brand color in one place
// so updates don't require grepping CSS strings across routes.
//
// Mobile / design-system changes still live in
// `packages/design-tokens`; this file is intentionally small and scoped to
// server-rendered HTML only.
// ---------------------------------------------------------------------------

/** Primary brand color — keep in sync with packages/design-tokens primary. */
export const BRAND_COLOR_PRIMARY = '#6c5ce7';
