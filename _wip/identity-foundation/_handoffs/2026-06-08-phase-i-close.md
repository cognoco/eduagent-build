# Handoff — Phase I closed (2026-06-08)

**State:** Phases **A–I complete.** Next: **Phase J** — split into **J0** (canon-shape scrub + domain-canon graduation) → **J1** (memory pointers) → **J2** (agent doctrine) → **J3** (docs-tree conformance). Tracker: `_wip/identity-foundation/ROADMAP.md`.

---

## ▶ SESSION CONTINUATION — START HERE

**Phase I executed on branch `identity-foundation-phase-i` — committed locally, NOT pushed/merged.** The architect runs a no-push-by-default discipline; the branch is ready for review → push → PR/merge when you choose.

**Read order to resume:**
1. `_wip/identity-foundation/ROADMAP.md` — status line + Phase I row (now ✅) + Phase J detail (J0–J3) + the newest decision-log entry (top).
2. This handoff.
3. The branch diff: `git log --oneline main..identity-foundation-phase-i` and `git diff main...identity-foundation-phase-i`.

**Branch commit lineage (on `identity-foundation-phase-i`, base `c9881193a`):**
- `0c16db774` — plan restructured into I-a/I-b/I-c sub-gates + J0–J3 handoff
- `8a97f8b80` — **I-a** legacy-anchor cleanup (`docs/architecture.md`)
- `aa8b9d7d2` — **I-b** `ARCH-N` dispositions + `MMT-ADR-0017` (docs)
- `aa5d4248c` — **I-b** code-comment citation migration (`apps/api/src/services/llm/*`)
- `7d7659d7d` — **I-c** canon-authorship governance hinge (docs)

**The immediate open decision (ask the architect):** push the branch + open a PR (and merge), or hold? Then: **start Phase J0, or pause?** (Default: plan J0 first — the canon-shape scrub plan already exists at `docs/plans/2026-06-08-identity-foundation-canon-shape-scrub.md`, authored by the scrub-steering session.)

## What Phase I produced

**I-a — legacy `architecture.md` anchor cleanup (scope-by-touching).** The 5 `[LEGACY-REVIEW]` conflicts H flagged are rewritten to agree with `## Identity Foundation`:
- NFR row + NFR-coverage row: "COPPA-adjacent / Ages 11-15 / profile isolation" → **13+ consent-capacity floor, sub-13 built-but-gated, three-axis age model, append-only consent log** (`MMT-ADR-0015`); coverage Status → "Defined — § Identity Foundation".
- Multi-tenancy bullet → **org/membership re-derived** (`MMT-ADR-0007/0010`).
- Authorization paragraph → **roles primitive `{admin, learner}` + Guardian/Mentor/Payer split** (`0007/0008/0015`); kept the correct Clerk-orgs-rejected rationale.
- Enums naming example: stale `consent_state` → `verification_type` (the row only illustrates *naming*).
- `[TRANSITIONAL]` banner marked the inline conflicts resolved; the carve-out's own stale `[LEGACY-REVIEW]` reference squared.
- **Left for Stream 2 (flagged, not fixed):** the adjacent legacy schema-file block (`profiles.ts # profiles, family_links, consent_states`).

**I-b — identity-domain `ARCH-N` dispositions.**
- `ARCH-9` (model routing) → **superseded** by `MMT-ADR-0014` (+ `0016` safety/judge); pinned model names noted as register data (`docs/registers/llm-models/`).
- `ARCH-8` (orchestrator) → **promoted to new `MMT-ADR-0017`** ("All LLM calls route through a single orchestrator `routeAndCall()`", reconstructed) — absorb-forward migrated its 4 code citations + stamped the register + added a lockstep canon cross-ref to the "No direct LLM API calls" enforcement rule.
- `ARCH-7` (scoped repo) → **stands**; note that the scope key migrates `profile_id` → `person_id` at the clean-cut baseline.
- Code-comment citation migration (5 sites in `services/llm/`) was **comment-only**; the `/commit` skill verified via `pnpm eval:llm` that all 366 LLM snapshots are unchanged.

**I-c — canon-authorship process (the governance hinge).**
- `docs/architecture.md` retitled "Architecture Decision Document" → **`# Architecture`** with an L1-canon "how this document works" preamble; frontmatter `status: complete` → `mid-refresh`.
- `docs/adr/README.md` gained a **"How canon is authored (ADR ↔ canon ↔ ARCH-N)"** operating section consolidating `MMT-ADR-0000` §I.2/§II.2–II.3/Part III into one procedure.
- **`MMT-ADR-0000` amended** with the **"no document is the sole system of record"** guard — the durable `0016`↔`0000` reconciliation (the divergence *instance* was already removed at the `0016` repurpose; this records the guard so it cannot recur).
- `docs/INDEX.md` bumped: `MMT-ADR-0000` +4 amendments; ADR range `0000`–`0017`.

## Verification (passed)

- `grep -c '<!-- \[LEGACY-REVIEW\]' docs/architecture.md` → 0 anchor comments (2 prose mentions remain by design: banner + carve-out).
- `rg "ARCH-8|ARCH-9" apps/api/src packages` → 0 (citations migrated).
- `rg "Architecture Decision Document" docs/` → 0; `rg "status: 'complete'" docs/architecture.md` → 0.
- `MMT-ADR-0017` exists with the 4 standard sections; register entries carry terminal dispositions.
- I-b code edits are comment-only (eval:llm snapshots unchanged); pre-commit handled per scope.

## Not Phase I — handed to Phase J (do not do these as "cleanup")

- **J0** — canon-shape scrub + graduate the 4 domain-canon docs `_wip/` → `docs/canon/`; the J(0) citation rewrite (`_wip/` → `docs/canon/` paths, flagged in the carve-out banner). Plan already drafted: `docs/plans/2026-06-08-identity-foundation-canon-shape-scrub.md`.
- **J1** — memory entries → provenance-cited pointers; cull unprovenanced orphans.
- **J2** — `CLAUDE.md`/`AGENTS.md` → pointer-layer; `docs/project_context.md` scrubbed of shadow identity/routing canon; A-vs-B terminology sweep; active-looking superseded routing doctrine (`ARCH-9`, Gemini-only / pinned Gemini Flash/Pro wording) repointed to `MMT-ADR-0014`, `MMT-ADR-0017`, and `docs/registers/llm-models/`; routing-noun glossary (`tutor`/`judge`/`rung`/`tier`/`flow`/`slot`).
- **J3** — `docs/` physical-tree conformance to `MMT-ADR-0000` §I.4.

## Watch-outs

- Branch is **local-only**; `main` (`c9881193a`) does not yet have Phase I. Push/merge is a pending decision.
- `architecture.md` is still loose at `docs/` root (drains to `docs/canon/` at J3) and still mid-refresh — only `## Identity Foundation` is new canon; the rest is legacy pending the Stream-2 rebuild (the `[TRANSITIONAL]` banner still stands; Stream 2 strips it).
- `MMT-ADR-0017` is a reconstructed promotion (LLM orchestrator), not identity canon — it is **not** a member of the identity-foundation canonical set; it rode this phase only because `ARCH-8` intersected the policy-engine/router surface.
