/**
 * Inngest hosted-plan limits.
 *
 * Deliberately a zero-import leaf module: these are plain config constants that
 * several Inngest function files read at module-load time to build their
 * `createFunction` config. Function tests routinely `jest.mock('../client')`
 * with a transport-capture harness that only re-exports `inngest`; if the cap
 * lived in `client.ts` that mock would strip it to `undefined` and every
 * function would silently register `concurrency: { limit: undefined }`. Keeping
 * it in a separate leaf module (which tests do NOT mock) means the real value
 * always flows through, with a single source of truth shared by the functions,
 * their tests, and the guard test.
 */

/**
 * Hard cap on per-function `concurrency.limit` imposed by the current Inngest
 * hosted plan (Free = 5). The plan REJECTS app sync if ANY function declares a
 * higher limit — and because one rejected function blocks the WHOLE app from
 * registering, a single over-cap value silently kills every Inngest function
 * (all crons + background jobs go dark with no error in app logs). This is
 * exactly what happened to staging 2026-05→06.
 *
 * Every function's `concurrency.limit` MUST be <= this value. To run higher,
 * upgrade the Inngest plan FIRST, then raise this constant. Enforced forward-
 * only by `inngest-concurrency-cap.guard.test.ts`.
 */
export const INNGEST_PLAN_CONCURRENCY_CAP = 5;
