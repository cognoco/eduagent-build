# WI-2842 verification

- Landed product revision under test: `a36b0891c7288125c04ab574ebbd1b400f59b64c`.
- Initial green: named staging journey passed 1/1 in 58.3 seconds.
- Exact historical pre-final journey blob: verified byte-for-byte as
  `012399938c90facc3f66ede4ff61683a24d7f054`; current browser run passed, so it
  was not treated as mutation RED.
- Credited controlled mutation: legacy response-wrapper matcher plus the exact
  missing-correlation-rewrite behavior; named journey failed 1/1 with
  `page.waitForResponse` timeout after 15000ms.
- Restoration: journey blob
  `5ff958fb735af0c22481b91e7935d5b5a1c75295` and helper blob
  `ddecb0e004b2926acf5c80cd414df7d08c1b299d` matched `HEAD`; `git diff --quiet`
  passed for both source paths.
- Restored green: the identical named staging journey passed 1/1 in 56.6
  seconds with one worker, retries disabled, and dependency projects disabled.
- Product-source status after proof: clean; only WI-2842 evidence artifacts are
  untracked before the evidence commit.
- Initial dependency-precondition failure (`expo` unavailable) was resolved by a
  lockfile-pinned install and is not credited as product evidence.

The recurrence is cross-linked through immutable Cosmo comments:

- WI-2838 origin/evidence repair: `3aa8bce9-1f7c-810b-a3f2-001d463d0cb6`;
- external armed ZDX mutation gate WI-2564:
  `3aa8bce9-1f7c-817e-9a93-001dd4429d0d`.
