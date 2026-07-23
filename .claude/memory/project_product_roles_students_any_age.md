---
name: Product roles: students of any age
description: Use when reasoning about MentoMate audience, parent mode, learner mode, child profiles, or navigation IA.
type: project
---

Pointer (per the memory↔canon rule — cite canon, don't copy it). The audience / role /
login model this entry used to spell out is now ratified canon.

**Role, persona & login model (canon — read these):**
- `docs/canon/identity/ontology.md` — entities, roles, the age ⊥ role ⊥ consent axes.
- `docs/canon/identity/prd.md` Part 10 — "Personas" (students of any age — child or adult;
  parent-as-learner; the guardian-managed *charge*) + "Login mode & child-login provisioning"
  (a charge needs **no** linked account/login; login-presence ⊥ consent, `inv 4`).

**Navigation IA (NOT identity canon — different owner):** the parent→My-Learning path,
Family-Hub-default landing, and the "Viewing &lt;child&gt;" context-switch live in
`docs/compliance/audience-matrix.md` + the tab-set source of truth `apps/mobile/src/lib/navigation-contract.ts`.

**Durable agent caution (the reason this entry exists):** MentoMate is **not** a kids-only app —
do not flatten it into "a children's learning app with parent controls." Keep family-review and
active-studying surfaces conceptually distinct; preserve an easy parent→learning path; don't assume
a child learner has a linked account, or that learner accounts are adult-only/age-gated.
