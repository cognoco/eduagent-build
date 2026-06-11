> **STATUS: ACTIVE** — rebuilt 2026-06-09 from the refreshed `mobile-app-flow-inventory.md` (code-true). Audience-filtered access map for the **STUDENT / Study** audience. Every row traces to an inventory flow ID; behavior describes today's code under current prod defaults, not target design.

# Student Flow Access Inventory

Please walk every single flow on the list from end uers persepective using Playwrithe Chromium. Always rebase to the latest "main". After each phase you complete, check if you are still on the latest phase. If you find a blocker of the type that the flow is impossible to run (missing seed) or a blocker that blocks more than 3 flows address them directly, do not create notion bugs. Do not worry about i18n bugs, this will be a separate clean up. If a flow that is documented in the document is not accurate, missing something, is obsolete or if you find a flow that is not yet documented, amend this document directly.

## Who is a "student"

- **owner-learner** — solo owner (adult or teen) studying as themself; includes supporters switched into Study mode (every adult can still be a student).
- **child** — non-owner child profile on a parent's account, using the app directly (NOT proxy).
- **Parent-proxy is NOT a student flow.** It is compatibility-only and currently dormant — no production UI passes `proxyMode:true` (HOME-12). Proxy rows here exist only to note where a student surface degrades if proxy is ever re-entered.
- Mentor/supporter-owned flows (PARENT-*, family home, recaps, nudges, clone-from-child, child mentor-memory/consent management) live in `docs/flows/mentor-flow-access-inventory.md` — see Exclusions at the bottom.

## Student shell (tabs per flag state)

Flags are build-time. **Prod build ships V0=on / V1=off** (`apps/mobile/eas.json:13`); dev/preview/OTA ship both on; flags-off = local `.env.example` default. Source: inventory "Navigation shell matrix".

| Audience | flags-off | prod build (V0=on, V1=off) | V1=on (dev/preview) |
|---|---|---|---|
| owner-learner (solo) | 4: home, library, progress, more | same (`STUDY_MODE_TABS`) | same (`STUDY_TABS`) |
| child (non-proxy) | 4 (learner) | 4 (learner — not owner) | 4 (`STUDY_TABS`, reason `child-study-only`) |
| supporter in Study mode | n/a (5-tab guardian shell, own-learning replaces home-as-study — HOME-09) | 4 (`STUDY_MODE_TABS`) via ModeSwitcher | 4 (`STUDY_TABS`) via ModeSwitcher |

Learning-route gating (session/homework/dictation/quiz/practice `_layout`s): prod V0 blocks **proxy only**; V1 uses `canEnter` (`familyShape ? ownerRole : true`) — students are never blocked. Library: V1 family-shape supporters lose the tab (recaps replaces it); study-shape students always keep it. Solo + child see the **same tabs**; they differ only inside More/Progress (see Settings section).

## Auth and access (shared pre-auth, student-relevant behavior)

| Flow ID(s) | Access | Actual behavior and gating |
|---|---|---|
| AUTH-01..09, AUTH-12, AUTH-14, AUTH-18 | all pre-auth | Launch probe, sign-up/verify, sign-in/MFA, forgot-password, OAuth + SSO callback, transition spinner — audience-neutral; no student-specific gating. |
| AUTH-10, AUTH-11 | all signed-in | Sign-out centralized via `signOutWithCleanup`; available from More hub and consent gates (so a gated child can always exit). 401 → forced sign-out + re-entry banner. |
| AUTH-13 | all | Deep-link redirect preservation replays student routes (session, quiz, library…) after sign-in; downstream gates still apply. |
| AUTH-15 | pre-auth | Welcome chooser ("learner" / "parent") persists audience 1h (ACCOUNT-33). Preview funnel flag-dark in prod (entry CTA off; deep-link only). |
| AUTH-16 | all | Not-found catch-all with Go home / Go back. |

## Profile creation, consent gates, and switching (as the student experiences them)

| Flow ID(s) | Access | Actual behavior and gating |
|---|---|---|
| ACCOUNT-01 | any signed-in account, first profile | Form = name + full birth date only. `conversationLanguage` set **silently** from device locale — no picker step; no pronouns step wired. Self-registering minor → switchProfile then layout consent gate takes over. 30s timeout aborts POST + restores form. Server: 11+ floor. |
| ACCOUNT-33 | new adult signups | Pre-auth audience carrier: "parent" + adult birth date auto-chains to add-child (skippable → mentor doc). "Learner" pick or minor → clean solo student setup. Replaced the old in-form Study/Family picker. |
| ACCOUNT-34 | brand-new signups w/ preview state | Post-OAuth SaveWizard; self branch lands directly in `/(app)/session` with the preview topic — a student entry. |
| ACCOUNT-04, ACCOUNT-37 | all profiles on account | `/profiles` modal (via More → Account) is the **sole** switching UI. Any profile may switch to itself/others (server validates linkage). Plain switch always clears proxy. Rename: owner renames anyone; child renames self only. Note: owner tapping a non-owner row opens child settings instead of switching (mentor behavior). |
| ACCOUNT-36 | blocks child | Child (or proxy) navigating `/create-profile` with profiles existing → dedicated blocked screen + switch-profile CTA, no silent 403. |
| ACCOUNT-19, ACCOUNT-20, ACCOUNT-21 | self-registered minors (incl. teen owners) | Consent request + child→parent handoff + parent-email entry/resend/change. Parent-created children **never** see these. Server caps resends (429); own-email guard. |
| ACCOUNT-22, ACCOUNT-32 | gated minors | ConsentPendingGate: send-to-parent vs waiting UI (masked email, 15s auto-poll). "While you wait" static previews (`PreviewSubjectBrowser`/`PreviewSampleCoaching`) fully replace the gate — no API. Sign-out always available. |
| ACCOUNT-23, ACCOUNT-42 | child with revoked consent | ConsentWithdrawnGate full block during 7-day grace; refresh + sign-out; email-delivery-failed retry path on `/consent`. Restore is parent-side (mentor doc). |
| ACCOUNT-24 | newly-consented child / teen-owner | Post-approval landing, once per profile (SecureStore); suppressed if profile already has subjects. |
| ACCOUNT-26 | by age | Single GDPR-everywhere path; `COPPA` enum dormant; ≤16 consent threshold, hard floor 11 in code (13+ launch decision NOT in code yet). |
| ACCOUNT-38, ACCOUNT-39 | adults on gate / anyone | Gate profile-switch escape shown ONLY to 18+ adults sharing the account; the gated child cannot escape. `/consent` deep-link guards (foreign profileId → not-found + back). |
| HOME-10 | all signed-in | App-layout gate stack + timeout/error recoveries (auth-redirect 15s, profile-load 20s retry/sign-out, profile-load error, profile-switched toast). |

## Home and subject setup

| Flow ID(s) | Access | Actual behavior and gating |
|---|---|---|
| HOME-01 | owner-learner + child full | Learner home: subject carousel, add tile, Ask Anything, quick actions, CoachBand (`COACH_BAND_ENABLED=true` hardcoded; priority recovery-marker > resume > overdue-review > quiz-discovery). Proxy would see learning actions hidden. |
| HOME-04, HOME-05, HOME-06, HOME-08, HOME-14, HOME-15, HOME-16 | students | Splash; empty-state → `/create-subject`; resume (SecureStore marker → session push, else server resume target); 10s home timeout (family-mode users get Progress escape instead of Library, B-600); subjects-load error + 15s learner timeout recoveries; home overlays (consent notice toast + celebrations owner-gated, withdrawal countdown banner for children in grace); EarlyAdopterCard + NudgeBanner (child-side nudge consumption). |
| SUBJECT-01..07, SUBJECT-19, SUBJECT-20, SUBJECT-22 | owner-learner + child (Clerk-auth only gate; proxy entries hidden + server `assertNotProxyMode`) | Create subject from home/library/chat/homework; resolution machine (ambiguous list, "use my words", 30s timeout retry); broad → pick-book (+ degraded states); focused → first-curriculum w/ retries; existing-subject Continue rows; subject-limit dead-end recovery → library. Homework create is a bare push — does NOT return to camera. |
| SUBJECT-08 | students with a language subject | Per-subject native-language + CEFR setup; ONLY entry = create-subject language branch (`returnTo=settings` branch dead). NOT a profile-wide conversation-language picker. |
| SUBJECT-12 | all students | "View curriculum" = Library → shelf browse; no self curriculum screen exists. |
| SUBJECT-14 | students via practice hub | Placement/knowledge assessment (picker → chat; lazy assessment POST; pass/borderline/fail branches; quota → subscription). GAP: screens have no own canEnter/proxy guard — hub entry is the only client gate. |
| SUBJECT-17 | orphaned | Pronouns picker reachable only by manual deep link (nothing navigates to `/(app)/onboarding`); 13+ gate, under-13 silent self-skip. NOT part of any onboarding chain. |
| SUBJECT-18 | first-subject creators (incl. child) | `/ready` recap interstitial → replays session params into learning session. |

## Learning, library, retention, progress

| Flow ID(s) | Access | Actual behavior and gating |
|---|---|---|
| LEARN-01..07 | owner-learner + child | Freeform + guided sessions, first-session nudges, core loop, bubble variants, voice in/out, session summary. Route gate: prod V0 blocks proxy only; V1 `canEnter('session')`. Side-effects → learning-path-flows.md Paths 1/2 + lifecycle. |
| LEARN-08, LEARN-25, LEARN-30, LEARN-31, LEARN-32 | study-shape students (V1 family supporters lose the tab) | Library v3 shelf list (chips = review-due/finished/status/urgency — NO retention pills), inline search, next-action coach card, curriculum-complete banner, degraded states (15s timeout, stale banner, active-only fallback banner — honest "couldn't load paused/archived" copy [was: silent fallback; fixed 2026-06-10]). |
| LEARN-09, LEARN-10, LEARN-33..38 | anyone via library | Shelf → book selection, book detail + sticky CTA, notes CRUD, delete book (started-topics double-confirm), topic-generation lifecycle, book-complete celebration, past conversations + move-topic. GAP: shelf/book writes are gated only by a never-passed `readOnly` param (NEW-lib-7) — server scoping is the real stop. |
| LEARN-11 | any non-proxy student (no isOwner gate — child can manage/delete own subjects) | Manage subject status + archive-first delete (PR #787); archive-first is client-only (server gap). |
| LEARN-12, LEARN-15, LEARN-16 | owner-learner + child | Topic detail (adaptive CTA, notes/bookmarks/sessions strips); relearn (picker + direct entries, minor-friendly copy via `computeAgeBracket`); retention review chain. Parent-bridge relearn entry = mentor doc. |
| LEARN-13, LEARN-14 | orphaned | Recall-test screen + remediation card: zero in-app pushes; `recall_nudge` push routes to `/home`. Server engine stays load-bearing. |
| LEARN-17, LEARN-18, LEARN-19 | self view | Progress tab self view: stats chips, latest report, saved link, keep-learning; subject progress detail now entered from progress-context links (home subject cards open the shelf; hide = archive); streak pill. Guardian picker view = mentor doc. |
| LEARN-20 | orphaned | Milestones list deep-link only; re-wiring planned, not in code. |
| LEARN-21, LEARN-22 | owner-learner + child with language subject | Vocab browser (entry tappable only `hasLanguageSubject && isViewingSelf`; screen self-ejects family shape/proxy); per-subject vocab list w/ delete. |
| LEARN-23, LEARN-40 | session owner (API profile-scoped) | Read-only transcript (root modal, own Clerk gate; 410 when purged); archived-transcript summary card w/ "Continue this topic". |
| LEARN-24 | students; delete for non-proxy | Saved bookmarks: paginated, tap-trash + confirm (NO swipe delete); subject-scoped variant from book header. |
| LEARN-26 | students | First-curriculum session entry (post-onboarding wall) with still-preparing error path. |
| LEARN-27, LEARN-28, LEARN-29 | owner-learner + child self view | My Notes archive hub (home entry gated `showLearningActions`); subject session archive; self reports list — mark-viewed works (self view routes `/progress/reports/:reportId/view` + weekly added 2026-06-10; `viewedAt` persists, NEW badge clears) [was: BROKEN — client POSTed non-existent endpoints, silent 404, badge refired]. |
| LEARN-41..49, LEARN-51, LEARN-53 | anyone in session | Crash boundary, expired-session recovery, offline gating, parking lot, topic switcher, skip-warmup, message feedback + low-confidence pip, in-session bookmarks + notes, auto-resume + crash marker, topic back-stop. |
| LEARN-50, LEARN-55 | eligible sessions | Challenge Round (flag-gated, OFF everywhere) + verification overlays (learning/relearn only, SM-2-gated). |
| LEARN-52 | blocks proxy only | Session proxy block (`ExplainedRedirect`) — compatibility, not a student path. |

## Practice, quiz, dictation

| Flow ID(s) | Access | Actual behavior and gating |
|---|---|---|
| PRACTICE-01..05 | owner-learner + child (proxy ✗ via layout) | Hub (4 sections, hidden non-tab route, tab bar collapsed); review shortcut opens relearn in PICKER phase; recitation (BETA); all-caught-up; assessment readiness row. |
| QUIZ-01..18 | students per layout gate; typed quota/consent/forbidden errors on launch | Picker, generation (30s hard timeout + retry), play (MC + free text), Guess Who clues, mid-round quit (Save & Finish at ≥1 answered), results (streak recorded server-side — no client streak call), history (NO link on quiz index — entries = practice hub row + results link), round detail, malformed-round guard, dispute, answer-check failure, difficulty-bump banner, final-question auto-save. QUIZ-16: home discovery card routes capitals/guess_who to `/quiz/launch` (starts the round), vocabulary to the picker [was: `activityType` dropped → always picker; fixed 2026-06-10]. Mid-round prefetch = dead code. |
| DICT-01..12 | students per layout gate | Choice → text preview (NO camera-OCR entry; no dictation text-preview `ocrText` route param/producer) / surprise-me generate → playback (local TTS; chunk size by age bracket = pedagogy not gating) → exit modal → completion → photo review → remediation → perfect score → result POST (`/dictation/result`, singular). Reporting-only: no XP, no retention feed. DICT-13 gallery branch E2E-only. |

## Homework

| Flow ID(s) | Access | Actual behavior and gating |
|---|---|---|
| HOMEWORK-01..03, HOMEWORK-05, HOMEWORK-07, HOMEWORK-09..12 | owner-learner + child (proxy ✗ layout + in-screen read-only) | Sole production entry = home intent card. Camera permission → viewfinder → OCR (on-device ML Kit → server fallback) → result; manual entry has THREE entries (permission phase, viewfinder "type instead", error phase); gallery import wired; subject auto-classify (zero-enrolled auto-creates); per-problem voice dictation; problem-card editing w/ 8000-char truncation alert; close = replace to home. |
| HOMEWORK-04, HOMEWORK-06, HOMEWORK-08 | homework sessions | Tutoring session (Path 3); image pass-through to vision on FIRST exchange only (sandbox allowlist); attach-failure falls back to text-only with visible system message. |

## Billing as the student sees it

| Flow ID(s) | Access | Actual behavior and gating |
|---|---|---|
| BILLING-01..05, BILLING-08..12, BILLING-16 | owner-learner only | Subscription management (More → Account row gated `showBilling` = owner && !proxy): plan/badge/trial/usage meters, purchase + polling (native only), restore (native-only), manage billing (web = static info card), family pool + member removal, top-up (paid tiers only), BYOK waitlist (live, not commented out), static tier comparison, timeout/error recovery. **Child: row hidden; reaching `/subscription` redirects home unless the paywall fires.** |
| BILLING-06 | child only | Child paywall — **quota mode only in practice**: subscription-expired mode unreachable in prod (child `GET /subscription` 403s → `trialOrExpired` forced false). Quota mode (owner-ungated `/usage` exceeded) → notify-parent (DB row only, no push/email) w/ SecureStore cooldown + Library/Progress/Home/More escapes. |
| BILLING-07 | owner-learner | Daily quota exceeded → NO paywall; same management screen with `exceeded` warning; the actual upgrade prompt is in-chat (BILLING-13). |
| BILLING-13 | anyone in session | In-chat 402 card forks on `gates.sessionIsOwner`: owner → usage + Upgrade/Top-up → subscription; child → reset-time hint + one-tap Notify parent + Go home. |
| BILLING-14, BILLING-15 | owner flows | Cross-feature upsell entries (create-profile 402, clone quota, assessment quota) and push taps (`subscribe_request`, `trial_expiry`) → `/subscription`. |

## Settings / More — owner-learner vs child visibility

| Flow ID(s) | Access | Actual behavior and gating |
|---|---|---|
| ACCOUNT-06 | all non-proxy | More hub. Child sees: Learning preferences (→ accommodation directly), Mentor memory, Mentor language, Account/Profile, Notifications, Privacy & Data, Help, Sign out. Owner additionally: family section (add-child + breakdown-sharing) — mentor setup, optional, never traps the student. |
| ACCOUNT-07, ACCOUNT-08, ACCOUNT-31 | any non-proxy incl. child | Notifications (4 toggles); accommodation picker (self); celebration-level prefs reachable ONLY via accommodation's inline link while mode is short-burst/predictable. |
| ACCOUNT-09, ACCOUNT-43, ACCOUNT-46 | owner only (`showAccountSecurity`) | Account security (password vs SSO branches), manage devices, change email / add password. Child: rows absent. |
| ACCOUNT-10, ACCOUNT-11, ACCOUNT-12 | owner only (`showExportDelete` + server assert) | Export data; delete account (typed DELETE confirm; child non-owner gets `<Redirect>` to More, F4); scheduled-deletion keep/cancel state. |
| ACCOUNT-13, ACCOUNT-14, ACCOUNT-48 | all incl. child | Privacy policy, terms, Help & Feedback. |
| ACCOUNT-15, ACCOUNT-49 | owner-learner + child (proxy ✗) | Self mentor memory: item delete, injection toggle, Tell-the-mentor, interests, clear-all. Minors: pending-child copy; server REJECTS minor consent/collection/injection toggles (`assertCanManageOwnConsent` — fail-closed on null birthYear). Owner self memory-consent prompt inline; pending child sees ask-a-parent copy (grant is parent-side → mentor doc). |
| ACCOUNT-18 | all learner shapes | Subject analogy preference via shelf gear only; hidden on four_strands subjects; PUT proxy-blocked server-side. |
| ACCOUNT-28, ACCOUNT-29 | any non-proxy incl. child | App-language bottom sheet (7 locales; `useMentorLanguageSync` clamps to profile PATCH). Mentor-language row = bare push to account screen, no dedicated picker. |
| ACCOUNT-30 | compatibility only | Proxy More = locked panel, zero rows. Not a student state. |

## Cross-cutting (student-relevant)

CC-01/02 (stage chips + greeting interception), CC-05 (continue-where-you-left-off), CC-07 (self accommodation badge; child editing = mentor doc), CC-10 (server-side quiz streak), CC-13..16 (stream error handling, envelope strip, stale-send, HMR guards), CC-18 (stable list refs), CC-21 (post-session pipeline on every path). CC-19: contract gating per Shell section above.

## Explicit exclusions → mentor doc

Owned by `docs/flows/mentor-flow-access-inventory.md`: PARENT-01..06, PARENT-08..25 (parent home, child drill-downs, reports, recaps, nudges, Learn-This-Too clone, consent management UI, child settings view); HOME-02/03 family side, HOME-07 (add-first-child CTA), HOME-09 (own-learning bridge tab — supporter shell artifact), HOME-11 (ModeSwitcher), HOME-12 (proxy shell); ACCOUNT-03/05 (add-child + tier gating), ACCOUNT-16/17/25/40/41/44/45/50/51/52 (child memory, parent consent management, reminder cascade, breakdown-sharing, withdrawal-archive); BILLING parent-side loop (PARENT-21). Student-side bridges retained here: BILLING-06/13 notify-parent, ACCOUNT-22/23 gates, NudgeBanner consumption (HOME-16).

## Historical walkthrough evidence (pre-2026-06-09, unverified)

Carried from the old edition; treat as historical evidence only, not current-state claims:
- 2026-05-26 browser walk: signed-out `/quiz` deep link returned to Quiz after sign-in (AUTH-13).
- 2026-05-26 browser walk: active-trial manage-billing surface validated on web; Restore hidden on web, static manage/contact-support copy shown (BILLING-04/05).
- 2026-05-27 focused Playwright rerun: child paywall notify-parent validated via `mentor-audit-paywall-child-notify` with seeded per-profile child quota (BILLING-06 quota mode).
