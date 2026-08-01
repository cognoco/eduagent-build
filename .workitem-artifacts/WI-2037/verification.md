# Verification — WI-2037

**Producer:** `codex:builder:WI-2037` · **Worktree HEAD:** `503f4759ec49390b838b4f95549a4bbbaddb7845` · **Current `origin/main`:** `503f4759ec49390b838b4f95549a4bbbaddb7845` · **State:** provisionally approved working tree; final ratification in OPQ-160; uncommitted

## Moving-base and collision preflight

- The worktree fast-forwarded over 27 new mainline commits to `503f4759ec49390b838b4f95549a4bbbaddb7845`; none changed any of the nine product target paths.
- An exhaustive scan of all open GitHub PRs found no target-path overlap, no additional PR page, and no PR whose file map exceeded the queried page.
- The worktree remains isolated at `.worktrees/WI-2037`; setup-generated `.artifacts/` remains untracked and outside scope.
- The expired same-owner claim was renewed as `codex:builder:WI-2037` before further delivery work.

## Automated evidence

| Check | Result |
|---|---|
| `pnpm run check:decision-adr-link` | PASS — clean; 3 grandfathered, 0 new. |
| `pnpm run check:teen-consent-claims` | PASS — 19/19 guard tests; 0 grandfathered and 0 new claims. Non-fatal existing `ts-jest` TS151001 warning only. |
| Targeted `prettier --check` over all nine product docs and lifecycle artifacts | PASS. |
| `git diff --check` | PASS. |
| `BASE_REF=main scripts/check-change-class.sh --branch` | PASS — no routed change class; 8 tracked files checked. |
| `BASE_REF=main scripts/check-change-class.sh --branch --run --fast` | PASS — no additional routed validation. The new untracked spec is covered directly by the targeted checks. |
| Stale/governance regression search | PASS — no final Accepted claim, stale human-signoff delivery gate, email `withdrawal-only` claim, L3 normative delegation, or unauthorized 17+ recruitment ruling remains; the provisional rider and OPQ-160 debt are explicit. |
| JSON parse and manifest shape | PASS for `workitem.json` and lifecycle `evidence.json`; every AC has a machine-resolvable repository path. |
| Target-path moving-base diff | PASS — zero target drift against current `origin/main`. |
| Open-PR collision scan | PASS — zero target overlap. |

The range-only ADR provenance ratchet does not inspect an uncommitted rewrite of an existing ADR. Direct review therefore verified the stronger requirements: formal `Status: Proposed` until final ratification, explicit provisional-approval rider and human deciders, timeless decision content, soft-wrapped paragraphs/list items, and no Work Item or L3 artifact used as decision authority. OPQ-160 is referenced only as lifecycle provenance, not as the decision's architectural spine.

## Independent shepherd review

The first two-axis review found five Standards blockers and three Spec blockers. The corrections:

- changed the pre-live ADR rewrite from a mixed Accepted/Proposed claim to a single Proposed status with pending Architecture sign-off;
- soft-wrapped the ADR and removed transient Work Item gates, progress snapshots, and delegated L3 authority from ADR/canon;
- preserved ordinary email approval/denial/withdrawal of scoped consent grants while prohibiting Guardianship creation and family-join resumption;
- added explicit missing-input fail-closed behavior and reshaped the full failure-mode matrix to the required `State | Trigger | User sees | Recovery` contract;
- restored the existing beta recruitment criterion and left any narrowing as the pre-existing unresolved operator/PM product decision;
- named and versioned the `GuardianAttachEvidenceV1` audit envelope.

On 2026-08-01, Jørn provisionally approved the rewrite and directed delivery to proceed as fully approved. The resulting status-only changes preserve the reviewed decision content, add an explicit rider, and assign final ratification to Zuzka in OPQ-160. Hosted exact-head review remains required before landing.

Spec-axis re-review returned PASS with all three findings resolved. Standards-axis re-review confirmed all original findings resolved, identified the four-column Failure Modes requirement, and returned PASS after the table was corrected. No shepherd finding remains.

## Acceptance-Criteria review

- AC-1: the provisionally approved distinct authenticated-adult ceremony is defined; learner/invitation/role/email paths cannot mint Guardianship, while ordinary scoped email-grant behavior remains intact.
- AC-2: adult Person resolution, verified qualification and assurance/VPC, complete destination purposes, atomic global edge plus fresh grants, and `GuardianAttachEvidenceV1` are explicit.
- AC-3: missing, stale, withdrawn, denied, expired, wrong-authority, residence/policy drift, partial, replay, concurrency, cross-Organization, and provider-unavailable states fail closed with user-visible recovery semantics.
- AC-4: API, mobile, identity, Supportership, audit, retry/idempotency, migration, compatibility, and regression consequences are explicit.
- AC-5: WI-2533 owns implementation/regressions and WI-1753 remains 17+-only until that slice lands; beta recruitment is not narrowed by this Work Item.

## Remaining gates

1. Final verification, commit/push/PR, strict-green governed landing, execute-complete, independent QA/review, and Close.
2. OPQ-160 remains a nonblocking final-ratification debt; its eventual ruling must be folded back into the ADR before release.
