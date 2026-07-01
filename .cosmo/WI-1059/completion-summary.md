**What was done:** Fixed the parseJson trust-boundary gap the reviewer found in the original WI-1059 merge (#1617, f2bbc17c): `res.json()` was called outside the try/catch, so a 2xx response with a non-JSON or malformed body rejected as a raw `SyntaxError` instead of the typed `ApiResponseShapeError` — JSON-parse failures were not classified at the API client boundary.

**What changed:** `parseJson` now wraps the JSON parse so any parse failure is caught and re-thrown as `ApiResponseShapeError`, classified at the client boundary (screens never see a raw SyntaxError). Landed via fix-forward PR #1667 (squash 78fb5468b3fe905c45fc9356d997c28c1883b516), superseding the gap in #1617.

**Verification:** Added a negative-path regression test (2xx response + non-JSON body → expects ApiResponseShapeError, not SyntaxError). PR #1667: all required checks SUCCESS, claude-review VERDICT APPROVED (0 must-fix / 0 should-fix), mergeStateStatus CLEAN. Merged squash 78fb5468b3fe905c45fc9356d997c28c1883b516.

**Caveats / Follow-ups:** Fixed In updated to 78fb5468b3fe905c45fc9356d997c28c1883b516 (the fix-forward merge); the prior Fixed-In f2bbc17c was the superseded buggy commit. None outstanding.
