DOC: docs/plans/2026-05-31-notification-reachability-nudges.md (2026-05-31, 24K; revised 2026-06-09)

CLAIMS: 5 bullets
1. Two unrelated things bundled in one doc: (A) a bug-fix making already-built push notifications actually reach guardian-only users and dismissed-prompt users (T1-T3), and (B) a new child→parent nudge feature (T4-T6).
2. T1-minimal: the More > Notifications toggle must become OS-permission-aware (request permission, register token, "Open Settings" fallback) instead of a dumb local flag.
3. T2: `usePushTokenRegistration` needs a `registerIfAllowed` retry hook exposed for the settings screen.
4. T3: guardian-only (non-learner) profiles need their own permission primer, gated on a separate SecureStore key and short-circuited by live OS state, so a dual-role user isn't double-primed.
5. T4-T6 (deferred): add a `learner_to_guardian` nudge direction with `thanks`/`proud_moment` templates (NOT `need_help`, cut for trust-damage reasons), wired into `ParentHomeScreen`, gated by consent + family-link auth + a break test.

TECH VALIDITY: per broken assumption, file:line
- T1-minimal confirmed **shipped**: `apps/mobile/src/app/(app)/more/notifications.tsx:81-84,115-118,289-294` — `openSettingsVisible` gated on `canAskAgain===false`, `requestPermissionsAsync()` called, `Linking.openSettings()` wired. Matches plan's done-when.
- T2 confirmed **shipped**: `apps/mobile/src/hooks/use-push-token-registration.ts:22,84,193-212` — `registerIfAllowed` is exported off the hook's return handle (`Object.defineProperty(handle,'registerIfAllowed',...)`) and called on mount/foreground.
- T3 confirmed **shipped** (not just present, materially implemented): a dedicated `use-guardian-notification-ask.ts` (+ its own test file) exists, matching the plan's "separate SecureStore key, own primer, distinct from the learner primer" design. Not independently re-verified line-by-line for the live-OS-short-circuit (MEDIUM-2) or parent-proxy exclusion, but the hook's existence and naming match the plan's spec closely enough to trust the register's "shipped" header.
- T4-T6 confirmed **not started**: `packages/database/src/schema/nudges.ts:5-10` — `nudgeTemplateEnum` still only `['you_got_this','proud_of_you','quick_session','thinking_of_you']`; no `learner_to_guardian` direction, no `thanks`/`proud_moment`/`need_help` values, no migration. The plan's own claim ("today: parent→child only, 4 fixed templates, no direction concept") is still exactly true.
- Notable drift not caught by the plan (written pre-identity-rework): `nudges.fromProfileId` now references `person` (`nudges.ts:3,18`), the identity-v2 table, not the legacy `profiles` table the plan assumes throughout (`assertParentAccess`, family-link checks). The plan's T4 auth section already flags this as an open risk ("pin down whichever model is canonical at build time... `2026-05-31-identity-org-membership-redesign.md` is in flight and may move this abstraction") — that hedge was correct; the schema has since moved. Any T4 re-spec must re-derive the family-link/guardian check against the current `person`/`membership` model, not the plan's `profiles`-era citations.

IMPLEMENTED: per claim — none/partial/complete/superseded, file:line
1. n/a (framing claim, not a build item).
2. **complete** — `notifications.tsx:81-294`.
3. **complete** — `use-push-token-registration.ts:22-212`.
4. **complete** — `use-guardian-notification-ask.ts` (+ test).
5. **none** — `nudges.ts:5-10` unchanged from plan's baseline description.

CANDIDATE WIs: each with fate: adopt / merge-into-<WI> / kill (+reason)
- WI-1487 (T3, guardian push-permission primer) — **kill / close as already-done**. Tech-verified shipped (`use-guardian-notification-ask.ts` exists and matches the plan's design). The register's pre-bucket correctly flagged this as "small"; the disposition should be "confirm shipped and close," not "adopt as open work." Recommend a quick manual smoke (dual-role no-double-prompt case, MEDIUM-2) before fully retiring rather than a full re-implementation.
- WI-1488 (T4-T6, child-to-parent reciprocal nudges) — adopt, but only as a **re-spec**, not direct execution. Confirmed genuinely unbuilt, genuinely identity-coupled (the `person`/`membership` schema drift above proves the plan's own hedge was warranted), and the plan already did the hard adversarial thinking (the `need_help` cut, the per-(sender,recipient) rate-limit fix, the template-copy sanity requirement) — that reasoning should survive into the re-spec rather than being redone from scratch. Do not execute directly off the 2026-05-31 plan text; its file:line auth citations are stale against the current identity model.

VERDICT: valid, mixed by task
T1-T3 (WI-1487's scope): **superseded** — shipped, matches plan intent, this row's remaining work here is confirm-and-close, not build. T4-T6 (WI-1488's scope): **needs-product-ruling** — genuinely open, correctly deferred, but now additionally blocked on re-deriving auth against the `person`/`membership` schema that superseded `profiles` since this plan was written.

MVP RECOMMENDATION: in / out / finish-or-hide vs north star (Config T V2 shell on Google Play, RevenueCat Plus-only purchases, proven V1 fallback)
- T1-T3 slice: **already in** (shipped) — no action needed beyond closing the tracking item. Not a north-star risk.
- T4-T6 (WI-1488): **out for MVP**. This is warm-reciprocity social-feature scope (child says "thanks"/shows a proud moment to a parent) — genuinely nice but not launch-blocking, not revenue-adjacent, and its own plan says wait for identity-foundation to settle. Re-spec against the current schema as a post-MVP backlog item; don't let it compete for MVP execution slots against anything on the paying-user or Google-Play-publish critical path.

CONFIDENCE: high/med/low + up to 3 decidable Zuzka questions
Confidence: **high** — every claim in this row was directly spot-checked against current source (not just Found-In reuse), and the shipped/unshipped split is unambiguous (file exists vs. schema enum unchanged).
1. Confirm: should WI-1487 be closed outright (shipped, verified) rather than carried forward as an open Quarantine item?
2. Should WI-1488's re-spec explicitly target the `person`/`membership` identity-v2 model now, or wait until the identity-foundation roadmap's family-link abstraction is fully settled (avoiding a second re-spec)?
3. Is the `need_help` cut (trust-damage risk from quiet-hours-suppressed urgency) still the right call, or has product reconsidered given it's the highest-empathy-value template of the three?
