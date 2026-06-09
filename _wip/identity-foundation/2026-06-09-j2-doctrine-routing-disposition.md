---
title: Phase J2 — Agent-doctrine + project-context disposition
date: 2026-06-09
phase: J2
status: EXECUTED 2026-06-09 — ratified + applied (5 routing repoints + 1 scope note); see exit-gate at bottom
scope: CLAUDE.md, AGENTS.md, docs/project_context.md — identity-foundation surface only
---

# Phase J2 — Agent-doctrine and project-context reduction

**What this is.** The J2 disposition (ROADMAP J2 row). Two clauses in the exit gate: **(a)**
identity-foundation facts duplicated from canon → pointers to `docs/INDEX.md` / `CANONICAL-SET.md`,
repo-wide engineering rules stay intact; **(b)** active-looking *superseded* routing doctrine
(`ARCH-9`, Gemini-only / pinned Gemini Flash/Pro wording) → repoint to `MMT-ADR-0014` (router
runtime/vetting hard-split), `MMT-ADR-0018` (single-orchestrator `routeAndCall()`), and
`docs/registers/llm-models/master.md` (the live vetted-model master).

**Grounding evidence (why the routing wording is superseded, not merely stale).**
- `apps/api/src/services/llm/router.ts` is mid-migration (V1→V2): legacy `'gemini' | 'gemini_only'`
  types + Gemini-2.5-flash/pro code paths still physically exist (`:21-22`, `:488-560`), but a V2
  remap (`:422-428`) deliberately ignores `providerPolicy` and routes legacy `gemini_only`
  (Family / Plus-standard) requests to the compliant universal default; `FALLBACK_FORBIDDEN =
  {gemini, vertex}` (`:418`).
- `docs/registers/llm-models/master.md` (live vetted set) **excludes Gemini/Vertex entirely**
  (under-18 prohibition — GCP SST §20(d) + Gemini API terms), pins **gpt-oss-120b on Cerebras** as
  the universal primary, runs **Family on gpt-oss** (gpt-5.4 carve-out). So "Family = Gemini-only /
  Flash rung 1-2 / Gemini Pro rung 3+ / Book gen on Gemini 2.5 Pro" is now *contradicted*, not just
  outdated — the textbook "active-looking superseded routing doctrine" J2 names.

---

## A. Clause (b) — superseded routing doctrine — the work (5 repoints, applied)

| # | File:line (pre-edit) | Superseded wording removed | Repoint applied |
|---|---|---|---|
| 1 | `docs/project_context.md:129` | "Standard Gemini routing uses Flash for rung 1-2 and Gemini Pro for rung 3+ … GPT-5.4 … rung 5+ … Family standard profiles are Gemini-only, incl. fallback" | Kept "routing is by escalation rung, not classification, via `routeAndCall()`"; pinned-model picture → `MMT-ADR-0014` + register; supersession flag (Gemini excluded, gpt-oss primary) |
| 2 | `docs/project_context.md:131` | "Book/topic-map gen uses the stronger Gemini-only path … Gemini 2.5 Pro … respect Family/default Gemini-only boundaries" | Kept "strong tier, no silent fallback (upstream of tutoring quality)"; model/policy → `MMT-ADR-0014` + register (async deep gen shares gpt-oss path); supersession flag |
| 3 | `docs/project_context.md:226` (Challenge Round Routing) | "Family standard stays Gemini-only; OpenAI advanced candidate stays rung 5+" | Kept "never bypasses commercial policy; routes via `resolveExchangeLlmRouting()`"; last sentence → `MMT-ADR-0014` + register + supersession flag |
| 4 | `CLAUDE.md:224` (Non-Negotiable Challenge Round bullet) | "Family standard remains Gemini-only, and the OpenAI advanced candidate stays rung 5+ only" | Replaced clause with `MMT-ADR-0014` + register pointer + supersession flag; rest of the bullet untouched |
| 5 | `docs/project_context.md:126` | "No direct LLM API calls … `routeAndCall()`" (durable + accurate, lacked an ADR cite) | KEEP + light cite `(MMT-ADR-0018)`; rule unchanged |

`docs/project_context.md:130` (the `pnpm test:llm:premium-routing` **test gate**) and `:196`
(the anti-pattern row "Call LLM providers directly → use `routeAndCall()`") are durable engineering
rules → **KEPT untouched**.

## B. Clause (a) — identity-canon duplicates → **EMPTY** (a finding)

No consent / COPPA / charge / capability-split / age-floor / 6-persona doctrine appears anywhere in
the three files — the interim-governance rule ("new canon is not inlined into agent-doctrine") held.
The one identity-shaped block, **CLAUDE.md § Profile Shapes** (5-tab/4-tab, `isOwner`, V0/V1 flags),
describes the **current** mobile nav/gating implementation tied to live `navigation-contract.ts` —
**not** a copy of the *target* identity canon (a different, not-yet-built model). **KEPT intact**;
gutting it would mis-describe current code as the target.

**Optional addition applied (light-yes, ratified):** a one-sentence `> **Scope.**` note atop Profile
Shapes clarifying it is the *current* system and the *target* identity model lives in
`docs/canon/identity/` + `CANONICAL-SET.md`. Pure addition; no content stripped.

## C. Structural findings (no edit)

- **`ARCH-9` / any `ARCH-N`: absent** from all three files — that half of the exit gate was already
  satisfied; nothing to remove.
- **AGENTS.md is already lean** — it lacks the Profile Shapes section *and* the Challenge Round
  routing bullet entirely (a pre-existing CLAUDE↔AGENTS divergence). So AGENTS.md needed **zero** J2
  edits, and there was nothing to mirror from the CLAUDE.md:224 edit. Not "fixed" in J2 (out of
  scope); flagged for the future CLAUDE/AGENTS unification work item.

## Exit-gate checklist — EXECUTED 2026-06-09

- [x] Clause (b): 5 repoints applied (4 in `project_context.md`, 1 in `CLAUDE.md`); every superseded
      "Gemini-only / pinned Flash-Pro / GPT-5.4" assertion now survives only inside an explicit
      "…wording is **superseded**" flag pointing at `MMT-ADR-0014` + the register.
- [x] Clause (a): no identity-canon duplicates existed to repoint; Profile Shapes kept (current-state
      impl, not canon) + a scope note added so it isn't conflated with the target canon.
- [x] Repo-wide engineering rules intact (`routeAndCall()` rule, the test-gate rule, scoping rules,
      persona-unaware rule, persona-fossil guard — all untouched).
- [x] `ARCH-9` already absent; AGENTS.md needed no edit (divergence flagged, not fixed in J2).
- [x] Every new pointer resolves: `docs/registers/llm-models/master.md` exists; `MMT-ADR-0014` /
      `MMT-ADR-0018` exist on disk.
