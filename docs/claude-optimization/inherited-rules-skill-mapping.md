# Inherited Rules — Skill Overlap Mapping

**Purpose:** First-pass mapping of every subsection in `CLAUDE.md` § "Inherited Rules" against the loaded skill list, to inform Step 2 migration decisions.

**Method:** Mapping is based on skill *descriptions* (visible in context) without reading skill bodies. HIGH-confidence overlaps need body verification before deleting from CLAUDE.md.

**Created:** 2026-04-30, during Step 1 cleanup of global CLAUDE.md.

---

## Confidence legend

- **HIGH** — skill description strongly suggests full coverage; verify body, then likely delete from CLAUDE.md.
- **MEDIUM** — partial overlap; skill could absorb the rule with extension, or the rule stays project-specific while the skill handles a related concern.
- **LOW** — tangential overlap; skill mentions adjacent territory but doesn't cover the rule.
- **NONE** — no skill covers this; rule stays in CLAUDE.md, becomes a new skill, or moves to a playbook.

---

## UX Resilience Rules

| Subsection | Candidate skill | Confidence | Step 2 verdict |
|---|---|---|---|
| Every Screen State Must Have an Action | `ux-dead-end-audit` | **HIGH** | Verify skill body covers loading/error/empty/offline/expired state checklist. If yes → delete from CLAUDE.md. |
| Error Handling Rules (mutateAsync, classify, router.back) | `ux-dead-end-audit` | **MEDIUM** | Skill likely covers state-level dead ends but may not encode these specific code patterns. Likely keep as project/stack rule unless skill body extends. |
| Spec Failure Modes Before Coding | `superpowers:writing-plans`, `superpowers:brainstorming` | **MEDIUM** | The "every spec needs a failure modes table" requirement could be added to writing-plans, or stay as a project spec rule. Verify writing-plans body for failure-mode coverage. |
| Typed Error Hierarchy | none | **NONE** | Stack-specific (frontend + API client). Keep as project/stack rule, or future "frontend-error-architecture" skill. |
| End-to-End Feature Tracing | `superpowers:verification-before-completion` | **LOW** | Conceptually adjacent (verify dispatched events fire) but the skill is about claim-verification, not feature-trace. Keep as project rule. |
| No Internal Mocks in Integration Tests | `bmad-tea-testarch-test-design`, `bmad-tea-testarch-test-review`, `superpowers:test-driven-development` | **MEDIUM** | Multiple test-architecture skills exist. Verify whether any encode the "no internal mocks" rule specifically. If yes → delete; if no → keep, possibly add to a TDD/test-arch skill. |
| Standard Error Fallback Pattern | `ux-dead-end-audit` | **MEDIUM** | UX rule expressed as component pattern. Body may overlap. Keep as project/stack rule unless skill body covers ErrorFallback/TimeoutLoader-style patterns. |

## Fix Verification Rules

| Subsection | Candidate skill | Confidence | Step 2 verdict |
|---|---|---|---|
| Security Fixes Require a "Break Test" | `superpowers:test-driven-development`, `superpowers:verification-before-completion` | **MEDIUM** | TDD covers test-first generally; verification covers claim-verification. Neither encodes "break test for CRITICAL/HIGH security fix" specifically. Could be a new "security-fix-discipline" skill, or stay project-specific. |
| Silent Recovery Without Escalation is Banned | none | **NONE** | Engineering hygiene rule about observability for fallbacks. No skill covers it. Keep as project rule, or future "fault-recovery-discipline" skill. |
| Destructive Migrations Need a Rollback Section | none | **NONE** | DB-migration-specific. No skill covers it. Keep as project rule. |
| NO-OP Dismissals Need Line References | covered by **global principle #2** ("Evidence beats assertion") | **HIGH** | Already enforced at global level. Can delete the specific phrasing from project file; principle #2 carries the same weight. |
| Fix Tables Must Include a "Verified By" Column | `superpowers:verification-before-completion` | **MEDIUM** | Verification skill covers the *act* of verifying; the column convention is project-process-specific. Keep as project rule. |
| Fix Commits Must Reference the Finding ID | `commit`, `default:zdx:commit` | **LOW** | Commit-format skills exist but don't enforce finding-ID convention. Keep as project rule, possibly extend the project's commit skill. |

## Code Quality Guards

| Subsection | Candidate skill | Confidence | Step 2 verdict |
|---|---|---|---|
| Response Bodies Are Single-Use | none | **NONE** | JS-specific gotcha. No skill covers it. Keep, possibly future "frontend-pitfalls" or "js-runtime-gotchas" skill. |
| Classify Errors Before Formatting | none | **NONE** | Specific code-flow pattern. No skill covers it. Keep. |
| Clean Up All Artifacts When Removing a Feature | `simplify` | **MEDIUM** | `simplify` description: "Review changed code for reuse, quality, and efficiency." Could absorb "clean up dead artifacts" if its body extends. Verify skill body. |
| Verify JSX Handler References Exist | none | **NONE** | React-specific pre-runtime check. No skill covers it. Keep, possibly future "react-pitfalls" skill. |

## Secrets Management

| Subsection | Candidate skill | Confidence | Step 2 verdict |
|---|---|---|---|
| All secrets through Doppler | none | **NONE** | Tool/infra preference. No skill covers it. Keep as user-preference rule, or future "infra-tooling" skill (alongside modern-cli-tooling). |

## PR Review & CI Protocol

| Subsection | Candidate skill | Confidence | Step 2 verdict |
|---|---|---|---|
| Before Declaring a PR "Ready to Merge" | `superpowers:requesting-code-review`, `superpowers:receiving-code-review`, `review`, `fix-ci`, `ship` | **MEDIUM** | Multiple review-related skills exist. Verify whether any encode the specific `gh pr diff` / `gh pr checks` workflow. If `review` or `ship` body covers it → delete from CLAUDE.md. |
| When Rebasing PRs | none | **NONE** | Rebase-specific verification. No skill covers it directly. Keep as project rule. |
| When Asked to "Fix CI" on a PR | `fix-ci` skill | **HIGH** | Skill exists with the exact name. Verify body, almost certainly covers this rule → delete from CLAUDE.md. |

---

## Summary by verdict

| Verdict | Count | Items |
|---|---|---|
| **HIGH overlap — delete after body verification** | 3 | Every Screen State, NO-OP Dismissals, Fix CI |
| **MEDIUM overlap — extend skill or keep project-specific** | 8 | Error Handling Rules, Spec Failure Modes, No Internal Mocks, Standard Error Fallback, Break Test, Verified By Column, Clean Up Artifacts, PR Ready to Merge |
| **LOW overlap — keep, skill is tangential** | 2 | E2E Feature Tracing, Finding ID in Commits |
| **NONE — stays put or new skill** | 8 | Typed Error Hierarchy, Silent Recovery, Destructive Migrations, Response Body Single-Use, Classify Before Format, JSX Handler Refs, Doppler Secrets, Rebase PRs |

## Step 2 implications

- **3 rules can be deleted from CLAUDE.md outright** once skill body verification confirms coverage. This is the easy win.
- **8 rules are candidates for skill extension** — i.e., consider expanding existing skills rather than keeping the rule in CLAUDE.md. Each requires a judgment call on whether skill scope should grow.
- **8 rules genuinely have no skill coverage today.** These split into:
  - "Stays project-specific" (rebase rules, finding ID convention, Doppler) — ~3-4
  - "Future skill candidates" (Silent Recovery, Destructive Migrations, JS/React runtime gotchas) — ~4-5

## Open questions for Step 2

1. **Skill body verification.** Three HIGH-confidence items rest on the assumption that the skill body matches the description. Verify before deleting.
2. **Should new skills be created in Step 2, or deferred?** Creating new skills (e.g., for Silent Recovery, JSX-runtime-gotchas) is non-trivial work. Step 2 may identify them but defer creation to Step 3+.
3. **What about CLAUDE.md sections that *aren't* in Inherited Rules?** This audit only covers Inherited Rules. The pre-existing project sections (Non-Negotiable Engineering Rules, Schema And Deploy Safety, Repo-Specific Guardrails) may also have skill overlaps worth mapping.
4. **Memory entries.** Several memory items paraphrase rules covered here. Step 2 must reconcile after the CLAUDE.md side is settled.

## Skills referenced (for body verification in Step 2)

To verify HIGH/MEDIUM overlap claims, read the bodies of:

- `ux-dead-end-audit` (covers UX Resilience block — high priority)
- `superpowers:verification-before-completion`
- `superpowers:test-driven-development`
- `superpowers:writing-plans`
- `superpowers:brainstorming`
- `bmad-tea-testarch-test-design`, `bmad-tea-testarch-test-review`
- `simplify`
- `superpowers:requesting-code-review`, `superpowers:receiving-code-review`
- `review`, `fix-ci`, `ship`
