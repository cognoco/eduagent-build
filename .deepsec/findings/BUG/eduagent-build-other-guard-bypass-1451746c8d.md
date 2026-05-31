# [BUG] GC1 mock guard misses multiline jest.mock calls

**File:** [`scripts/check-gc1-pattern-a.ts`](https://github.com/cognoco/eduagent-build//blob/main/scripts/check-gc1-pattern-a.ts#L35-L105) (lines 35, 89, 103, 105)
**Project:** eduagent-build
**Severity:** BUG  •  **Confidence:** medium  •  **Slug:** `other-guard-bypass`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

The detector only applies MOCK_LINE to each added diff line independently, so a new internal mock written as a multiline call such as jest.mock(\n  './services/foo',\n  () => ({ ... })\n) has no single added line matching the regex and is not checked for Pattern A or gc1-allow. This weakens the CI/pre-commit ratchet and can allow broad internal mocks to land despite the stated guard. Prettier will collapse simple cases, but long or commented call expressions can remain multiline.

## Recommendation

Parse staged/HEAD test files with the TypeScript AST and inspect jest.mock/jest.doMock call expressions whose start line was added, or assemble multiline added hunks before matching.

## Revalidation

**Verdict:** true-positive

Confirmed against current source. MOCK_LINE (line 35) is /jest\.(?:mock|doMock)\(\s*['"`](\.\.?\/[^'"`]+)['"`]/ — it requires `jest.mock(`, optional whitespace, and the quoted relative-path argument to all be present in a single matched string. findAddedMockLines (lines 89-116) parses a `git diff --cached --unified=0` patch and tests each added (`+`) line's content independently with MOCK_LINE.test(content) (line 105); there is no multiline hunk reassembly and no TypeScript AST parse. For a multiline call — `jest.mock(` on line 1, `'./services/foo',` on line 2 — line 1 has the keyword but no quote/path after `(` (so `\s*['"`]` fails) and line 2 has the path string but not the `jest.mock(` prefix, so no single added line matches. Because no site is pushed, isPatternA() (which itself does a 30-line window join, but only runs on an already-found site) is never reached, and neither Pattern A nor the gc1-allow escape is evaluated — the broad internal mock lands undetected. Git history (67be215ec introduced the per-line detector; 139dbdaf8 only unified the CI diff source) shows no AST/multiline remediation. This is a genuine guard-completeness BUG (CI ratchet bypass), not an attacker exploit; BUG severity is correct. Prettier collapses simple single-arg calls, but any two-argument call with a long factory body, or a pre-existing multiline mock, evades the check.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-14)
