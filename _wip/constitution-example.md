---
Created: 2025-10-16T20:18
Modified: 2025-10-28T10:03
---
# Study Buddy Constitution

<!--
Sync Impact Report
Version change: 1.0.1 -> 1.0.2
Modified principles:
- Reformatted existing principles into template structure (no semantic changes)
Added sections:
- Change Scope & Architecture Standards (template Section 2)
- Study Buddy Mandates (template Section 3)
Removed sections:
- None
Templates requiring updates:
- Reviewed .specify/templates/plan-template.md (no changes needed)
- Reviewed .specify/templates/spec-template.md (no changes needed)
- Reviewed .specify/templates/tasks-template.md (no changes needed)
Follow-up TODOs:
- None
-->

## Core Principles

### I. Test-Driven Development (TDD)
- Begin every code change by writing failing tests that express the desired behaviour before implementation starts.
- Maintain the Red -> Green -> Refactor loop with visible failure evidence captured ahead of production code.
- Scope tests to user-facing requirements, covering contracts, integration paths, and critical unit logic tied to acceptance criteria.
- Follow the strict sequence: write failing tests -> implement the minimal code to pass -> run quality gates -> verify against requirements -> declare completion.

### II. Quality Gates (NON-NEGOTIABLE)
- Run the full quality-gates suite before any commit or pull request and attach the command outputs to delivery notes.
- The suite must at minimum cover lint, formatting verification, type checking, unit coverage, integration flows, and E2E smoke tests using project thresholds.
- Bypassing, deferring, or silently retrying failed gates is prohibited; surface blockers immediately for remediation.

### III. Evidence-Based Completion (NON-NEGOTIABLE)
- Produce verification notes that document executed commands, success and failure scenarios, and the resulting outputs.
- Use factual language only, highlight residual risks when full verification is impossible, and escalate unresolved gates immediately.
- Attempt at least four remediation cycles (identify blocker -> attempt fix -> rerun gates -> re-verify) before declaring failure, then report outstanding blockers.
- ADMIT FAILURE RATHER THAN PREMATURELY CLAIMING SUCCESS; never claim 100% certainty without comprehensive verification!

### IV. Documentation Alignment & Completion Outlines
- Completion reports must list each documentation asset requiring updates and outline the specific edits needed.
- Do not modify documentation unless explicitly tasked; instead, provide actionable guidance referencing product docs, architecture artifacts, plans, tasks, agent guides, and Spec Kit outputs.
- Include documentation outlines in final status updates so reviewers can trigger follow-up work without rediscovery.

## Change Scope & Architecture Standards

### Scope of Application
- **Code changes** trigger TDD, quality gates, and evidence protocols, and include runtime-impacting source files, configuration, dependency updates, build settings, test suites, and schema changes.
- **Non-code changes** require content verification only and include documentation, comment-only updates, Spec Kit artifacts, agent guidance files, and architectural decision records.
- **Hybrid changes** follow code-change protocols whenever code and documentation modifications are intertwined.

### V. SAFe Architectural Runway Stewardship
- Provide just enough architectural groundwork to unlock upcoming committed features while avoiding speculative over-engineering.
- Capture current implementation, documented extension points, and intended evolution paths inside shared architecture artifacts and ADRs.
- Route major architectural shifts through the ADR process and update shared documentation promptly.

### VI. Interface-Ready Libraries (NON-NEGOTIABLE)
- Start every feature as a standalone library that is independently testable, documented, and backed by clear purpose statements.
- Expose each library via a CLI that supports stdin/args input, stdout/stderr output, `--help`, `--version`, and `--format` options, and both JSON and human-readable formats.

### VII. Layered Modularity & Domain Boundaries (NON-NEGOTIABLE)
- Preserve separation between presentation, feature, service, and configuration layers to support incremental scaling.
- Design domain modules to be independently testable, versioned, and publishable as needed, with shared utilities centralized instead of duplicated.

### VIII. API-First & Integration Readiness (NON-NEGOTIABLE)
- Define internal and external interfaces before implementation to avoid monolithic coupling and guarantee discoverable entry points.
- Maintain contract definitions (OpenAPI, GraphQL schemas, or equivalent) with usage guidance, guard each touchpoint with contract tests, and track changes for backwards compatibility.
- Ensure libraries expose functionality through those contracts rather than tight coupling to application code, and document integration touchpoints in the contracts directory.

## Coding Standards & Maintainability

### IX. Versioning Standards
- Apply the MAJOR.MINOR.BUILD format to every library: increment BUILD for all changes, MINOR for backwards-compatible additions, and MAJOR for breaking changes.

### X. Lean Files & Cohesive Modules
- Keep files <=300 logical lines, prefer composition over inheritance, and rely on path aliases instead of deep relative imports.
- Co-locate feature logic for discoverability and justify any deviations from lean layering.

### XI. Business-Accessible Code Communication
- Write self-documenting code so product managers can trace business logic without reverse-engineering internals.
- Add explanatory comments describing business purpose and trade-offs, and update human-readable narratives or inline READMEs when behaviour changes.


### XII. Continuous Knowledge Capture
- Maintain Spec Kit artifacts (specs, plans, research, quickstarts, tasks) as the living knowledge base for each feature.
- Link runtime guides (e.g., CLAUDE.md, AGENTS.md) to new technologies or patterns introduced in plan.md outputs.
- Ensure feature folders include quickstart instructions and troubleshooting notes derived from testing outcomes.

## Project-Specific Mandates — Study Buddy (Expo Mobile)

### XIII. Platform & Experience Priorities
- Validate Android flows first; add iOS parity after Android smoke tests pass.
- Deliver a local-first experience that operates without network connectivity and gracefully degrades when optional services (RevenueCat, Sentry, etc.) are offline.
- Follow `docs/03-UI_UX spec.md` for accessibility targets, flows, and testing identifiers.

### XIV. Tech Stack Non-Negotiables
- Use Expo SDK 54 as the managed runtime baseline per `package.json` and `docs/tech-stack.md`.
- Adhere to package versions specified in `package.json` for managed dependencies and `docs/tech-stack.md` for pinned non-managed packages.
- Seek explicit user approval for all version changes and flag conflicts or upgrade needs instead of applying them autonomously.

### XV. Configuration-Driven Architecture
- Express feature toggles, age templates, and mode overlays as versioned JSON assets backed by documented schemas.
- Pair new configuration surfaces with automated validation and quickstart guidance within the feature documentation set.

### XVI. Quality Gates Implementation
- Invoke the project quality-gates script defined in `package.json`, ensuring lint, format checks, type checking, managed-version validation, unit suites, and E2E smoke tests all pass locally before submission.
- Maintain >=80% coverage across lines, functions, branches, and statements, or secure explicit approval alongside remediation tasks.
- Keep pre-commit hooks enabled unless you receive EXPLICIT user instructions or approval to bypass.

## Governance

### XVII. Constitution Change Control
- Update `.specify/memory/constitution.md` and validate templates and prompts whenever amendments are made.
- Run a representative `/specify -> /plan -> /tasks` cycle after amendments to confirm the new rules propagate without contradiction.
- Track version, ratification, and amendment dates, and reflect changes across dependent templates.

### XVIII. Adoption & Compliance Oversight
- Reviewers enforce this constitution during code review, verifying TDD evidence, quality gate outputs, and documentation outlines, and escalate violations through corrective tasks and training updates.
- Capture friction or recurring issues in retrospectives and agent guidance files to inform future amendments and ADRs.

**Version**: 1.0.3 | **Ratified**: 17.09.2025 | **Last Amended**: 17.09.2025
