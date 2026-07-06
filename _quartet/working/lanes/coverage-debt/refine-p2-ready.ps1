$ErrorActionPreference = "Stop"

$skill = "C:\Users\ZuzanaKopečná\.codex\plugins\cache\zdx-marketplace\cosmo\0.6.46\skills\refine\refine.ts"

function Invoke-RefinePatch {
  param(
    [Parameter(Mandatory = $true)][string]$Wi,
    [Parameter(Mandatory = $true)][string]$Effort,
    [Parameter(Mandatory = $true)][string]$FoundIn,
    [Parameter(Mandatory = $true)][string]$AcceptanceCriteria
  )

  $patch = [ordered]@{
    effort = $Effort
    acceptanceCriteria = $AcceptanceCriteria
    found_in = $FoundIn
  }

  $json = $patch | ConvertTo-Json -Depth 8
  Write-Output "===== refining $Wi ====="
  $json | bun $skill --wi-id $Wi --to-ready
}

$ac1403 = @'
Done when the /now integration coverage seeds a real supporter-to-child relationship plus child parked_item and ledger_moment data, then proves both /now?scope=person and /now?scope=supporter-hub exclude transcript-adjacent artifact card kinds for supporter visibility while still returning allowed structural cards.

The same coverage includes the no-edge supporter negative path: a supporter requesting scope=person for a child they cannot access receives the explicit Forbidden/403 response from resolveNowTarget rather than falling through to feed construction.

Verification includes the focused API integration test command for apps/api/src/routes/now.integration.test.ts and git diff --check. The test must exercise the HTTP/DB path, not only rankCandidates() or supporter-structural-mask unit helpers.
'@

$ac1402 = @'
Done when GET /now/overflow has route-level coverage asserting it validates the same query contract as /now, calls buildNowOverflow with the authenticated profileId, and returns the parsed overflow response shape instead of being an untested route.

DB-level /now integration coverage is extended beyond the existing retention_due and ledger_moment cases to cover needs_deepening, challenge_ready, parked_item, and unfinished_session candidate wiring, including person and supporter-hub scopes where applicable.

At least one integration case proves aging-window promotion for parked/deepening candidates through the DB-backed /now path, not only the pure rankCandidates() unit tests.

Verification includes the focused API route/unit test for apps/api/src/routes/now.test.ts if touched, the focused API integration command for apps/api/src/routes/now.integration.test.ts, and git diff --check.
'@

$ac1410 = @'
Done when the vocabulary subject screen hides or disables destructive delete affordances for non-owner/proxy viewing states and has a negative screen test mirroring the saved/book/topic write-gating patterns, so a proxy viewer cannot see a delete action that the server will reject.

Book deletion and topic note write/delete surfaces gain negative tests for proxy or impersonated-child viewing states using the established active-profile-role test pattern; the tests assert the write affordance is absent or inert rather than merely asserting a server error after tap.

Progress index coverage proves the requestedProfileId/profileId data-isolation path, parent-proxy routing branch, and ProgressStatsChips isViewingSelf vocabulary privacy control with focused tests.

Verification includes the related mobile Jest test files for touched vocabulary/book/topic/progress surfaces, mobile typecheck if production TSX changes are made, and git diff --check.
'@

$ac1409 = @'
Done when subject-hub producer coverage no longer hardcodes canStudy=true as the only tested path: add a masked-render integration or hook test proving a supporter/proxy viewer receives canStudy=false and the hub hides study/note affordances while preserving read-only content.

Assessment picker/index coverage includes the missing owner/proxy/navigation guard behavior and terminal result UI states for pass, borderline, and failed_exhausted outcomes, including gap-fill/decline-refresh/celebration affordance expectations where those branches render.

The /ready interstitial primary CTA is pressed in a test and proves session-param forwarding to the session route, including the existing sessionId/topicId/rawInput forwarding contract.

Verification includes the focused mobile Jest tests for use-subject-hub, assessment picker/index, ready screen, mobile typecheck if production TSX changes are made, and git diff --check.
'@

$ac1408 = @'
Done when use-session-recovery has focused hook coverage for SecureStore marker read, matching-session hydration, AppState background marker write, stale/nonmatching marker handling, and silent SecureStore failure behavior.

Session summary coverage asserts the V2 reflection bonus display for reflectionBonusXp/bonusXpEarned in both submitted and persisted summary states, matching the existing FirstSessionWrapUpCard test style rather than snapshot-only coverage.

use-text-to-speech has a regression test for the native speech onError path resetting speaking state or surfacing the expected failure state without freezing playback.

Challenge Round offer-to-accept-to-banner-to-drafted-note and crash-recovery e2e coverage are either added/updated as maintained Maestro flows or explicitly documented as verify-at-e2e-run with static validation and a local-infra reason if an emulator cannot be run in the executor environment.

Verification includes the related mobile Jest tests for the touched hooks/screens, the Maestro/static validator for any e2e YAML changes, a device-run result or documented local-infra caveat for device-dependent assertions, mobile typecheck if TSX changes are made, and git diff --check.
'@

Invoke-RefinePatch -Wi "WI-1403" -Effort "S" -FoundIn "apps/api/src/services/now-feed.ts; apps/api/src/routes/now.integration.test.ts; apps/api/src/services/now-feed.test.ts" -AcceptanceCriteria $ac1403
Invoke-RefinePatch -Wi "WI-1402" -Effort "M" -FoundIn "apps/api/src/routes/now.ts; apps/api/src/routes/now.test.ts; apps/api/src/routes/now.integration.test.ts; apps/api/src/services/now-feed.ts; apps/api/src/services/now-feed.test.ts" -AcceptanceCriteria $ac1402
Invoke-RefinePatch -Wi "WI-1410" -Effort "M" -FoundIn "apps/mobile/src/app/(app)/vocabulary/[subjectId].tsx; apps/mobile/src/app/(app)/progress/saved.tsx; apps/mobile/src/app/(app)/shelf/[subjectId]/book/[bookId].tsx; apps/mobile/src/app/(app)/topic/[topicId].tsx; apps/mobile/src/app/(app)/progress/index.tsx; apps/mobile/src/app/(app)/progress/_components/ProgressStatsChips.tsx" -AcceptanceCriteria $ac1410
Invoke-RefinePatch -Wi "WI-1409" -Effort "M" -FoundIn "apps/mobile/src/hooks/use-subject-hub.ts; apps/mobile/src/hooks/use-subject-hub.test.tsx; apps/mobile/src/app/(app)/assessment-picker.tsx; apps/mobile/src/app/(app)/assessment/index.tsx; apps/mobile/src/app/(app)/ready.tsx; apps/mobile/src/app/(app)/ready.test.tsx" -AcceptanceCriteria $ac1409
Invoke-RefinePatch -Wi "WI-1408" -Effort "L" -FoundIn "apps/mobile/src/app/(app)/session/_hooks/use-session-recovery.ts; apps/mobile/src/app/session-summary/[sessionId].tsx; apps/mobile/src/hooks/use-text-to-speech.ts; tests/e2e/flows/resume-crash-recovery.yaml; tests/e2e/flows" -AcceptanceCriteria $ac1408
