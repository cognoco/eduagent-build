# PR #137 review-comment validation & response

**Date:** 2026-05-02
**Source PR:** [#137 — `audit(eval): first runLive — exchanges flow [AUDIT-EVAL-2]`](https://github.com/cognoco/eduagent-build/pull/137) (merged `86a31c33`)
**Follow-up PR:** [#139 — post-merge fixes [AUDIT-EVAL-2.1]](https://github.com/cognoco/eduagent-build/pull/139)
**Reviewer:** `claude-review` bot (3 review comments, all `Medium` or scoped at code-quality)

## Why this doc exists

PR #137 implemented the first `runLive` adapter in the eval-llm harness. The
automated reviewer left three review comments. Two of them flagged real
fidelity gaps with production behaviour; the third flagged a CLAUDE.md
convention violation.

Validation was done by reading the production callsites and the cited
CLAUDE.md rules directly, not by trusting the reviewer's framing. All three
claims were factually correct. Fixes for all three were applied in commit
`463051ac` and verified locally — but that commit was stranded when PR #137
merged before the push fully propagated to remote, so the fixes were
re-shipped as the cherry-picked PR #139.

This doc captures the reasoning behind each verdict so future reviewers /
flow authors don't re-litigate the same decisions on the next ~12 flows
that will copy this runLive pattern.

## The three findings

### #1 — Sanitization gap (review comment [3177018621](https://github.com/cognoco/eduagent-build/pull/137#discussion_r3177018621))

**Reviewer claim:** Production `processExchange`
(`apps/api/src/services/exchanges.ts:314, 380`) maps user-role history
turns through `sanitizeUserContent()` to strip `<server_note>` markers
before forwarding to `routeAndCall`. The original runLive sent raw
`.content`. This is a second fidelity gap (in addition to the
documented `AUDIT-EVAL-3` orphan-addendum gap).

**Validation:** Confirmed by reading `services/exchanges.ts:38–42`.
`SERVER_NOTE_RE = /<\/?server_note[^>]*>/gi` and the function strips matches.
The sanitization exists because `buildOrphanSystemAddendum(...)` injects
`<server_note kind="orphan_user_turn" reason="…"/>` markers into the system
prompt; without sanitization, a user could forge those markers via a chat
message and trick the LLM into reading a fabricated system note.

**Severity in practice:** Low for the `exchanges` flow specifically — the
harness's `exchangeHistory` comes from controlled fixture files
(`fixtures/exchange-histories.ts`) that contain no `<server_note>` markers.
But the gap matters for **pattern propagation**: this is the FIRST runLive,
and the next ~12 flows will copy the shape. If any of them ever have
user-controlled content (now or later), the gap becomes exploitable.

**Verdict: Fix in this PR.** Pattern-setting concern dominates.
Implementation: export `sanitizeUserContent` from
`services/exchanges.ts` (was module-local) so the harness can apply
the same canonical sanitization rather than duplicating the regex.

**Shipped:** PR #139, files `apps/api/src/services/exchanges.ts` (export
keyword added) and `apps/api/eval-llm/flows/exchanges.ts` (sanitization
called inside the history `.map(...)` and around the final user turn).
Regression test added — forges `<server_note>` markers in fixture history
and asserts every user turn passed to the LLM has them stripped.

### #2 — Silent empty-user fallback (review comment [3177018727](https://github.com/cognoco/eduagent-build/pull/137#discussion_r3177018727))

**Reviewer claim:** `messages.user` is typed `string | undefined`
(per `runner/types.ts:18`). The original runLive used
`messages.user ?? ''`, silently sending `{ role: 'user', content: '' }`
to the LLM when undefined. For exchanges this won't fire (buildPrompt
always extracts a user turn from history for non-first-turn scenarios),
but other flows copying this pattern may have legitimately optional
user content and will silently misbehave.

**Validation:** Confirmed against `runner/types.ts:18` (the type) and
the harness's own `buildPrompt`
(`flows/exchanges.ts` — extracts last user turn, may yield undefined
for first-turn scenarios). Existing test of the verbatim-response
behaviour was using scenario S1 (first-turn, no prior user content)
and was *only passing* because the silent fallback hid the latent issue.

**Tension with CLAUDE.md:**
"*Don't add error handling, fallbacks, or validation for scenarios that
can't happen. Trust internal code and framework guarantees. Only validate
at system boundaries (user input, external APIs).*"

The runner ↔ flow seam is internal. But "can't happen" is a per-flow
buildPrompt invariant, not a framework guarantee — future flow authors
may not preserve it. Throwing makes the contract explicit at the place
the invariant is consumed, which is exactly where defensive validation
*does* pay off.

**Verdict: Fix in this PR.** Replace the silent fallback with an explicit
`throw` naming the offending scenario.

**Shipped:** PR #139, file `apps/api/eval-llm/flows/exchanges.ts`. The
existing "returns response verbatim" test was switched from S1
(first-turn → throws by design) to S2 (mid-session, has user content).
New regression test added — strips `messages.user` and asserts runLive
rejects with the expected message and never invokes the LLM client.

**Bonus catch:** the new throw immediately surfaced the latent S1 issue
in the existing test. Without the explicit-throw fix, that test would
have continued passing while silently sending empty user turns to the
real LLM during Tier-2 runs.

### #3 — 9-line comment block (review comment [3177018808](https://github.com/cognoco/eduagent-build/pull/137#discussion_r3177018808))

**Reviewer claim:** The `runLive` test file opens with a 9-line
`// ───…───` comment block explaining why `jest.mock` is hoisted above
the imports. CLAUDE.md (system prompt verbatim):

> "*In code: default to writing no comments. Never write multi-paragraph
> docstrings or multi-line comment blocks — one short line max.*"

**Validation:** Trivially correct — the comment was 9 lines (incl.
separator dashes) and the rule is unambiguous. The hoisting rationale is
well-known jest.mock behaviour; the in-comment reference to a similar
pattern in `services/learner-profile.test.ts:19` belongs in the PR
description / commit body, not the file header.

**Verdict: Fix in this PR.** Trivial collapse to one line.

**Shipped:** PR #139, file `apps/api/eval-llm/flows/exchanges.test.ts`.

## Cross-cutting observations

**The throughline is pattern-setting.** All three are findings on the
**first** runLive. The next ~12 flows will copy this canonical
implementation. A silent sanitization gap, a silent empty-content
fallback, and an over-long file-header comment all become the precedent
for the rest. Fixing on day 0 is cheap; un-fixing 12 copies later is not.

**The reviewer's recommendations were code-suggestion blocks, not
abstract critiques.** All three suggestions could have been applied
verbatim. The fixes that shipped did diverge from the suggestions in
small ways:

- For #1, I exported the existing `sanitizeUserContent` helper rather
  than duplicating the filter inline as the reviewer suggested
  (DRY / single source of truth).
- For #2, I followed the suggestion verbatim.
- For #3, I followed the suggestion verbatim.

**Verification chain on the original commit (`463051ac`):**
- `pnpm exec nx run api:typecheck` — pass
- `pnpm exec nx run api:lint` — pass (no new warnings)
- `jest exchanges.test.ts` — 16/16 passing (was 14, added 2 new
  regression tests)
- `pnpm eval:llm --flow exchanges` — Tier-1 snapshots byte-identical
  (the runLive change does not perturb the Tier-1 prompt-snapshot output)
- Manual Tier-2 smoke (1 LLM call, requires Doppler) — deferred

The cherry-pick into PR #139 is byte-identical content; the same
verification applies.

## Process note: stranded-commit incident

**What happened:** I pushed `463051ac` (the fix commit) to `origin
audit/eval-runlive` at ~18:11. PR #137 was then merged at 18:18:53Z
with `headRefOid: 5f30c27b` — the commit *before* the fix. The merge
auto-deleted the remote branch. My fix was preserved locally but never
made it onto main.

**Detection:** Caught when investigating why CI didn't fire on the new
commit. `gh run list --commit 463051ac` returned `[]`;
`git ls-remote origin audit/eval-runlive` was empty;
`gh pr view 137 --json headRefOid` showed `5f30c27b`, not `463051ac`.

**Likely cause:** Push timing — the push had completed locally and
returned success, but GitHub's PR-state-reconciliation may have used
the head ref it had at the moment the merge button was clicked. (Or
possibly a force-delete of the branch happened externally between the
push and the merge.) The threaded review-replies I posted referenced
"Fixed in 463051ac" — true in the sense that the commit existed, but
misleading in that it implied the commit was on main.

**Resolution:** Cherry-picked `463051ac` onto a fresh
`audit/eval-runlive-fixup` branch off current `origin/main`,
opened PR #139, deleted the stranded `audit/eval-runlive` remote
branch, and posted follow-up replies on each of the three review
threads correcting the trail to point at #139.

**Lesson worth flagging for future audit work:** when re-pushing to a
PR's branch immediately before a merge, verify with
`gh pr view <num> --json headRefOid` that GitHub sees the new commit
*before* allowing the merge to proceed. The "push succeeded" return
code alone is not sufficient evidence that the PR-merge button will
take the new commit.
