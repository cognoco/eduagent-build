# MMT-ADR-0019 — Cross-platform development: OS-agnostic by default

**Status:** Accepted · 2026-06-09 · **Class:** Engineering-system / process — governs the development environment and tooling, not the product runtime · **Scope:** all developer tooling — hooks, scripts, CI invocations, local-dev docs · **Deciders:** Architect (jjoerg) + Claude · **Supersedes:** the gate-spec assumption `A2` ("fleet is macOS (dev) + Linux (CI); Windows-specific workarounds are removed, not preserved") and its dependent `R2` in `docs/specs/2026-05-26-commit-pr-pipeline-gates.md`

## Context

Development on this repo happens across a **heterogeneous set of operating systems** — Windows (native), Windows under WSL, macOS, and Linux. CI runs on Linux. There is no single dev OS, and none of the OSes in active use is going away.

A prior spec assumption (`A2`) recorded the opposite — that dev was effectively macOS and Windows-specific accommodations were "dead weight" to be removed. Working from that premise, a batch of "de-Windows" cleanup items was created whose effect would have been to *remove* support for an OS that developers actively use, re-breaking their environment. The premise, not the items, was the defect: a load-bearing, contested assumption about supported platforms had no authoritative home, so it lived as one line in a spec and propagated wrongly. This ADR gives that decision a home and inverts the policy.

## Decision

- **OS-agnostic by default.** Developer tooling — git hooks, scripts, CI invocations, and local-dev docs — must work on every OS in active use (Windows native, WSL, macOS, Linux). When a tool can be written portably, it is written portably; that is the first choice, not a fallback.
- **Workarounds are accepted, not removed.** Where a portable form is genuinely impractical, an OS-specific accommodation is legitimate and is **kept**, not stripped. "It only matters on one OS" is never, by itself, a reason to delete it — that OS is in use.
- **Never assume a single dev OS, and never "remove support" for an OS in use.** Decisions about tooling start from the heterogeneous reality, not from whichever OS the author happens to run.
- **A workaround for a tool that is broken *on* one of our OSes is not cruft** — it is load-bearing for that platform. The correct response is to make the tool work there (or keep the accommodation until it can), never to remove the accommodation and call the platform unsupported.

### Disposition procedure (the 5-category test)

When a piece of OS-specific configuration is encountered, classify it and act:

| Category | What it is | Action |
|---|---|---|
| **1. Incidental non-portable** | hardcoded for one OS by accident of where it was authored (e.g. an absolute Windows tool path in a Linux CI job) | **make portable** |
| **2. Workaround imposed on all OSes** | an accommodation one OS needs, applied everywhere, mildly penalising the others | **OS-gate it** — each OS gets its correct path |
| **3. Workaround for a break *on* one OS** | the tool is broken on an OS in use; the accommodation keeps that OS working | **keep** — the fix is making that OS work, never removal |
| **4. OS-specific knowledge / docs** | a note or memory documenting an OS-specific quirk | **keep** — it serves the developers on that OS |
| **5. Already portable / dual-documented** | already handles every OS, or documents each explicitly | **leave** — it is already correct |

## Consequences

- Tooling choices are evaluated against every OS in active use; "works on my machine" is not the bar, and removing an OS's accommodation is a regression for the developers on it.
- The gate-spec's `A2`/`R2` "remove Windows workarounds" disposition is reversed: `--no-verify`-style escapes that exist because a tool is broken on an OS in use are **retained** until the underlying tool is fixed, and OS-specific hook behaviour is **gated**, not deleted. The gate-spec carries the corrected disposition inline, pointing here for the rationale.
- This is an **engineering-system / process** decision. It has no clean home in the product-canon split (`architecture.md` / `PRD.md` / `ux-design-specification.md`), which is precisely the gap that motivates introducing an explicit *subject-plane* facet on ADRs (tracked separately). For now its standing rule is recorded in `docs/project_context.md` and the gate-spec points here.

## Alternatives considered

1. **Drop support for an OS to simplify the harness ("remove, not preserve").** Rejected — it regresses the environment for developers actively on that OS; harness simplicity does not outrank a working dev environment for the team.
2. **Leave the policy implicit (no ADR), fix items case-by-case.** Rejected — implicitness is exactly what caused the failure: a contested, broadly-consequential premise drifted because it had no authoritative home. Per-item adjudication re-litigates the same question every time and invites the next wrong batch.
