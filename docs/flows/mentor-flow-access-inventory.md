> **STATUS: ACTIVE (current-state) but V1-AUDIENCE-MODEL — parked for V2 rebuild (2026-06-18).** Rebuilt 2026-06-09 from the refreshed `mobile-app-flow-inventory.md` (code-true). Rows describe how flows actually work for this audience today, not target behavior. Where a flag changes the experience, both states are stated in the row. **Caveat:** this map is built on the V0/V1 Family/Study mode-switcher + proxy model that V2 ("mentor-is-the-app", `docs/plans/v2-plan/`) retires in favor of a single shell + scope chip (see `02-flow-map.md` S4/S5). It remains the audience-access source for the parked `master-directory/` per-flow pages and is cited by `mobile-app-flow-inventory.md`, so it is kept (not deleted) and slated for a V2-aware rebuild alongside the per-flow system after the V2 cutover.

Please walk every single flow on the list from end uers persepective using Playwrithe Chromium. Always rebase to the latest "main". After each phase you complete, check if you are still on the latest phase. If you find a blocker of the type that the flow is impossible to run (missing seed) or a blocker that blocks more than 3 flows address them directly, do not create notion bugs. Do not worry about i18n bugs, this will be a separate clean up. If a flow that is documented in the document is not accurate, missing something, is obsolete or if you find a flow that is not yet documented, amend this document directly.

# Mentor Flow Access Inventory

Audience-filtered access map for the **mentor / Family** audience: the supporter human — an adult owner with linked children. "Mentor" here is NOT the AI mentor persona and NOT the `mentor-memory` route. Every row traces to a flow ID in `docs/flows/mobile-app-flow-inventory.md` (rebuilt 2026-06-09). Audience model + supporter surfaces detail: `docs/flows/learning-path-flows.md` §1 and §11.

Flag reality (build-time, `feature-flags.ts:30-31`): **production build ships `MODE_NAV_V0_ENABLED=on / MODE_NAV_V1_ENABLED=off`** (`eas.json:13`; V1 key absent → false). Dev/preview builds + preview-channel OTA ship both on. CLAUDE.md's "5-tab production mode when V0=false" describes the *flags-off* state, not the shipped prod config. All three states appear below where they differ.

## Supporter shell per flag state

| Flow ID(s) | Access (who in this audience) | Actual behavior and gating |
| --- | --- | --- |
| HOME-03 | Adult owner + linked children (family-capable) | Three states, not two. Flags-off: 5 tabs (`LEGACY_GUARDIAN_TABS`: home, own-learning, library, progress, more). **Prod build (V0-on)**: family mode (default) = **3 tabs** (home, progress, more); study mode = 4 learner tabs; ModeSwitcher in header. V1-on: family = **4 tabs** (home, **recaps**, progress, more); study = 4. |
| HOME-03 | Non-adult / null-birthYear owner with children | Flags-off + prod V0-on: 5-tab guardian shell survives (`isFamilyCapableProfile` needs adult bracket). V1-on removes it → 4-tab study. |
| HOME-11 | Family-capable adult owner only | Study/Family ModeSwitcher — prod-active under V0-on. Swaps entire tab set + home screen. V1: PATCHes `defaultAppContext` (optimistic + rollback); V0: local-only, never persisted. Solo/child/proxy never see it. No dedicated E2E. |
| HOME-02 | Supporter only (never solo/child/proxy) | Parent gateway home (`ParentHomeScreen`) at `/(app)/home` when `contract.home.screen==='FamilyHome'`. Prod V0-on: family-capable owner in family mode. Flags-off: any owner with linked children (no age check) or hub-eligible. Reads dashboard (2-min stale / 5-min poll), per-child memory + progress-summary, child-cap notifications, family subscription; recaps reads V1-only (null in prod). |
| HOME-13 | All; lands on supporter home for this audience | `/dashboard` is a permanent redirect to `/(app)/home` preserving `returnTo` (old deep links/notifications only). |
| HOME-07 | Childless adult owner | Add-first-child CTA on learner home → More → add-child. Shows when `(showAddChild \|\| family/pro-tier fallback) && !hasLinkedChildren` — family/pro adults see it even when the contract gate is false. |
| HOME-08 | Supporter in family mode | Home loading-timeout (10s) escape is `timeout-progress-button` → Progress (B-600), not the Library button learners get. |
| HOME-09 | Guardian shapes per matrix | "Own Learning" bridge tab visible only flags-off 5-tab and V0-on non-capable shells; **NOT** in prod V0-on mode shells nor V1. Family-mode arrivals auto-switched to study; learner shapes get Redirect (BUG-135). |
| HOME-10 | All signed-in | Shared gate stack + timeout/error recoveries apply before any supporter surface renders. |

## Setup, profiles, consent ownership

| Flow ID(s) | Access (who in this audience) | Actual behavior and gating |
| --- | --- | --- |
| ACCOUNT-33 | New adult signup via "parent" door | Pre-auth audience carrier (1h TTL): parent + first profile + adult birth date → PATCH family context + auto-chain `/create-profile?for=child` (skippable). Minor-picked-parent falls back to solo. |
| ACCOUNT-34 | Brand-new signup with preview state | Save wizard child/both targets: adult-owner gate (`ADULT_OWNER_GATE_ENABLED=true`) blocks child creation unless owner birthYear computes adult; child-POST failure keeps parent + inline retry; child branch lands home. |
| ACCOUNT-03 | Adult owner (18+ via `isAdultOwner`) only | Add child: More hub `add-child-link` (gated `gates.showAddChild`), ParentHomeScreen "Add child", or auto-chain after first profile. Inline consent grant (parent is consenting adult); parent stays on own profile. Server enforces 11+ floor. Child/proxy blocked (ACCOUNT-36 blocked screen). |
| ACCOUNT-05, ACCOUNT-35 | Owner at tier cap | More hub does NO tier check — enforcement is server 402 `PROFILE_LIMIT_EXCEEDED` → "Upgrade required" alert → "See plans" → `/(app)/subscription` (BUG-947). |
| ACCOUNT-04 | All profiles on account; owner-special behavior | Profile switching = `/profiles` modal via More → Account (sole switching UI). Owner tapping a child row does NOT switch — sets mode=family + pushes child settings (BUG-774). Plain switch always clears proxy; no production UI passes `proxyMode:true`. |
| ACCOUNT-37 | Owner renames anyone; non-owner self only | Inline rename modal in `/profiles`. |
| ACCOUNT-25, ACCOUNT-41 | Owner with linked child only | GDPR consent management: child detail `?mode=settings` → `ConsentManagementSection`. Withdraw (destructive confirm) → `PUT /consent/:childId/revoke` → WITHDRAWN + 7-day deletion grace; restore (`410` if grace expired). WITHDRAWN child detail short-circuits to `consent-withdrawn-empty-state` + restore CTA; `grace-period-banner` shows days remaining; home shows per-child `WithdrawalCountdownBanner` with one-tap Reverse. E2E `parent/consent-management.yaml`. |
| ACCOUNT-27 | Parent OUTSIDE the app | Consent approve/deny is **server-web only**: email link → `GET /v1/consent-page` → server-rendered pages; denial cascade-DELETES the child profile. No mobile route. Mobile JSON twin dormant. |
| ACCOUNT-38 | 18+ adult sharing account with ≥1 minor | Consent-gate profile-switch escape (confirms destination by name); the gated child cannot escape. |
| ACCOUNT-16, ACCOUNT-50, ACCOUNT-51, ACCOUNT-52 | Owner only (client IDOR guard + server `assertOwnerAndParentAccess` + consent-visibility gate WI-264) | Child mentor memory (parent-managed): toggles, tell-the-mentor (LLM parse), item delete, "Export memory summary" (share sheet / web .txt), correction escape hatch (`[parent_correction]` → tell endpoint). Consent-withdrawn child → whole screen replaced by dead-end gate + Back; reads hard-denied pre-render. Entry: child settings `mentor-memory-link`. |
| ACCOUNT-17 | Owner (child route) | Child memory consent prompt renders in exactly two places: child mentor-memory screen + self mentor-memory screen — NOT on child detail. One tap sets `memoryConsentStatus` + flips collection/injection/enabled together. |
| ACCOUNT-08, ACCOUNT-31 | Owner, !proxy (V1 adds family-shape requirement) | Child accommodation editor via `?childProfileId=` from child settings (`gates.showAccommodationChildEditor`); celebration-level editor reachable only through accommodation's inline link while mode is short-burst/predictable. |
| ACCOUNT-44, ACCOUNT-45 | Owner with linked children | Family-pool breakdown-sharing toggle (More hub family section, visible with `showRemoveFamilyMember` + ≥1 linked non-owner); withdrawal-archive preference radio in Privacy & Data (server owner-assert). |
| SUBJECT-17 | Parents via child settings only | Pronouns picker route is **orphaned** (no in-app navigation); the live way a parent sets a child's pronouns is from child settings → `PATCH /v1/onboarding/:profileId/pronouns`. |
| ACCOUNT-40, ACCOUNT-42 | Parent as email recipient (no in-app surface) | Server-built consent reminder cascade: 7d fresh-token reminder, day-14, day-25 final warning, day-30 auto-delete of the unconsented child profile (no email at deletion). Email-delivery-failed → in-app retry copy on the child's `/consent` screen. |
| HOME-15, ACCOUNT-41 | Owner only; proxy-suppressed | Home overlays the supporter sees: post-grace consent notice toast (`consent_archived`/`consent_deleted`, 5s, then `POST notices/:id/seen`), celebration overlay queue, withdrawal countdown banner per child in grace period. |

## Child drill-downs (review surfaces)

Cross-cutting gate for all `child/*` rows: layered — `RequireFamilyContext` (V1 `canEnter` / V0 family-context / flags-off pass-through), IDOR screen guard, owner-enabled hooks, server `assertOwnerAndParentAccess` on every route. Solo owners, children, and proxy are all blocked (proxy: V1 `canEnter` allows only home/library/progress).

| Flow ID(s) | Access (who in this audience) | Actual behavior and gating |
| --- | --- | --- |
| PARENT-01 | Supporter only | Mentoring hub `ChildCommandCard`: mentor-voice headline, status word, momentum chips, solid/coming-up lines, "try tonight" starter, 3-button row (Learn together / Reports / Nudge). `SamplePreview` no longer exists in the repo. |
| PARENT-02 | Supporter, ≥2 children vs exactly 1 | ≥2 → family-summary panel (activity roll-up, attention row, profile-limit row, `isAdultOwner`-gated add-profile footer); exactly 1 → `SingleChildMentorSlot` + quiet add row. |
| PARENT-03, PARENT-18, PARENT-19 | Supporter with linked children only | Child detail: subject mentor-note cards + RecentSessionsList; URL modes — default, `?mode=settings` (accommodation link, mentor-memory link, "Added <month year>", consent section), `?mode=progress` (nudge card, copy varies by session recency, deep-pushes child topic/subject). |
| PARENT-04, PARENT-12, PARENT-17 | as PARENT-03 | Child subject → topic drill-down (skeletons, error+retry, new-learner empty split, recent-sessions fallback); retention badges data-gated (`retentionStatus && totalSessions>=1 && started`, suppressed for new learners); curriculum overview with raw-input + retention labels — the not-linked gate renders only under V1, flags-off falls to server 403 → error state. |
| PARENT-05 | as PARENT-03 | Child session recap detail: narrative/highlight/engagement chip/conversation prompt + copy, AddToMyLearning, active-time (BUG-902). **No transcript link on this screen at all** (test asserts exchanges don't render) — read-only transcript is the learner-side LEARN-23 surface. |
| PARENT-06, PARENT-13 | as PARENT-03 | Reports: monthly + weekly merged list with pinned latest-weekly hero, NEW badge, next-cron-date empty state. Monthly detail marks viewed once (`POST .../reports/:id/view`). Weekly detail (push-driven) marks viewed once server-guarded; empty-week CTA opens NudgeActionSheet in place. Child report view endpoints are dashboard child variants; the self-report twins now exist too (`POST /progress/reports/:reportId/view` + weekly; LEARN-29 fixed 2026-06-10, learner-side). |
| PARENT-08, PARENT-09, PARENT-10 | as PARENT-03 | Raw-input audit ("Your child searched for…") on overview cards only when divergent AND no session yet, curriculum rows whenever divergent. Metric tooltips = `MetricInfoDot` bottom sheets for exactly time-on-app / understanding / review-status; `guided-ratio` copy is orphaned (no renderer). Understanding + retention cards NaN-guarded; + recent fluency-drill score strip. |
| PARENT-21, PARENT-23, PARENT-24 | Supporter | Child-cap quota banners (dismissible, reset time — parent side of BILLING-13 loop); demo-dashboard fallback silently substitutes fixture data at zero children (can mask empty state); ambient layer: household pulse, ack-able `ParentTransitionNotice`, MentorSlot insight, avatar → `/(app)/more/account`. |
| PARENT-22 | Flag-on builds | Study-mode user hitting `child/*` gets `family-route-blocked` + explicit "switch to family" CTA (capable users) + back-home; never auto-mutates mode. |
| LEARN-17, PARENT-25 | Guardian in family mode | Progress tab = children picker (own profile excluded), child summary + `progress-nudge-cta` → NudgeActionSheet, per-subject breakdown, child report routing (BUG-524 chain push). Family Progress excludes the adult's own progress. |
| LEARN-08, LEARN-21 | Family-shape supporter (V1) | V1 family shape: Library tab removed (`canEnter('library')` = `!familyShape` → Redirect; Recaps replaces it); vocabulary browser self-ejects (guardian gets read-only count chip only). On prod flags the supporter's study mode keeps the ordinary learner Library. There is NO child-content library view — V0 guardians on the Library tab see their OWN subjects. |

## Recaps (V1-only)

| Flow ID(s) | Access (who in this audience) | Actual behavior and gating |
| --- | --- | --- |
| PARENT-11 | V1 guardian only; all others redirected | **Flag-gated, dark in prod.** With prod flags (V0-on/V1-off) the screens `Redirect` home and `useRecaps` is disabled — parent-home `latestRecap` is always null in prod. V1-on: recaps tab (`FAMILY_TABS`) + push notifications (`struggle_*`, `weekly_progress`, `monthly_report` route here); feed from `session_summaries` fields, newest-first, owner-only server scoping; detail has exchangeCount, AddToMyLearning, "Open session" → child session with `returnTo=family-recaps`; layout seeds 2-deep stack. |

## Nudges

| Flow ID(s) | Access (who in this audience) | Actual behavior and gating |
| --- | --- | --- |
| PARENT-15 | Supporter (server `assertNotProxyMode`) | Send-nudge sheet (child card heart; weekly-report empty CTA; progress tab PARENT-25): 4 templates → `POST /nudges` → row + push to child. Consent gate: PENDING/WITHDRAWN/REQUESTED → error; null consent row allowed for 17+. Push suppressed during recipient-local quiet hours 21:00–07:00 (`skipDailyCap`). Typed inline errors. Prod-active (no flag). |
| PARENT-16 | Supporter | Rate limit: 4 per recipient child per rolling 24h, counted on `toProfileId` regardless of sender, `pg_advisory_xact_lock`; 5th attempt → inline rate-limit copy, sheet stays open. |

## Learn This Too clone — the ONE supporter→learning entry

| Flow ID(s) | Access (who in this audience) | Actual behavior and gating |
| --- | --- | --- |
| PARENT-14, PARENT-20, LEARN-15 | V1 guardian-owner only — `showLearnThisToo` = owner ∧ familyShape ∧ !proxy ∧ hasFamilyLinks → **the button never renders on prod flags** | 4 surfaces (child topic, child session, recap detail, LearnTogetherSheet). Clone = `POST /curriculum/clone-from-child`: owner-gated, IDOR-safe 404, dedupe modes, provenance (`sourceChildProfileId`), requestId idempotency, undo with `session_started` refusal. Lands in relearn direct-entry with "Added from <child>" header — a session **for the adult as themselves**, never as/for the child; writes scoped to the ADULT. LearnTogetherSheet also offers up to 3 conversation proposals (these work on prod; only the clone section is V1-dark). |

This is the only supporter entry into a learning flow. Supporters do NOT create subjects, start sessions, or run practice for a child — no such launch path exists in code.

## Billing and family-pool ownership

| Flow ID(s) | Access (who in this audience) | Actual behavior and gating |
| --- | --- | --- |
| BILLING-01, BILLING-11, BILLING-16 | Owner (`showBilling` = owner && !proxy); `GET /subscription` owner-gated 403 (BUG-644) | Subscription screen: plan, status badge, trial banner, usage card (monthly meter + daily sub-meter + top-up credits + per-profile breakdown + family aggregate). 15s TimeoutLoader + error retry states. |
| BILLING-02, BILLING-04, BILLING-05, BILLING-09 | Owner; native-only for purchase/restore (web = static cards) | Upgrade purchase + 15×2s confirmation polling; restore hidden on web; manage billing = native deep link with fallback / web static info card; top-up paid tiers only (500 credits, $10 plus / $5 family-pro). |
| BILLING-03, BILLING-08 | Owner, tier `family` OR `pro` | Family-pool section: shared-pool usage + **member removal** (`remove-family-member-<id>`, gated `showRemoveFamilyMember`; confirm → `POST /subscription/family/remove` → cache invalidations). Pro owners also see the pool. |
| BILLING-06, BILLING-13 + PARENT-21 | Child triggers; owner consumes | Child quota paywall + in-chat quota card notify-parent = **DB row only** (no push/email/Inngest); owner sees it as dismissible parent-home banners. The subscription-expired paywall mode is unreachable in prod (child `GET /subscription` 403s). Dormant subscribe variant would send push + Resend email. |
| BILLING-10, BILLING-12, BILLING-14, BILLING-15 | Owner | BYOK waitlist renders unconditionally for owners; static tier comparison with no purchase action (BUG-899); cross-feature 402 upsells (create-profile, clone quota, assessment quota) → subscription; `subscribe_request`/`trial_expiry` push taps deep-navigate to subscription. |

## Parent-proxy mode (what it shows / blocks)

| Flow ID(s) | Access (who in this audience) | Actual behavior and gating |
| --- | --- | --- |
| HOME-12, LEARN-52, ACCOUNT-30 | Supporter by construction — but **code-only/dormant**: no production UI passes `proxyMode:true`; internal/test path only | When active: 3 tabs (home, library, progress — More removed entirely), `ProxyBanner` ("PARENT PREVIEW" + switch-back), recolored chrome, learner home with all learning actions hidden (`gates.showLearningActions=false`) + placeholder card → child detail. Any `/session/*` → `ExplainedRedirect` with switch-profile CTA. Residual More route renders locked panel, zero rows, no sign-out (BUG-915). Library read-only (`library-proxy-hint`); bookmarks list no trash; transcript entry hidden. Writes blocked server-side via `assertNotProxyMode` (known gap: child-cap notify endpoint lacks the proxy guard). Normal mentor review uses parent-native child routes, never proxy. |

## Exclusions — student-owned flows

Owned by `docs/flows/student-flow-access-inventory.md`, not duplicated here: AUTH-01..18 (shared account access), learner home (HOME-01), subject creation + library + sessions + retention + progress self-view (SUBJECT-*, LEARN-*), practice/quiz/dictation/homework (PRACTICE-*, QUIZ-*, DICT-*, HOMEWORK-*), self mentor-memory (ACCOUNT-15, ACCOUNT-49), child-side consent gates (ACCOUNT-19..24), child-side nudge consumption (HOME-16). An adult owner in **study mode** is a student for those rows — mentor access never replaces the adult's own Study flows. Note for V1: family-shape supporters lose the Library tab (`canEnter('library')` = `!familyShape`) and learning routes become owner-only in family shape; on prod flags the study-mode shells are the ordinary learner shells.

## Known gaps affecting this audience (from the 2026-06-09 audit)

- BILLING-06: `POST /notifications/child-cap/notify-parent` has owner-reject but no `assertNotProxyMode` — a proxying parent could self-notify.
- Contract route-key mismatch: `FAMILY_CHILD_ROUTES` key `child/[profileId]/reports/weekly` has no matching screen file (actual: `weekly-report/[weeklyReportId].tsx`).
- PARENT-23: demo-dashboard fallback at zero children can mask a genuine empty state.
- E2E holes: no YAML for ModeSwitcher switching (HOME-11), proxy shell (HOME-12), Learn Together sheet (PARENT-20), child-cap banners (PARENT-21), in-chat quota card (BILLING-13).
- Orphans relevant here: `guided-ratio` vocab copy (PARENT-09), child-paywall subscription mode (BILLING-06), proxy shell itself (HOME-12).

## Historical walkthrough evidence (pre-2026-06-09, unverified)

Compressed from the old edition; treat as stale evidence, not current state:
- 2026-05-25 Chrome walkthrough (`d8d1ca6d2`, staging, `parent-multi-child` seed): Family shell signed in, showed Children home / child detail / Reports / Recaps; child subject drill-down wedged the automation session.
- 2026-05-25 seeded Playwright rerun (`28eab43a5f`, local API): 15/15 `mentor-audit-*` registry landings passed.
- 2026-05-26 latest-main rerun (`44e20638e6`): 15/19 inclusive registry entries, 28/47 broader specs, 4/4 learner smoke passed; remaining failures = My-Learning-first entry vs `parent-home-screen` expectation, consent-approval URL is an API web page, session-expired/revoked fixtures, Clerk TOTP disabled.
- 2026-05-27 focused rerun (`codex/student-flow-access-audit`): 15/15 registry landings incl. `mentor-audit-paywall-child-notify` after per-profile child-quota seed fix.
- Open Notion items from that era: E2E parent-entry contract mismatch (`36c8bce91f7c8196a766c9bc9ce12aad`), wrong consent route, non-deterministic session fixtures, disabled TOTP seed; stale-audit cleanup `36c8bce91f7c810dac87c81009503508`.
- Row-status counts (1 Fail / 10 Pass-w/-issues) predate this rebuild and no longer map to current rows.
