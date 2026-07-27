## What was done

Audited WI-2838's historical held-response seam after an automated review found that WI-2842's first mutation removed the correlated URL continuation. Re-ran the exact historical continuation/matcher implementation across four independent staging seeds.

## What changed

No product behavior changed. The synthetic timeout claim is withdrawn, the evidence now records the faithful historical reversion and its all-green result, and both product files are restored byte-for-byte.

## Verification

The exact historical journey blob with `route.continue({ url: discriminator.url })` passed four independent staging runs with one worker, zero retries, and dependency projects disabled. The landed route-owned strategy also passed. Final product blob identities match the landed revision and the source diff is empty.

## Caveats / Follow-ups

WI-2842 AC-3 cannot be met: the original held-response timeout is not reproducible at the exact legacy seam. The item must not be marked Done or merged on synthetic evidence. Independent review should disposition it Not Reproducible, close PR #2670 unmerged, and formally remove it from BID-19. External mutation-gate work remains owned by WI-2564.
