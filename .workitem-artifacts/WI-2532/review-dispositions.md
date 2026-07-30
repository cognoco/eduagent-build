# WI-2532 publication-review dispositions

| Review point | Disposition | Evidence |
| --- | --- | --- |
| Late primary read can repopulate state after sign-out | Accepted and fixed | Both primary and recovery generations are captured before storage awaits; a deterministic deferred-read test failed RED with the stale signed-out record and now returns `null`. |
| Recovery journal restores but never repairs primary | Accepted and fixed | A recovery-only test failed RED with zero SecureStore writes; restore now schedules primary repair. |
| V2-off unavailable placeholder consumes destination | Accepted and fixed | The V2-off test failed RED with one clear call; marker consumption now returns early while V2 is disabled. |
| Blocked Tabs remain keyboard-focusable on web | Accepted and fixed | The mounted shell now combines `display: none`, pointer blocking, `aria-hidden`, and native accessibility hiding. Tests prove Tabs remain mounted through hidden queries but are unavailable to ordinary queries. |
| Internal relative `jest.mock` calls violate GC6 | Accepted and fixed | Internal mocks were replaced by targeted `jest.spyOn` overrides; only the external `expo-router` mock remains. |
| Fake timers can leak if the assertion fails | Accepted and fixed | The timeout test restores real timers in `finally`. |
| Sign-out mock override can leak to later cases | Accepted and fixed | The rejection override now uses `mockImplementationOnce`. |
| Single microtask drain is fragile | Accepted in substance and adapted | The preview early-return path makes the suggested loading test ID unobservable, so the test explicitly drains the known primary/recovery/state-update microtasks with an explanatory comment. |
| Gate-ordering comment omits family-intent step | Accepted and fixed | The ordering comment now records the family-intent gate between preview/profile resolution and profile creation/consent/Tabs. |
| Duplicate hook dependency | Accepted and fixed | The duplicate `isFirstProfileCreation` dependency was removed; touched-file lint is warning-free. |
| Clear only after `onComplete` destination mounts | Rejected with contract evidence | `onComplete` is a synchronous `setFamilyIntentState(null)`, not navigation. Durable clear commits completion before revealing the already-mounted learner shell; moving it after this callback would make a completed choice resumable after process death. |
| Deduplicate the handoff helper in this correction | Rejected as out of correction scope | There is no demonstrated correctness defect, and the ruled publication correction preserves the existing narrowly scoped helper rather than adding an unrelated refactor. |

Focused verification after disposition: six affected suites, 267 tests passed;
the two requested-route preservation cases passed; TypeScript, warning-free
touched-file ESLint, Prettier, all mobile i18n ratchets, and `git diff --check`
passed.
