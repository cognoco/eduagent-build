# Goal Spike — Cross-Agent Idea Analysis

Source: [`goal-spike.md`](goal-spike.md) — five agent/model combinations each proposed ranked ideas for a `/goal` showcase.

## Agent Key

| Code | Agent | Model |
|------|-------|-------|
| **HQ** | Hermes | Qwen 3.6-plus |
| **HG** | Hermes | GPT-5.5 |
| **CO** | Claude Code | Opus 4.6 |
| **PQ** | Pi | qwen3.6-max |
| **CX** | Codex | GPT-5.5 high |

## Cross-Reference Matrix

Each cell shows the rank the agent assigned (1 = top pick). `—` means the agent didn't propose it. Where two agents proposed essentially the same work under different names, they share a row. The **Notes** column flags ideas that are distinct but related enough to another row that they *could* be scoped together.

| # | Category | Idea | HQ | HG | CO | PQ | CX | Notes |
|---|----------|------|:--:|:--:|:--:|:--:|:--:|-------|
| 1 | Schema & Contracts | Response-schema enforcement across API routes | 1 | — | — | — | — | Could pair with #2 — both enforce shared-contract alignment across packages |
| 2 | Schema & Contracts | Contract drift detector (schemas ↔ routes ↔ mobile) | — | 3 | — | — | — | Could pair with #1 |
| 3 | Schema & Contracts | LLM Structured Envelope Migration | — | — | 6 | — | 2 | CO "EVAL-MIGRATION Envelope Cleanup"; CX "LLM Structured Envelope Completion" — same target |
| 4 | Quality Guardrails | Quality Ratchet v1 — executable cross-repo guardrails | — | 1 | — | — | — | Meta-ratchet — could subsume #1, #2, #5, #8 as sub-goals |
| 5 | Observability | Silent Recovery / Observability Ratchet | — | 2 | — | — | 3 | HG and CX proposed near-identical scope |
| 6 | Observability | Error resilience consistency pass | — | 6 | — | — | — | Related to #5 but focuses on UI/client error classification rather than backend telemetry |
| 7 | Testing | Internal mock cleanup / test boundary integrity | — | 4 | 4 | — | 1 | Three agents converged: HG "test harness unification", CO "P1 Internal Mock Cleanup", CX "Cross-Repo Test Boundary Integrity" |
| 8 | Testing | Mobile Screen Harness + UI Contract Hardening | — | — | — | — | 4 | Harness-building half overlaps #7; UI contract hardening is distinct |
| 9 | Type Safety | TypeScript strict-mode error remediation | — | 5 | — | 2 | — | HG "API test type-safety closure"; PQ "C6 P3b–P3e" — both drive TS error count → 0 |
| 10 | Type Safety | Cross-Repo A11y + Type Safety Sweep | — | — | 1 | — | — | Type-safety half overlaps #9; the a11y/testID half is unique |
| 11 | Mobile | Expo Router navigation safety + token compliance | 2 | — | — | — | — | — |
| 12 | Inngest | Event orphan observer sweep | 3 | — | — | — | — | — |
| 13 | Migrations & DB | Migration hygiene (snapshots, timestamps, rollback docs) | 4 | — | — | — | — | — |
| 14 | Migrations & DB | Memory Architecture Upgrade Phase 1 | — | — | — | 1 | — | — |
| 15 | Refactoring | personaFromBirthYear() → AgeBracket migration (C4 P7) | — | — | — | 3 | — | — |
| 16 | Refactoring | Memory file dedupe (C8 P4) | — | — | — | 4* | — | — |
| 17 | Refactoring | EduAgent → MentoMate naming sweep | — | 8 | — | — | — | — |
| 18 | Refactoring | Library Book Screen Refactor (Pattern Y) | — | — | 5 | — | — | — |
| 19 | Feature Dev | Tiered billing / Family pools (FR108–FR117) | 5 | — | — | — | — | — |
| 20 | Feature Dev | Practice Activity Summary Service | — | — | 2 | — | — | — |
| 21 | Feature Dev | Parent Home Feature (11 Phases) | — | — | 3 | — | — | — |
| 22 | Feature Dev | Learning Product Evolution Slice 1 | — | 7 | — | — | — | — |
| 23 | Feature Dev | Homework Overhaul Phase B | — | — | — | — | 5 | — |
| 24 | Feature Dev | Bring-Your-Own Material v1 | — | — | — | — | 6 | — |

\* *Pi listed #16 as a "Wildcard #4" rather than a formal rank.*

## Convergence Summary

| Ideas | Agents | Combined Ranks | Theme |
|-------|--------|---------------|-------|
| **#7** | HG, CO, CX | 4, 4, 1 | Internal mock removal — strongest cross-agent signal |
| **#5** | HG, CX | 2, 3 | Silent recovery / observability ratchet |
| **#9** | HG, PQ | 5, 2 | TypeScript strict-mode remediation |
| **#3** | CO, CX | 6, 2 | LLM envelope migration |

## Observations

- **Internal mock cleanup (#7)** drew the strongest convergence: three agents independently flagged it, and Codex ranked it #1.
- **Silent recovery (#5)** was the most precisely duplicated — HG and CX described nearly identical scope.
- **Pi was the most divergent** — three of its four ideas (#14, #15, #16) appeared nowhere else.
- **Feature development ideas** had zero overlap — every feature proposal was unique to one agent.
- **HG (Hermes/GPT-5.5) proposed the broadest list** (8 ideas) and was the only agent to propose a meta-ratchet (#4) that could subsume several others.
- **24 distinct ideas** reduce to roughly **20 independent workstreams** if the four converged pairs are each treated as one.
