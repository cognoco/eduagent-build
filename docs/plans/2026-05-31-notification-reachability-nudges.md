---
title: Notification Reachability and Nudges - Implementation Plan
date: 2026-05-31
profile: code
spec: docs/audit/2026-05-31-logical-gap-audit.md
status: not-implemented — carved (reachability=do-now, nudges=deferred, need_help=cut)
gap_ids: [notif-1, notif-2, notif-4]
revised: 2026-06-09 (end-user critique + 80/20 carve folded in — see Review History)
---

# Notification Reachability and Nudges - Implementation Plan

## ⏱ At a glance — read this header before re-opening the plan

> **What it is.** Two unrelated things bundled in one doc: (A) a *bug-fix* that
> makes already-built push notifications actually reach guardian-only users and
> people who dismissed the OS prompt (gaps `notif-1`/`notif-2`, tasks T1–T3); and
> (B) a *new feature* — a child→parent ("learner-to-guardian") template nudge
> (gap `notif-4`, tasks T4–T6).
>
> **Is it implemented?** **No — none of it.** Verified against code 2026-06-09.
> The only overlap with reality is a pre-existing `registerIfAllowed` callback
> (`apps/mobile/src/hooks/use-push-token-registration.ts:70`) that T2 would
> extend. Nudges today are **parent→child only**, 4 fixed encouragement
> templates (`nudge_template` pg enum, `packages/database/src/schema/nudges.ts:5`);
> there is no direction concept and no `need_help`/`proud_moment` template.
>
> **Should it be implemented? — carved decision (see "80/20 Carve" below):**
> - **DO NOW (low-risk, high-value):** the reachability slice — **T1-minimal**
>   (toggle requests OS permission + "Open Settings" fallback; *not* the full
>   three-signal truth table) and **T2** (wire the existing `registerIfAllowed`).
>   Optionally **T3-clone** (one guardian primer reusing the existing primer
>   hook's live-OS short-circuit). This is where ~80% of the value sits.
> - **CUT from v1:** `need_help` template. As specified it ships a
>   trust-damaging dead-end (quiet-hours suppression at night + no parent
>   response path + no context). Worse than not having it. See HIGH-1/2.
> - **DEFER (new feature, identity-coupled):** the rest of T4–T6. If revived,
>   the safe subset is `thanks` + `proud_moment` only, and the findings folded
>   into T4 below must be resolved first. Blocked on the identity-foundation
>   classification regardless (auth model is moving).

> **⚠️ Classification pending** (added 2026-06-01) — the deferred nudge half
> (T4–T6) must be re-triaged against the identity-foundation clean-cut target
> before building; its auth depends on the family-link/membership model that the
> redesign is relocating. The reachability slice (T1–T3) is **not** identity-coupled
> and can proceed independently. See
> [`_wip/identity-foundation/ROADMAP.md`](../../_wip/identity-foundation/ROADMAP.md)
> § "Sibling-plan re-triage".

**Goal:** Make notification delivery intentionally reachable for guardian-only
users and users who previously dismissed permission prompts, and decide the
child-to-parent nudge model with an implemented path.

**Approach:** Fix notification reachability at the app boundary first (the
do-now slice): permissions, token registration, and settings need to reflect OS
state. The reciprocal learner-to-guardian signal is a *separate, deferred*
feature — if built, it uses explicit templates (never free-text) to preserve the
child-safety posture, and it must not promise urgency the delivery path can't
keep (see the `need_help` cut, HIGH-1).

> **gap_ids note:** this plan covers `notif-1`, `notif-2`, `notif-4` from the
> source audit. `notif-3` is intentionally not in scope here — confirm against
> `docs/audit/2026-05-31-logical-gap-audit.md` whether it is deferred or owned
> by another plan, and record that here before this plan is marked ready.

## 80/20 Carve (added 2026-06-09)

The two halves of this plan have opposite risk/value profiles. Bundled, the cheap
valuable half is held hostage to the risky half's design debates and the
identity-foundation gate. Split them:

| Slice | Tasks | Value | Risk | Verdict |
|---|---|---|---|---|
| **Reachability** | T1-min, T2, (T3-clone) | High — makes already-built struggle alerts / digests / subscribe-nudge actually arrive for guardians | Low — no new product surface, no migration, not identity-coupled | **Do now** |
| **`need_help` signal** | (part of T4/T5) | Negative as specified — a help button that no-ops at night and dead-ends with no context teaches the user it's fake | High — trust damage at the emotional moment that matters | **Cut from v1** |
| **`thanks`/`proud_moment` nudges** | rest of T4–T6 | Modest — warm fire-and-forget reciprocity | Medium — net-new scope, migration, identity-coupled auth on a moving model | **Defer** to a post-identity-foundation plan |

**The 80% for ~20% of the cost:** T2 is nearly free (`registerIfAllowed` already
exists — just export + wire). T1-minimal is one screen change: toggle-on →
request OS permission → register token → on block, show one "Notifications are
off — Open Settings" row. You do **not** need to surface three independent signal
states to the user; users have one mental model ("notifications work / don't").
That captures essentially all the reachability value for a fraction of full-T1.

**What this carve deliberately drops:** the full three-signal truth-table UX
(over-engineered for the user's actual need; exhaustively testing every
OS-permission × `pushEnabled` × token-present combination is real cost for an
imperceptible distinction) and the entire child→parent feature.

## Scope

In scope:
- `apps/mobile/src/app/(app)/more/notifications.tsx`
- `apps/mobile/src/hooks/use-push-token-registration.ts`
- `apps/mobile/src/hooks/use-post-session-notification-ask.ts`
- `apps/mobile/src/components/nudge/**`
- `apps/mobile/src/components/home/ParentHomeScreen.tsx` (inbound learner-signal surface — see T5)
- `apps/api/src/routes/nudges.ts`
- `apps/api/src/services/nudge.ts`
- `apps/api/src/services/notifications.ts`
- `apps/api/src/inngest/functions/**` notification senders only as needed for
  recipient assumptions.
- `packages/schemas/src/**` nudge/notification request and response schemas.
- Co-located mobile/API tests.

Out of scope:
- Child-cap parent alert; that is covered by
  `2026-05-31-billing-recovery-learner-capacity.md`.
- Billing/payment notification content.
- Raw child-to-parent free-text messaging. This plan ships template signals
  only.
- Broad notification preference redesign beyond push reachability.

## Product Decisions

- The More > Notifications push toggle must represent **three** signals, not one:
  OS permission, the server `pushEnabled` flag, and whether a push token is
  registered. Turning it on requests OS permission when possible; if the OS
  cannot ask again, the screen links to system settings. The toggle renders as
  fully on only when all three hold (see T1 truth table).
- Guardian-only users get a permission ask from a guardian-relevant moment:
  after adding/viewing a child, or first seeing a parent-home notification
  surface. They should not need to complete their own learning session to
  receive child-related pushes. (Settings-screen toggling is owned by T1, not the
  guardian primer, to avoid a double prompt — see T3.)
- Child-to-parent nudge v1 is a small fixed template set: `thanks`, `need_help`,
  `proud_moment`. It delivers to an authorized guardian and appears in the same
  parent notification surface as other nudges. The sender→recipient relationship
  is authorized server-side against the family-link/membership model (never
  inferred from age/persona), and only consented learners may emit signals.

## Tasks

> **Sequencing (per the 80/20 Carve):** T1–T3 are the **do-now reachability
> slice** — ship these. T4–T6 are the **deferred child→parent feature** — do not
> build until the identity-foundation classification lands and the `need_help`
> cut + folded findings are resolved. T1 has a *minimal* form (recommended) and a
> *full* form (deferred polish); see T1.

### Do-now slice — reachability (T1–T3)

- [ ] **T1: Make push settings OS-aware so the toggle actually grants
  notifications.** Done when:
  - **T1-minimal (recommended — ship this):** `more/notifications.tsx` reads OS
    notification permission status; turning push on calls
    `Notifications.requestPermissionsAsync()` when `canAskAgain`, registers a
    token, and persists `pushEnabled=true` via `PUT /settings/notifications`. A
    denied/cannot-ask state renders **one** "Open Settings" action via
    `Linking.openSettings()`. This is a single working path + one fallback — it is
    ~80% of the value for a fraction of the full-T1 cost.
  - **User-facing copy is plain-language, never the internal signal names
    [MEDIUM-1].** The screen must never show "token not registered" /
    "pushEnabled false" — users have no model for those. Each blocked state maps
    to one i18n'd sentence + one action, e.g. *"Notifications are off in your
    phone settings"* → **Open Settings**; *"Couldn't register this device"* →
    **Retry**. The truth table (below) is an internal construct only.
  - **T1-full (DEFERRED polish — do not build in the do-now slice):** the
    explicit three-signal truth table over OS permission, the server `pushEnabled`
    flag, and token presence in `notification_preferences.expoPushToken`
    (`packages/database/src/schema/progress.ts:113,115`; registration in
    `apps/api/src/services/settings.ts:465-486`), rendering "on" only when all
    three hold and surfacing exactly which is missing. This is over-engineered for
    the user's perceived need (the three states are imperceptible as distinct);
    it earns its keep only if support data later shows users stuck in a partial
    state the minimal form can't explain. "Token registered" is never conflated
    with "pushEnabled" in either form.
  - Tests cover: undetermined, granted, denied-can-ask, denied-cannot-ask (open
    settings), and **Android 13+** `POST_NOTIFICATIONS` (where `<13` returns
    granted without a prompt and `canAskAgain` semantics differ from iOS). The
    per-combination missing-signal matrix is a T1-full test obligation only.
  - Covers `notif-2`.

- [ ] **T2: Expose a registration retry hook for permission changes.** Done
  when: `usePushTokenRegistration` exports or accepts a `registerIfAllowed`
  trigger that the settings screen can call after permission is granted, while
  retaining AppState foreground auto-registration. Tests cover manual retry and
  existing foreground behavior.

- [ ] **T3: Add guardian-specific permission ask.** Done when:
  - Guardian profiles can be prompted for OS notification permission without
    completing a personal session. Eligibility resolves via the sanctioned
    role/ownership predicate (`isOwner` + family-link/role, e.g.
    `isGuardianProfile()` / `navigationContract.gates.*`) — **never** birthYear or
    persona inference (`personaFromBirthYear` is banned; enforced by
    `persona-fossil-guard.test.ts`). The prompt is skipped in `isParentProxy`
    mode.
  - The ask is gated to avoid repeated nags using its **own** SecureStore key
    (e.g. `guardianNotificationAskShown_${profileId}` via `sanitizeSecureStoreKey`;
    keys may use only `[A-Za-z0-9._-]`), independent of the learner primer's
    `notificationFirstAskShown_${profileId}` flag so the two never suppress or
    trigger each other.
  - **The primer MUST short-circuit on live OS state before showing
    [MEDIUM-2].** The per-role SecureStore key alone does **not** prevent a
    dual-role user (guardian who also learns) from being asked twice: the learner
    primer can grant OS permission and mark only the learner key, then the
    guardian moment fires because the guardian key is unset. Clone the existing
    pattern in `use-post-session-notification-ask.ts:74` — call
    `getPermissionsAsync()` first and skip-and-mark-seen when `status==='granted'`
    or `!canAskAgain`. OS permission is per-device/global; the key dedup is only a
    "don't re-primer this role" layer on top.
  - The guardian primer does **not** fire on the settings screen: toggling push
    there is owned by T1. The primer's triggers are guardian-relevant moments
    (adding/viewing a child, first parent-home notification surface) so the user
    is never asked twice for the same moment.
  - Tests cover guardian-only prompt eligibility, parent-proxy exclusion, the
    dedicated-key dedup, and the no-double-prompt-with-T1 contract.
  - Covers `notif-1`.

### Deferred slice — child→parent nudge feature (T4–T6)

> **Do not build until** (a) the identity-foundation classification lands (T4's
> auth model is moving) and (b) this section's folded findings are accepted. v1
> template set is **`thanks` + `proud_moment` only** — `need_help` is **cut**
> (HIGH-1/2). The safe shape of this feature is warm fire-and-forget reciprocity,
> not an attention-request channel the delivery path can't honor.

- [ ] **T4: Add child-to-parent nudge service support.** Done when:
  - Schemas and service logic support a `learner_to_guardian` nudge direction with
    the **v1 template set `thanks` + `proud_moment`** (NOT `need_help` — see the
    cut below), and list/read queries include parent-visible inbound learner
    nudges. Adds those values to the `nudge_template` pg enum
    (`packages/database/src/schema/nudges.ts:5`, today parent→child only).
  - **`need_help` is CUT from v1 [HIGH-1].** As specified it routes through the
    existing path's quiet-hours suppression (`isQuietHours`, 21:00–07:00,
    `services/nudge.ts:167`), so a child tapping "I need help" at night produces
    **no push** until 07:00 — the one signal that implies urgency is the one the
    pipeline silently drops. Do not ship a help/urgency signal until it has BOTH
    (a) a quiet-hours exemption or an explicit non-urgent reframing, AND (b) a
    defined parent **response path [HIGH-2]** — template-key-only delivery means
    the parent otherwise sees "Alex needs help" with zero context and can only
    dismiss it (a dead-end, banned by the UX Resilience Rules). Until both exist,
    `need_help` stays out.
  - **Template copy must be unambiguous to BOTH sender and receiver [MEDIUM-3].**
    The parent→child set renders as encouragement (`TEMPLATE_COPY`,
    `services/nudge.ts:24`); a child→parent set is not its mirror image. Spell out
    the exact rendered string each new template produces on the parent's screen
    (e.g. what does `proud_moment` *from a child* literally say, and proud of
    what?) and sanity-check it before building. Add the strings to this task.
  - **Authorization (core of this task):** a `services/` function verifies the
    sender→recipient pair against the family-link/membership relationship
    (role-based, server-side — never birthYear), with explicit ownership-chain
    checks. NB the existing `assertParentAccess(from, to)`
    (`services/family-access.ts:46`) is **directional** — it asserts `from` is the
    *parent* of `to`, so it cannot be reused as-is for the child→parent direction;
    a new direction-aware check is required. No inline `drizzle-orm` in
    `routes/nudges.ts` (eslint G1/G5); the route delegates to the service. Pin the
    relationship check to whichever model is canonical at build time, since
    `docs/plans/2026-05-31-identity-org-membership-redesign.md` is in flight and
    may move this abstraction.
  - **Consent gate:** only learners whose `consentStatus` is null/`CONSENTED` may
    emit signals (mirrors the existing `NudgeBanner` render gate). Note for UI: a
    blocked child cannot self-complete consent (it is parent-driven via email,
    `services/family-access.ts:100`) — copy must say "ask your parent/guardian",
    not "complete the consent flow" (LOW-1; see Failure Modes).
  - **Reuse the existing delivery path** in `services/nudge.ts` so the send
    inherits timezone-aware quiet hours (`isQuietHours`, 21:00–07:00). Any Inngest
    dispatch goes through `safeSend()` (non-core). Do not build a parallel sender.
    **Correction [HIGH-3]:** the existing nudge path does **NOT** inherit the
    `MAX_DAILY_PUSH = 3` global cap — `createNudge` calls
    `sendPushNotification(..., { skipDailyCap: true })` (`services/nudge.ts:186`).
    Nudges instead use `NUDGE_RATE_LIMIT = 4` per 24h, **keyed on the recipient**
    (`services/nudge.ts:114-122`). For the reverse direction that means one
    parent's 4/24h window is shared across **all** children — siblings sending
    `thanks` can exhaust it, and the limit-hit copy ("You've sent enough
    encouragement for now", `services/nudge.ts:124`) is addressed to the wrong
    actor. Before building: decide rate-limit semantics as **per-(sender,recipient)**
    rather than per-recipient, and fix the limit copy for the child sender.
  - **Migration:** if `learner_to_guardian` is a new value of a pg enum or
    CHECK-constrained `direction`/`type` column on the nudges table, ship a
    committed migration (`db:generate:dev` → commit SQL → `drizzle-kit migrate`;
    never `push` against staging/prod), applied to staging/prod **before** the
    reading code deploys (mind the known staging journal drift). Adding the two
    template values to `nudge_template` is itself an enum change → migration
    required. If `direction` is a plain text column, state that no migration is
    needed for it.
  - **Tests:** authorized child-to-parent send; list visibility; an explicit
    **break test** for unrelated-recipient denial (red-green: write it, watch it
    pass, revert the auth check, watch it fail, restore — per the repo
    security-fix rule); an assertion that the emitted payload is template-key-only
    (no free-text — see T6); and a test that the per-(sender,recipient) rate limit
    does not let one child starve another's signals to the same parent.
  - Covers `notif-4`.

- [ ] **T5: Add learner UI for reciprocal nudges and wire the parent surface.**
  Done when:
  - A named learner-side entry point provides a small signal action to a guardian
    only when a guardian relationship exists, sending a template key (no raw
    free-text). Reuse `NudgeActionSheet` if it fits, or add an explicit learner
    sender component — name which in the implementation.
  - The inbound signal renders on the **guardian** home. `NudgeBanner` is mounted
    inside `LearnerScreen` today, and the guardian home is `ParentHomeScreen`
    (per the `home.tsx` architecture), which does **not** render `NudgeBanner`.
    This task explicitly adds the inbound-nudge surface (with read/dismiss) to
    `ParentHomeScreen.tsx`.
  - Tests cover: learner with a guardian (action shown), learner without a
    guardian (no action), and parent receipt rendered on `ParentHomeScreen`.

- [ ] **T6: Enforce delivery and privacy invariants (gated inside T4/T5).** Done
  when:
  - All new copy is i18n-routed; templates `thanks`/`need_help`/`proud_moment`
    have `nudge.templates.*` keys (existing pattern) added in the same PR and pass
    `check:i18n:orphans`.
  - The "no child free-text in push payloads, template-key + profile-IDs only"
    invariant is asserted directly in the T4 service test and the T5 UI test — not
    as a trailing audit. (This is the child-safety invariant of the whole plan; a
    late-only check risks a free-text leak landing in T5 unnoticed.)

## Failure Modes

| State | Trigger | User sees | Recovery |
|---|---|---|---|
| OS notification permission undetermined | User toggles push on | Native permission prompt | Allow or keep push off |
| OS permission denied, can ask again false | User toggles push on | Open Settings row | Open OS settings and return |
| Android 13+ POST_NOTIFICATIONS not granted | User toggles push on | Runtime permission prompt / Open Settings | Grant, or keep push off |
| Push token registration fails | Network/Expo failure | Retryable settings warning | Retry registration |
| Toggle on but delivery not fully enabled | pushEnabled set, no token / no OS permission | **Plain-language** row naming the fix (e.g. "Notifications are off in your phone settings") + one action — never the internal signal names [MEDIUM-1] | Tap the single named action (Open Settings / Retry) |
| Guardian never studies | Guardian opens parent notification surface | One-time permission primer (skipped if OS already granted / blocked, [MEDIUM-2]) | Allow, skip, or use settings later |
| Child has no guardian relationship | Learner opens signal UI | No child-to-parent nudge action | Use normal in-app learning support |
| Non-consented learner attempts a signal | Learner emits signal | Action unavailable | **Ask parent/guardian to confirm consent** (child cannot self-complete it) [LOW-1] |
| Unrelated recipient targeted | Forged/buggy send | Request denied (server) | None needed — denied by auth check |
| Child signal push fails (deferred feature) | No token/provider failure | Parent still sees in-app row | Retry via notification job if configured. NB this is **not** an urgent channel — `need_help` is cut precisely because in-app-row-only is not real recovery for a help request [HIGH-1/2] |

## Verification

Focused checks:

```powershell
Push-Location apps/mobile
# Quote globs containing literal parens — the (app) segment is a route-group dir,
# and unquoted parens are parsed by the shell (see repo pathspec guidance).
pnpm exec jest --findRelatedTests "src/app/(app)/more/notifications.tsx" "src/hooks/use-push-token-registration.ts" "src/hooks/use-post-session-notification-ask.ts" --no-coverage
pnpm exec jest --testPathPattern nudge --no-coverage
pnpm exec tsc --noEmit
Pop-Location
pnpm exec nx run api:test --testPathPattern=nudge
# T4 touches apps/api (routes/nudges.ts, services/nudge.ts) and is
# auth-scoping-critical. Unit tests + pre-commit/pre-push hooks intentionally skip
# .integration.test. files, so run the integration suite — it's where the
# family-relationship / cross-account-denial regressions actually surface.
pnpm exec nx test:integration api
pnpm check:i18n:orphans
```

If native notification permission behavior changes, run a device/emulator smoke
through the E2E skill and record the OS permission states tested (including
Android 13+).

## Review History

- **2026-05-31 — adversarial review folded into the tasks above.** Resolved:
  T1 three-signal truth table + Android-13 case; T3 dedicated dedup key and
  no-double-prompt-with-T1 + canonical role gate; T4 explicit auth mechanism
  (family-link/role, service-layer, break test), delivery reuse (quiet
  hours/cap/`safeSend`), migration handling, and consent gate; T4/T5 cross-plan
  alignment with the identity/membership redesign; T5 named entry point and
  `ParentHomeScreen` wiring; T6 privacy invariant moved into T4/T5 tests;
  Verification now runs the API integration suite and quotes `(app)` paths;
  `notif-3` scope note added.
- **Open items requiring live-code confirmation before "ready":** whether the
  nudge `direction`/`type` is enum/CHECK (T4 migration) vs plain text; and the
  `notif-3` disposition in the source audit.
- **2026-06-09 — end-user adversarial review + 80/20 carve folded in.**
  Verified against code that **nothing in this plan is implemented** (header "At a
  glance" updated to be the single source of truth for what/built?/should-build?).
  Added the **80/20 Carve** section and split Tasks into a do-now reachability
  slice (T1–T3) and a deferred child→parent feature (T4–T6). Folded findings:
  **HIGH-1** `need_help` cut from v1 (quiet-hours suppresses the one urgent
  signal); **HIGH-2** parent-side response path required before any help signal
  ships (template-only = no context dead-end); **HIGH-3** corrected the false
  "reuse inherits `MAX_DAILY_PUSH=3`" claim (existing path uses `skipDailyCap:true`
  + a recipient-keyed `NUDGE_RATE_LIMIT=4/24h` shared across siblings) and
  required per-(sender,recipient) semantics + fixed limit copy; **MEDIUM-1** T1
  user-facing copy must be plain-language, and T1 split into minimal (ship) vs
  full three-signal truth table (deferred polish); **MEDIUM-2** guardian primer
  must short-circuit on live OS state, not just its SecureStore key; **MEDIUM-3**
  child→parent template strings must be spelled out and unambiguous; **LOW-1**
  consent-blocked copy says "ask your parent/guardian", not "complete the consent
  flow". Noted that `assertParentAccess` is directional and cannot be reused as-is
  for the reverse direction.
