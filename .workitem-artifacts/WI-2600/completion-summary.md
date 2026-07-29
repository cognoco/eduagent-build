# WI-2600 completion summary (rework of the 2026-07-27 bounce — assertion restored, device-verified)

## What was done

Delivered the rework the review demanded in full. The multi-subject flow now itself renders and asserts the subject progress screen: the WI-2596-quarantined progress assertion is restored un-weakened through the route the product actually supports, the mandated emulator reproduction was executed FIRST, a full red-green-revert-restore cycle over the flow was executed and recorded on the page, and both flows were device-verified green on a real emulator in addition to a fully green CI release run on this branch. The previous "already fixed upstream" adjudication was withdrawn — the reviewer was right that the upstream rewrite had deleted the promised assertion rather than restored it.

## What changed

- flows/subjects/multi-subject.yaml keeps the upstream shelf journey (home subject cards genuinely route to the subject shelf) and appends a subject-progress leg through the screen's supported direct route: an app-scheme open of the seeded active subject's progress route, a mandatory wait for progress-subject-back, an assertion that progress-subject-error is absent, an exit through the back control to its device-verified landing (the Progress tab — direct entry has no stack to pop, so the screen's own back fallback applies), and a tab-bar return Home. This restores the quarantined assertion un-weakened (WI-2596 AC-5 carried forward) while matching the current product navigation.
- The interim structural guard from the upstream stabilization, which required the progress wait to be ABSENT from this flow, is flipped to require the full restored leg: the deep link, the loaded-state assertions, the back-control tap, and the verified landing, in order.
- The e2e CI workflow now uploads the shard-one release APK as a short-retention run artifact so device-verification legs can install the exact CI vehicle on a local emulator against a locally hosted test worker. The APK embeds only client-public build-time values.

## Verification

Confirmed root cause (AC-2): the June 12 home-navigation change (commit cited in the pull request body and the page comments) rerouted home subject cards from the subject-progress screen to the subject shelf, five weeks before this flow's first genuine execution on July 19 (the stdin-drain fix from WI-2215 unmasked it). Reproduced live on the emulator: the original flow reds at the progress wait with the subject shelf visibly on screen. The quarantine header's error-state attribution did not reproduce — the progress screen renders its loaded state for the multi-subject seed through the supported route, so the seed was never at fault; what needed fixing was the flow's navigation premise, which is exactly what this rework fixes while keeping the progress-screen contract asserted.

Executed red-green-revert-restore (recorded verbatim as a page comment, with screenshots and cred-redacted logs retained in the artifacts directory): reproduction RED on the pre-quarantine original flow; GREEN on the reworked flow end-to-end; REVERT back to the original flow — red at the same assert; RESTORE the reworked flow — green again. The more-tab-navigation flow also ran green end-to-end on the device, covering the second flow of AC-3 with its scroll-then-assert on the subscription row exercised.

CI evidence on this branch: the dispatched nightly release run 30253853415 concluded success with every shard green at the revision this completion pins, with both flows executing (more-tab-navigation as flow five of twenty in its shard, multi-subject as flow fourteen of fifteen in its shard). The earlier diagnostic run 30249719024 executed the restored progress leg successfully and failed only at the then-stale back-landing wait — the same failure the device caught first — which the landed revision pins to the verified landing. The structural-guard suite for the e2e gate runs clean locally apart from two pre-existing Windows-local spawn failures in an unrelated e2e-web block that also fail on unmodified main and are green in CI.

## Caveats / Follow-ups

The reusable native seed slots on the staging database were used for the local device legs (disposable pre-launch data, standard slot reuse). A stale German system-locales row left over from an earlier device session was found during this window and deleted; the device restore checklist on the batch page now records that gap. The uploaded APK artifact expires on its own after three days.
