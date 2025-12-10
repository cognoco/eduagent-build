# Canonical Documentation Index

Use this index to locate the authoritative artefacts that drive governance, architecture, and implementation. Consult the relevant document **before** drafting or updating specs, memories, or code.

---

## Document Hierarchy

```
┌─────────────────────────────────────────────────────────────┐
│                    TIER 1: GOVERNANCE                       │
│                                                             │
│  PRD.md         constitution.md         roadmap.md         │
│  (WHAT/WHY)     (Principles)            (Roadmap)          │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    TIER 2: ARCHITECTURE                     │
│                                                             │
│  architecture.md ◄────────► architecture-decisions.md      │
│  (HOW we build)             (WHY we decided)               │
│         │                                                   │
│         ▼                                                   │
│  tech-stack.md                                              │
│  (WHICH versions)                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    TIER 3: OPERATIONAL                      │
│                                                             │
│  docs/memories/          .ruler/AGENTS.md                  │
│  (Cogno patterns,        (Agent execution                  │
│   checklists,             rules)                           │
│   troubleshooting)                                          │
└─────────────────────────────────────────────────────────────┘
```

**Flow**: Strategic governance (Tier 1) constrains architectural decisions (Tier 2), which guide operational execution (Tier 3). Lower tiers MUST align with higher tiers.

---

## Document Scope Boundaries

| Document | Scope | Prescriptive? | Owner | Primary Audience |
|----------|-------|---------------|-------|------------------|
| **PRD.md** | WHAT features exist, WHY they matter | No (capability-level) | Product | All stakeholders |
| **constitution.md** | Non-negotiable principles | Yes | Architecture | All |
| **roadmap.md** | Implementation roadmap, phases | No (planning) | Product | Engineering |
| **architecture.md** | HOW system is built, patterns | Yes | Architecture | Agents, Developers |
| **architecture-decisions.md** | WHY decisions were made (ADRs) | Yes (rationale) | Architecture | Architects |
| **tech-stack.md** | WHICH versions, pinning rules | Yes | Engineering | Agents, Developers |
| **Cogno memories** | Operational patterns, troubleshooting | Yes | Engineering | Agents |
| **.ruler/AGENTS.md** | Agent execution rules | Yes | Engineering | Agents |

**Prescriptive** = Must be followed exactly. **Non-prescriptive** = Guides intent, implementation flexible.

---

## Document Artifacts

### Tier 1: Governance (Strategic)

| Artifact | Domain | Purpose & Role |
|----------|--------|----------------|
| `PRD.md` | Governance | **ANCHOR** - Master record for product vision, scope, success criteria, and functional requirements. All lower-tier content must align with PRD philosophy. |
| `constitution.md` | Governance | Non-negotiable principles (TDD, quality gates, memory rules) that bind all work, framework-agnostic. |
| `roadmap.md` | Delivery | Implementation roadmap (MVP, Task App PoC, Extensions) with stages, tasks, and validation gates. |

### Tier 2: Architecture (Tactical)

| Artifact | Domain | Purpose & Role |
|----------|--------|----------------|
| `architecture.md` | Architecture | BMAD-aligned architecture spec: principles, structure, decision summary, implementation patterns. Derived from PRD & Constitution. |
| `architecture-decisions.md` | Architecture | Detailed decision history (ADRs) with full rationale; `architecture.md` links here for WHY. |
| `tech-stack.md` | Tooling | Authoritative version inventory, pinning rules, compatibility matrix, upgrade policy. |
| `testing-strategy.md` *(planned)* | Quality | Testing strategy, coverage targets, tooling conventions. |
| `guides/implementation-guide/` *(embryo)* | Tooling | How-to playbooks (API, database, frontend, security) with code examples. Seeded with retry logic and library creation guides. |

### Tier 3: Operational

| Artifact | Domain | Purpose & Role |
|----------|--------|----------------|
| `docs/memories/` (Cogno) | Governance / Architecture | Pattern modules, checklists, tech findings, troubleshooting. Enforces standards and prevents drift. See `docs/memories/README.md`. |
| `.ruler/AGENTS.md` → `CLAUDE.md` | AgentOps | Agent operating procedures; references constitution + architecture. |
| `operations/` *(planned)* | Delivery | Runbooks for CI/CD, deployment flows, incident response. |

### Project Config (`docs/project-config/`)

> **Project-Specific**: These files contain configuration for THIS project. Replace when forking the template.

| Artifact | Domain | Purpose & Role |
|----------|--------|----------------|
| `supabase.md` | Tooling | Supabase project inventory, credentials, setup guide, troubleshooting. |

### Infrastructure (`docs/`)

| Artifact | Domain | Purpose & Role |
|----------|--------|----------------|
| `environment-strategy.md` | Infrastructure | Environment architecture, platform mapping, CI database strategy. |
| `environment-variables-matrix.md` | Infrastructure | Environment variable traceability across all platforms and environments. |

### Guides (`docs/guides/`)

| Artifact | Domain | Purpose & Role |
|----------|--------|----------------|
| `environment-setup.md` | Tooling | Environment variable configuration and workstation bootstrap. |
| `observability.md` | Operations | Sentry error tracking and performance monitoring setup, verification, and troubleshooting. |
| `server-deployment.md` | Delivery | Server deployment patterns, configuration, and validation. |
| `supabase-integration.md` | Tooling | Supabase setup, configuration, and integration patterns. |
| `testing-enhancements.md` | Quality | Optional testing library enhancements (jest-dom, MSW, user-event). |
| `validation-plan.md` | Quality | Validation strategies and verification checklists. |

### Tooling (`docs/tooling/`)

| Artifact | Domain | Purpose & Role |
|----------|--------|----------------|
| `serena-workflow.md` | AgentOps | Serena MCP integration, symbol navigation, and code exploration workflows. |

---

## Cross-Reference Guidelines

### By Task Type

| When you're... | Start with | Then consult | Finally check |
|----------------|------------|--------------|---------------|
| **Implementing features** | PRD.md (requirements) | architecture.md (patterns) | Cogno memories (details) |
| **Making tech decisions** | architecture-decisions.md | tech-stack.md | constitution.md (principles) |
| **Running Nx generators** | adopted-patterns/ | post-generation-checklist/ | - |
| **Debugging issues** | troubleshooting/ | tech-findings-log/ | - |
| **Setting up environment** | project-config/supabase.md | guides/environment-setup.md | - |
| **Updating documentation** | This index | Relevant tier document | Cogno cascade rules |

### Cascade Rules

When updating documents, changes flow DOWN the tiers:
1. **Tier 1 changes** → Review Tier 2 alignment → Update Tier 3 if needed
2. **Tier 2 changes** → Verify Tier 1 alignment → Update Tier 3 if needed
3. **Tier 3 changes** → Should NOT contradict Tier 1 or 2

---

## Cogno Memory Areas

Quick reference for operational documentation in `docs/memories/`:

| Area | Purpose | When to consult |
|------|---------|-----------------|
| `adopted-patterns/` | Monorepo standards that override framework defaults | Before `nx g` commands, when establishing patterns |
| `post-generation-checklist/` | Mandatory fixes after Nx generators | After ANY `nx g` command |
| `tech-findings-log/` | Technical decisions, constraints, empirical findings | Before changing configs, when troubleshooting |
| `troubleshooting/` | Common issues and solutions | When debugging build/test/runtime issues |
| `testing-reference/` | Jest configuration, testing patterns | Before modifying test infrastructure |
| `zdx-cogno-architecture.md` | Cogno system design and governance | When modifying memory system itself |
| `topics.md` | Keyword → memory area index | For quick discovery |

---

## Using This Index

1. **Identify your task's tier** (Governance/Architecture/Operational) using the hierarchy diagram.
2. **Read the governing document(s)** for that tier BEFORE making changes.
3. **Follow cross-reference guidelines** to navigate between related documents.
4. **When updating memories or specs**, cite the canonical source (document + section).
5. **Add new artefacts** to this index with tier/domain/purpose to keep the map current.

---

**Maintainer:** Architecture/Product leadership
**Last updated:** 2025-12-02
