## What was done

Replaced the WI-2234 held-response Request-wrapper identity comparison with a
stable discriminator established before the held request is released.

## What changed

The routed request now receives a unique correlation query value. Response
selection compares GET plus the complete correlated URL, so a separately
materialized Playwright Request wrapper still matches while adjacent Now
requests cannot. Focused seam coverage exercises wrapper recreation, exact
correlation, adjacent scopes, and the wrong method. No production code changed.

## Verification

The matcher seam was executed red then green. The real returning-learner
journey passed repeatedly against staging with retries disabled, while retaining
the original Session-held, fresh-response, Mentor, and card guarantees. Style,
lint, GC1, focused Jest, and mobile typecheck gates passed.

## Caveats / Follow-ups

The complete no-retry V2 project passed the WI-2234 journey but remains blocked
from aggregate strict green by WI-2822's independently owned stale nav-shell
doorway assertion. Its existing PR #2658 contains the exact contract update;
this change does not duplicate or absorb it.
