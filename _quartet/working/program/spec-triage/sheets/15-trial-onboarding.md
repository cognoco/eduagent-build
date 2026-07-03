DOC: docs/specs/2026-05-18-trial-intent-save-onboarding.md (2026-05-18, 31K)

CLAIMS:
- Pre-signup intent screen (Me / My child / Both / Not sure) routes to a constrained preview, not full profile creation.
- "Me" path: a full-screen, turn-capped, interactive preview lesson ("Trial lesson: N questions left") that teaches immediately, then a save/signup CTA.
- "My child" path: parent-oriented setup preview (not learner chat by default), CTA "Create or link child".
- Post-signup save wizard ("save to my learning / my child's learning / both") creates the correct profile shape without restarting onboarding, landing on the correct Home.
- Optional Phase 2 server-backed preview lesson API with hard caps (5 user/5 assistant turns), rate limiting, no memory writes pre-claim.
- Phase 4 (conditional): reorder legacy `ParentHomeScreen` toward Today → Children → Family if parent Home still feels overwhelming after the new front door.
- The doc carries its own **2026-05-23 status note**: implementation diverged — `SaveWizardGate` is an inline gate in `(app)/_layout.tsx` (not separate `(app)/preview/save.tsx` routes), state module uses SecureStore + a 3-way path union (`learner_lesson | learner_value_prop | parent_value_prop`), and Phase 2 (server-backed preview lesson) was **not implemented**.

TECH VALIDITY:
- The spec's own status note is accurate and matches code. No further broken assumptions beyond what it already flags.
- The "Me" journey as narrated in the spec body (steps 1-9: user enters a free-text topic, opens a full-screen interactive lesson, mentor teaches for 3-5 turns) does NOT match current code — confirmed live gap, not a documentation staleness issue (see IMPLEMENTED).

IMPLEMENTED:
- Pre-signup intent screen: complete. `apps/mobile/src/app/preview/intent.tsx` — 4 options (self/child/both/not_sure), stores `PreviewOnboardingStateV0`.
- "Me" path topic selection: partial, user-visible divergence from spec. `apps/mobile/src/app/preview/topic.tsx:21-45,66-90` offers only 3 **fixed sample topics** (geography/fractions/writing) via `Pressable` cards — no free-text topic entry as the spec's step 5 describes. Selecting one sets `path: 'learner_value_prop'` and routes to `/preview/value-prop`.
- Constrained interactive preview lesson (spec's core "Me" promise, steps 6-9): **none**. No `preview/lesson.tsx` exists in the codebase. `apps/mobile/src/app/preview/value-prop.tsx` is a marketing/explanation screen (`onTryLesson` just sets state and its CTA is `router.push('/sign-up')`, `value-prop.tsx:95`) — there is no interactive, turn-capped, LLM-driven preview chat before signup, contradicting the spec's headline UX ("the app opens a full-screen preview lesson… first mentor message starts teaching immediately"). A signed-out trial user today experiences: intent screen → pick one of 3 fixed sample-topic cards → a value-prop/marketing screen → sign-up. They never talk to the mentor before creating an account.
- Server-backed preview lesson API (Phase 2 — schemas, public routes, claim/import): none, matches the spec's own status note.
- Post-signup save wizard: complete, user-visible, functioning. `SaveWizardGate.tsx` (230 lines, `(app)/_components/save-wizard/`) is a real multi-step wizard wired into `(app)/_layout.tsx`'s no-profile gate; `ProfileBasicsStep.tsx` exists alongside it. This is the diverged-but-functionally-equivalent implementation the status note describes — onboarding funnel does complete end-to-end from signup to a created profile and correct Home landing without WI-1457/1458.
- Parent path: value-prop variant='parent' exists (`value-prop.tsx` CTA `t('preview.signUpChild')`); no dedicated `preview/parent.tsx` route, consistent with the diverged 3-way path union in the status note (not a new gap, already documented).
- Phase 4 (ParentHomeScreen reorder): not evaluated as done/not-done in isolation — `ParentHomeScreen.tsx` is still mounted from legacy `(app)/home.tsx` (`apps/mobile/src/app/(app)/home.tsx`), which per `AGENTS.md`'s Profile Shapes section is the V0/V1 legacy shell, not the V2 mentor-is-the-app shell. Any reorder work targets a screen whose long-term relevance depends on the still-open V0/V1-retirement ruling (S6, WI-1440).

CANDIDATE WIs:
- WI-1457 (constrained preview lesson for "Me" path, needs product decision) — fate: **adopt**, description accurate and now more precisely evidenced: today's "Me" path is fixed-sample-topic-selection → marketing screen → signup, with **zero interactive preview chat** at any point (not "a degraded lesson" — a genuinely absent one). This is real product-promise erosion vs. the spec's core pitch ("the fastest way to prove MentoMate's value is a short lesson"), currently reachable and shipping today unflagged.
- WI-1458 (re-spec Phase 4 parent-clarity pass vs V2) — fate: **adopt**, description accurate — Phase 4 targets `ParentHomeScreen`, a legacy-shell surface whose fate is gated on the S6 ruling; re-speccing against V2 (or explicitly deferring until S6 resolves) is the right framing rather than executing Phase 4 as written today.

VERDICT: partially-implemented — the funnel *works* end-to-end (intent → sample pick → marketing → signup → save wizard → correct Home), but the spec's headline feature (a real pre-signup interactive lesson) was never built; implementation quietly substituted a value-prop/marketing screen instead. The 2026-05-23 status note documents the wizard-shape divergence but does not call out that the preview *lesson* itself is entirely absent — that's a bigger gap than the note implies.

MVP RECOMMENDATION: split.
- WI-1457 (preview lesson) — **needs-product-ruling, lean out for MVP launch, in for post-launch fast-follow if resourced.** The current substitute (fixed sample topics → marketing screen → signup) is not a broken affordance — it's an honest, functioning, lower-fidelity funnel; nothing lies to the user or dead-ends. Given Config T's north star (Google Play V2 shell, RevenueCat Plus-only, proven V1 fallback), building a new public/signed-out LLM surface (Phase 2, with its own abuse/rate-limit/quota-bypass surface per the spec's Failure Modes table) is a nontrivial net-new scope addition, not a fix to something broken. Burden of proof favors deferring unless product judges pre-signup conversion is currently underperforming enough to justify it before launch.
- WI-1458 (Phase 4 ParentHomeScreen reorder) — **out of MVP**, correctly re-scoped as "wait for S6 ruling, then re-spec against whichever shell survives." Reordering a screen that may be retired makes this speculative work today.

CONFIDENCE: high — traced the actual "Me" path file-by-file (`intent.tsx` → `topic.tsx` → `value-prop.tsx` → `/sign-up`) and confirmed no `preview/lesson.tsx` exists anywhere in the tree; confirmed `SaveWizardGate.tsx` is a real, substantial post-signup implementation, so the funnel is not broken end-to-end, only missing the pre-signup lesson.

Zuzka questions:
1. Is the "no interactive pre-signup lesson, straight to marketing + signup" substitute funnel acceptable for launch, or does product judge the conversion cost of skipping WI-1457 too high to defer?
2. If WI-1457 is deferred, should the spec's Phase 2 (public LLM preview API with rate-limit/abuse controls) or a cheaper deterministic-scripted-lesson fallback (spec's stated Option 2) be the eventual build target — worth flagging now so the eventual re-spec doesn't re-litigate it?
3. Confirm: should WI-1458 stay blocked/parked pending the S6 V0/V1 retirement ruling rather than carrying an independent target date?
