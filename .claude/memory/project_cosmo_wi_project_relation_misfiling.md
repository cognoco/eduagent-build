---
name: cosmo-wi-project-relation-misfiling
description: Cosmo WIs about eduagent-build are sometimes captured under the Nexus project; the execute repo guard catches it — fix the Project relation to MentoMate, don't run from the wrong repo.
type: project
created: 2026-06-10
last_confirmed: 2026-06-10
status: active
---

`/cosmo:execute fetch` enforces a repo guard: the WI's Project `Repo` must match the origin remote. WIs about this repo captured from a Nexus-context session inherit the **Nexus** project (repo `cognoco/nexus`) and fail the guard here (seen: WI-556, and closed WI-452 still carries it). Fix = repoint the WI's `Project` relation to **MentoMate** (`3658bce9-1f7c-8128-9f9b-fa7fcf75a13b`, repo `cognoco/eduagent-build`) + leave an audit comment; never bypass by running from the wrong repo. Incidental items created via `execute.ts create` inherit the (corrected) parent project automatically.
