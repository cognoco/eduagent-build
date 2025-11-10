# Canonical Documentation Index

Use this index to locate the authoritative governance artefacts that drive ZDX Cogno and downstream implementation. Consult the relevant document **before** drafting or updating memories, plans, or specifications.

## Current Canonical Artefacts

- `P1-plan.md` – Walking-skeleton implementation roadmap with stage goals, tasks, and success criteria.
- `architecture-decisions.md` – Authoritative ADR log with rationale and status for architecture choices.
- `tech-stack.md` – Pinning strategy, supported tooling, compatibility constraints, and upgrade process.
- `constitution.md` – Gold-standard principles (TDD, quality gates, governance alignment) that bind all work.
    - `.specify/memory/constitution.md` – Source file for the constitution (edit here; generated copies in tooling).
- `environment-setup.md` – Required workstation configuration, prerequisites, and bootstrap steps.
- `supabase-projects.md` – Source of truth for Supabase environments, credentials, and operational guidance.
- `poc-plan.md` – Historical proof-of-concept plan (kept for reference; verify relevance before reuse).
- `memories/` – ZDX Cogno operational memory (patterns, checklists, findings, troubleshooting). See `memories/README.md`.
- `guides/` – Supplemental how‑to material (agent playbooks, process guides); confirm alignment with canonical docs before use.
- `.ruler/AGENTS.md` *(source)* → `AGENTS.md` / `CLAUDE.md` *(generated)* – Agent operating procedures and policies.

## Using This Index

1. Identify the domain of your change (plan, architecture, tooling, process, environment, memory).
2. Open the corresponding artefact(s) above and note the relevant section.
3. When proposing new memories or plans, cite the document + section and explain how the change aligns with it.
4. If a new canonical artefact is added, append it here with owner/context details.

**Maintainer:** Architecture/Product leadership  
**Last updated:** <!-- Update this timestamp when making semantic changes -->

