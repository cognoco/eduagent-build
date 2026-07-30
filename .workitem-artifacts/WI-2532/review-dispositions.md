# WI-2532 publication-review dispositions

| Review point | Disposition | Evidence |
| --- | --- | --- |
| Late primary read can repopulate state after sign-out | Accepted and fixed | Both primary and recovery generations are captured before storage awaits; a deterministic deferred-read test failed RED with the stale signed-out record and now returns `null`. |
| Recovery journal restores but never repairs primary | Accepted and fixed | A recovery-only test failed RED with zero SecureStore writes; restore now schedules primary repair. |
| V2-off unavailable destination leaves its marker replayable | Accepted after AC and runtime verification; supersedes the earlier placeholder disposition | Guarding marker creation behind V2 would skip the required family-intent fork. RED instead proved the mounted older-shell terminal gate made zero clear calls; it now consumes after mount, matching the V2 invitation form and preventing relaunch replay. |
| Blocked Tabs remain keyboard-focusable on web | Accepted and fixed | The mounted shell now combines `display: none`, pointer blocking, `aria-hidden`, and native accessibility hiding. Tests prove Tabs remain mounted through hidden queries but are unavailable to ordinary queries. |
| Family-intent gate internal relative `jest.mock` calls violate GC6 | Accepted and fixed | Those internal mocks were replaced by targeted `jest.spyOn` overrides; only the external `expo-router` mock remains in that component suite. |
| Initiate-route durable-state `jest.mock` lacks GC1 justification | Accepted and fixed | The whole-module mock and `gc1-allow` were removed in favor of a targeted `jest.spyOn(clearFamilyIntentOnboarding)` with suite-level restoration. |
| Fake timers can leak if the assertion fails | Accepted and fixed | The timeout test restores real timers in `finally`. |
| Sign-out mock override can leak to later cases | Accepted and fixed | The rejection override now uses `mockImplementationOnce`. |
| Single microtask drain is fragile | Accepted in substance and adapted | The preview early-return path makes the suggested loading test ID unobservable, so the test explicitly drains the known primary/recovery/state-update microtasks with an explanatory comment. |
| Gate-ordering comment omits family-intent step | Accepted and fixed | The ordering comment now records the family-intent gate between preview/profile resolution and profile creation/consent/Tabs. |
| Duplicate hook dependency | Accepted and fixed | The duplicate `isFirstProfileCreation` dependency was removed; touched-file lint is warning-free. |
| Landed WI-2231 restores shell-aware V2 completion at the create-profile overlap | Accepted and reconciled | The durable fork, no-PATCH/no-child-redirect contract, retry journal, and terminal marker consumption remain intact. Successful initial and retry persistence now use the landed `handleCompleted` / `getPostAuthDefaultPath` path. Two routing assertions failed RED under `handleClose` and pass GREEN. |
| Clear only after `onComplete` destination mounts | Rejected with contract evidence | `onComplete` is a synchronous `setFamilyIntentState(null)`, not navigation. Durable clear commits completion before mounting/revealing the learner shell; moving it after this callback would make a completed choice resumable after process death. |
| Deduplicate the handoff helper in this correction | Rejected as out of correction scope | There is no demonstrated correctness defect, and the ruled publication correction preserves the existing narrowly scoped helper rather than adding an unrelated refactor. |

Focused verification after disposition and merge-forward: eight union suites,
410 tests passed; the two requested-route preservation cases passed;
TypeScript, warning-free touched-file ESLint, exact-file Prettier, mobile i18n,
teen-consent, test-only-export, and GC1 ratchets, plus `git diff --check`,
passed.
