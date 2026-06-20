## Completion Summary — WI-861 ([HOMEWORK-08/09] harden homework image fallback + subject-resolution coverage)

**What was done:** Hardened homework coverage — made the camera read-fail test
deterministic, pinned the image-attach-dropped analytics emissions (HOMEWORK-08), and
added a result-phase subject-resolution suite (HOMEWORK-09).

**What changed:** `apps/mobile/src/app/(app)/homework/camera.test.tsx` (+196):
switched the camera-result read-fail test to fake timers advancing explicitly past the
500 ms auto-send debounce (deterministic under full-suite CPU load); added two
analytics tests pinning `homework_image_attach_dropped` with `reason=failed/timeout`,
`captureSource`, `hasOcrText` via `jest.spyOn` on the real analytics module (GC1/GC6-clean,
no internal mock). `session/index.test.tsx` (+122): confident single-candidate →
"Looks like {subject}" + Change picker; zero-enrolled auto-create → `POST /subjects` +
routes session; low-confidence classifier → picker rendered immediately.

**Verification:** Delivered via PR #1267 (author `crowka`), squash-merged to `main`
as `b13755423`. `main` branch-protection required checks green at merge. Uses real-module
spies — no new internal mocks (GC1/GC6-clean).

**Caveats / Follow-ups:** Test-only; no production code changed. No follow-ups.
