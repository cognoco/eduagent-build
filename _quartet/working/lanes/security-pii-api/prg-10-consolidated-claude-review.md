# PRG-10 — Consolidated Claude Review (retroactive gap-closure)

**Hand this whole file to a fresh Claude session as its task.** It is self-contained.

---

## Why this review exists

PRG-10 ("API Security & PII") landed on `main` as **17 work items across 7 PRs**. Every one
of those 7 PRs **merged with the `claude-review` GitHub check RED** — a workflow outage
(PR #1121's GHA-hardening stripped the OIDC `id-token: write` permission the Claude review
action needs; fixed later in `daba25e62`, but after all 7 had already merged). So the **Claude
automated review gate never ran on a single line of this lane.**

This is **not** unreviewed code: every WI went through the Cosmo `/cosmo:review` + `/cosmo:qa`
gate (closed Resolution=Done) and CodeRabbit ran on the PRs. This review is the **missing
third reviewer** — a defense-in-depth top-up, warranted because (a) it is the **security / PII**
lane and (b) the automated Claude gate was 0/7. Your job is to supply the adversarial Claude
review that the outage skipped.

You are reviewing **already-merged code on `main`** — there is no open PR to comment on.
Produce a triaged findings **report** the operator will turn into fast-follow work items.

## Repo + hard constraints

- Repo: `/Users/vetinari/nexus/_dev/eduagent-build`, branch `main`.
- **READ-ONLY.** Do **not** edit code. Do **not** create or modify Cosmo work items. **No git
  mutations** (no checkout/switch/commit/branch/stash/worktree). This is a **shared checkout** —
  touch nothing. Read via `gh`, `git show`/`git diff`/`git log`, `rg`, `fd`, file reads only.
- **Ground the review in the repo's own standards — read `AGENTS.md` first**, especially:
  *Non-Negotiable Engineering Rules* (scoped reads/writes via `createScopedRepository` or the
  parent-chain pattern; `@eduagent/schemas` contract; envelope; `safeSend`), *Fix Development
  Rules* (**security fixes tagged CRITICAL/HIGH must ship a negative-path break test** — flag any
  that don't), *Code Quality Guards* (no internal `jest.mock` — GC1/GC6), *UX Resilience Rules*,
  and *PR Review & CI Protocol*. Also `docs/architecture.md` for any change touching routing,
  data access, Inngest, or LLM routing.

## The changeset — 7 PRs / merge commits / 17 WIs

| PR | merge commit | WIs | What it claims to fix (findings) |
|---|---|---|---|
| **#1121** | `a69c6417b` | WI-698, WI-709, WI-710 | GHA workflow hardening; GHA permission-scope narrowing (F-024/127/154); `@claude` auth/trigger guard (F-119/129/132) |
| **#1122** | `825f354615` | WI-699, WI-711, WI-712 | DoS/race WP; JWKS DoS negative-cache + cooldown (F-181); race/atomicity non-destructive updates (F-120/164/167) |
| **#1111** | `6fea5bc5ab` | WI-700, WI-707, WI-708 | input-validation WP; size/length bounds (F-142/179/180); schema-parse untrusted deep-link (F-158/166) |
| **#1115** | `e220a8141c` | WI-701, WI-713, WI-714 | quota/billing WP; hw-summary LLM through quota gate + refund early-return (F-128/146); outbox-spillover cap (F-148) |
| **#1114** | `96d160b870` | WI-702, WI-715, WI-716 | logging/config hygiene WP; parameterize/guard (F-079/080/081/082); `console.debug`→structured logging (F-077/138/143) |
| **#1108** | `71f94a1fbd` | WI-703 | homework-library LLM prompt-injection fence (F-139) |
| **#1109** | `d2ba2ef8e5` | WI-704 | mobile `ThemedMarkdown` hardening vs LLM-markdown link/image attacks (F-027) |

**Get each diff:** `gh pr diff <number>` (works on merged PRs) — fallback `git show <commit>`.
For the originating finding text, grep `docs/audit/2026-05-29-full-audit/` for the finding IDs.

You **may fan out** sub-agents (one per PR, or one per security dimension) and synthesize — your
call. Be adversarial: for every fix, ask "does this actually close the hole, and what did it open?"

## Review focus (security/PII lane — weight toward exploitability)

For each PR verify **(a)** the claimed fix genuinely closes its finding(s), and **(b)** it
introduced no new gap or regression. Dimensions to hunt:

- **AuthZ / scoping / IDOR:** `profileId` enforced on every read (scoped repo, or parent-chain
  WHERE via the closest ancestor) and write; proxy-mode guards present; no cross-profile leak.
- **Input validation:** zod bounds at route/DTO boundaries; untrusted deep-link / schema-parse
  paths; size/length caps actually enforced (not just declared).
- **Injection:** LLM prompt injection (the classic "user A's content read → surfaced to user B"
  vector); markdown/link/image attacks in the mobile renderer; any SQL/string interpolation.
- **Race / atomicity:** CAS and transaction boundaries; JWKS negative-cache/cooldown correctness
  (does the cooldown arm only on the right path? can it be poisoned?); non-destructive updates.
- **Rate-limit / quota / billing integrity:** quota-gate routing, refund early-return, outbox
  spillover cap — verify **no bypass** AND **no silent data loss** (a cap that drops rows
  silently is a finding; billing/auth silent recovery without escalation is banned per AGENTS.md).
- **Logging / PII:** structured logging only; **no secret/PII leakage**; typed config object, not
  raw `process.env` (eslint G4).
- **GHA workflow security (#1121 — scrutinize hardest):** this PR's permission narrowing already
  over-stripped (`id-token: write` removal broke `claude-review`). Verify the rest of the
  narrowing is correct and not over-broad, the `@claude` auth/trigger guards (WI-710) have no
  bypass (untrusted-actor command injection into the workflow), and nothing else was silently
  disabled.
- **Test coverage:** does each CRITICAL/HIGH security fix carry a **negative-path break test**
  (red-green: the test fails without the fix)? Per AGENTS.md this is mandatory. No internal
  `jest.mock('./...')` (GC1/GC6).

## Output contract

Write your report to **`_wip/security-pii-api/prg-10-consolidated-review-result.md`** with:

- **Per finding:** `SEVERITY` (one of `BLOCKER | MUST_FIX | SHOULD_FIX | CONSIDER`), `file:line`,
  the issue, why it matters / how it's exploitable, the recommended fix, and **which PR/WI** it
  traces to.
- **Overall verdict:** is PRG-10 **safe-as-merged**, or are there gaps? If clean, say so plainly
  — a clean retroactive review is the gap-closure result we want.
- **Proposed fast-follow WIs:** list them (title + finding + one-line scope). **Do NOT create
  them in Cosmo** — the operator slices them into the "API Security & PII" workstream.

Do not edit code, do not create Cosmo work items, do not push or commit. Report only.
