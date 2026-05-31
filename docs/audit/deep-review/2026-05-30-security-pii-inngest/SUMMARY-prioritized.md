# Security + PII Review — `apps/api/src/inngest` (58 functions) — Prioritized Summary (2026-05-30)

Coordinator's holistic re-prioritization of the `security` + `pii` agents on the Inngest
background-job surface, with manual verification. Raw findings:
[`security-reviewer.md`](./security-reviewer.md), [`pii-leak-scanner.md`](./pii-leak-scanner.md).

**Scope:** path-scoped audit of `apps/api/src/inngest/` — the surface the prior request-path
run deliberately under-sampled because these functions run **outside** the Hono auth chain
(no Clerk JWT / consent / proxy middleware), derive tenant scope from the **event payload**,
and read config from `process.env`. Not a PR diff — all findings [PRE-EXISTING].

**Headline:** **No P0. No user-input-exploitable cross-tenant access.** Scope-from-event is
done correctly across the destructive crons and the jobs read in full — the team has
internalized the forged/replayed-event threat (many jobs carry "the event is
replayable/operator-controlled, so the id alone cannot prove ownership" comments and bound
every leaf query). The findings are (a) a **systemic PII-minimization gap at the Inngest
third-party trust boundary**, and (b) two **forged-internal-event cross-account** defense-in-depth
gaps where a consumer trusts a producer-validated id pairing.

---

## Cross-run theme: the Inngest third-party trust boundary

Inngest persists **both event payloads and memoized `step.run` return values** in its
dashboard/state store (readable by anyone with Inngest console / vendor-support access) for the
run's retention window. PII used only as a **local variable inside a step closure** is NOT
serialized and is clean. Across both 2026-05-30 runs this is now **6 HIGH-class sites** of one
pattern, with **one canonical fix** and an in-repo precedent (`resend-webhook.ts` `maskEmail`,
`[SEC-6/BUG-722]`):

> **Fix pattern:** carry only ids (`profileId`/`sessionId`) across the boundary, and re-fetch
> the PII from the DB **inside the consuming step closure** — never return it from a separate
> `step.run`, never put it in the event `data`.

---

## P1 — Should fix

### 1. Minors' raw free-text / transcripts cross the Inngest boundary (SYSTEMIC — 5 HIGH sites)
- **Source:** pii-leak-scanner (H1–H4) + the prior run's `filing.ts` H1 · **Verified** (`freeform-filing.ts:152-159` returns the transcript from `step.run` — confirmed by reading source).
- The HIGH sites:
  | Site | Boundary | PII |
  |---|---|---|
  | `routes/filing.ts:175-180,244-249` *(prior run)* | event payload | minor's transcript |
  | `session-exchange.ts:1806 → ask-silent-classify.ts:37` (schema mandates `classifyInput`) | event payload | minor's raw "ask" text |
  | `session-exchange.ts:1196 → topic-probe-extract.ts` (`inngest-events.ts` `learnerMessage`) | event payload | minor's raw probe answer |
  | `auto-file-session.ts:71-76` | memoized step return | minor's full transcript |
  | `freeform-filing.ts:152-159` | memoized step return | minor's full transcript |
- **Correction to prior guidance:** last run I cited `freeform-filing.ts:151-160` as the *safe*
  pattern for fixing `filing.ts` H1. That was incomplete — it removes the transcript from the
  *event* but still **returns** it from `fetch-transcript`, so a copy lands in step state. The
  real fix for ALL of these is to re-fetch **inside** the consuming step closure
  (`retry-filing` / `file-session` / `classify` / `seed-retention-card`) and never return it.
- **Why P1:** real children's-PII over-exposure to a third-party processor; not a breach/cross-user
  leak, but compliance-weighted (minors) and now demonstrably systemic. Each fix is local and
  behavior-preserving. For the two event-payload schemas, drop the PII field from the schema.

### 2. Forged-internal-event cross-account child-name leak — child-cap notifications
- **Source:** security-reviewer (MEDIUM #1) · **Verified** (`child-cap-notifications.ts:89-114,180-191` — owner resolved from `subscriptionId`, but `childProfileId` inserted with no account-membership check; `:116-142` joins + returns `profiles.displayName` to the owner).
- **Loc:** `services/child-cap-notifications.ts:178-189` (consumed by `notify-parent-child-cap-hit.ts`)
- **Scenario:** a forged/replayed `app/billing.profile_quota.exhausted` pairing Account A's
  `subscriptionId` with Account B's `childProfileId` records a notification on A's owner that
  renders **B's child display name** in A's parent UI.
- **Why P1 (raised from MEDIUM):** cross-account exposure of a **minor's name**, the fix is a
  one-query ownership check + a "break" test, and CLAUDE.md mandates the consumer re-validate.
  Gated today only because the sole producer (`billing/metering.ts`) validates the pairing —
  i.e. this consumer defends at one end where the rest of the surface defends at both.
- **Fix:** before insert, verify the child belongs to the subscription's account
  (`profiles.id = childProfileId AND subscriptions.id = subscriptionId` via the
  `accountId` join); add a negative-path test asserting a mismatched pair inserts nothing.

### 3. Forged-internal-event cross-account leak — monthly report emailed to wrong parent
- **Source:** security-reviewer (MEDIUM #2)
- **Loc:** `inngest/functions/monthly-report-cron.ts:256-449, 532-643`
- **Scenario:** `app/monthly-report.generate` with `{ parentId: A_owner, childId: B_child }`
  generates a report over B's data and **emails B's child name + struggle topics to A's email**.
  It re-checks consent + profile existence but never re-confirms the `familyLinks` parent→child
  link. The sibling `weeklyProgressPushGenerate` does it right — given only `parentId`, it
  re-derives children from `familyLinks` (`weekly-progress-push.ts:583-586`).
- **Why P1:** cross-account minor PII that **leaves the system** (email), low-cost fix, clear
  in-repo correct pattern to copy. (No request-path producer — internal cron fan-out only — so
  it requires forging/replaying an internal event, hence not P0.)
- **Fix:** verify the `familyLinks` link before generating (skip self-reports where
  `parentId === childId`); mirror `weeklyProgressPushGenerate`; add an unlinked-pair test.

---

## P2 — Worth noting

- **Names / birth year / struggle data in memoized step state** (lower-sensitivity tail of the
  systemic item — same fix): `weekly-progress-push.ts:851-861` (child names + struggle topics +
  **parent email**), `monthly-report-cron.ts:475-481` (name + struggles), `progress-summary.ts:83-93`
  (name + inventory — the known M2), `consent-revocation.ts:112-115` (name + **birth year**,
  COPPA-relevant), `session-completed.ts:1490` (struggle topics), `topic-probe-extract.ts:176-179`
  (transcript array). Fix with the same id-pass + re-fetch-in-step pattern.
- **Consent-revocation delete branch lacks the parent-chain `account_id` guard** the archive
  branch added after BUG-662 (`consent-revocation.ts:280-289` → `services/deletion.ts:283-313`).
  Asymmetry; low exploitability (needs a real WITHDRAWN consent row) but a refactor could weaken
  it silently. *(sec LOW #3)*
- **Module-level env singletons** in `helpers.ts`/`client.ts` (DB connection is
  `AsyncLocalStorage`-isolated; config values are plain module `let`s). Latent isolation hazard
  only if one isolate ever serves multiple environments' bindings. *(sec LOW #4)*
- **Feedback retry event** carries feedback free-text + support email (`feedback-delivery-failed.ts:26-31`)
  — user-initiated support content, lower sensitivity; logging is already shape-only. *(pii LOW #11)*

---

## Sweep-list correction (supersedes the prior run's list)

The 2026-05-30 security+pii (request-path) run listed M2 sweep sites partly from grep. This pass
**read the source** and corrects them:

| Site | Prior list | Verified verdict |
|---|---|---|
| `progress-summary.ts:85` | leak | **CONFIRMED** (name + inventory) |
| `weekly-progress-push.ts` | leak | **CONFIRMED — worse** (adds parent email + struggles) |
| `monthly-report-cron.ts` | leak | **CONFIRMED** |
| `weekly-self-reports.ts` | leak | **CLEAN** — step return is ids only; name is local |
| `recall-nudge-send.ts:139` | leak | **CLEAN** — `childName` local-only |
| `session-completed.ts:1120` | leak | **CLEAN** — `displayName` local; real leak is at **:1490** |

New M2-class sites found beyond the list: `consent-revocation.ts:112-115`, `topic-probe-extract.ts:176-179`, `session-completed.ts:1490`.

---

## Verified clean (defenses working)

Destructive crons (account-deletion, transcript-purge, archive-cleanup, webhook-idempotency-purge,
quota-reset) bounded by `profileId`/account/age with TOCTOU guards; `freeform-filing` M8a guard
throws on cross-profile session; webhook-reactive billing jobs are observe-only (entitlement
mutation stays in the signature-verified request handler with DB-resolved `accountId`); push/send
jobs re-scope topic titles by `subjects.profileId` and re-check consent (defend at both ends);
email masked before the `app/email.bounced` event; transcript-purge fan-out is ids-only;
session-completed vocabulary/insights/recap steps keep transcript/name/birthYear as locals; no
secrets logged; consent token fetched from DB "never from event payload — PII".

---

## Coverage (honest)

- **security:** 24 of 57 functions read in full (destructive crons, webhook-reactive, scope-from-event,
  minor-data/export/notification jobs); remaining 33 grep-screened for missing-`profileId` WHERE,
  secret logging, `event.data` id usage. Highest-yield next query named: handlers reading **two**
  ids (owner + target) and acting on both without an intervening ownership join.
- **pii:** all 59 function files examined for `send`/`step.run`-return PII; 18 read in depth, rest
  grep-swept; dependency return-shapes confirmed by reading `services/consent.ts`,
  `learner-profile.ts`, `resend-webhook.ts`, `inngest-events.ts`.
- **Tooling caveat (pii):** the `rg`/`rtk` proxy mangled some identifiers in command *output* only;
  every load-bearing finding was confirmed by reading actual source.

## Severity summary (agent scale)
security: 0 critical / 0 high / 2 medium / 2 low · pii: 4 high / 6 medium / 2 low
