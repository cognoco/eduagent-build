# This copy is downstream — canonical home is Nexus root

**As of 2026-07-03 (WI-1199), the canonical home of the Quartet _framework_ (this
directory's `README.md`, `roles/`, `library/`, `glossary.md`, `planning-rules.md`,
`dependencies.md`) is the Nexus repo root:**
`https://github.com/cognoco/nexus/tree/main/_quartet`

This eduagent-build copy is **downstream** of that source, not canonical. It is
**not** being deleted and eduagent-build's own Cosmo lane execution here is **not**
stopping — this marker only changes where the *framework* (Brain + Library) is
authored and versioned going forward. `working/README.md` (this repo) already
documented that lane working-state stays in its operational home "until the
cutover relocates them"; that relocation is a separate, future, deliberate step —
this marker does not trigger it.

Framework changes (protocol/role docs, library shapes) should be made at the
Nexus root and pulled down here, not edited independently in this copy — to
avoid the two copies drifting.

## Lane-only content triage (WI-1199 AC)

Nine lanes exist only in this eduagent-build copy, not at Nexus root
(`working/lanes/`). Read each `execution-tracker.md` header; none contain
reusable framework (Brain/Library) material — all are eduagent-build/MentoMate
**application workstream execution records** (Cosmo Project=MentoMate lanes).
Decision: **retained here, not ported** — their proper home is this repo's own
execution history, and several are already graduated/closed.

| Lane | Status (per its execution-tracker) |
|---|---|
| `agent-instructions` | GRADUATED 2026-06-14 — all 6 WIs Closed/Done |
| `security-pii-api` | GRADUATED/CLOSED 2026-06-30 — 27 findings remediated |
| `flow-remediation` | WI-822 closed; WI-818 finalizing (2026-06-19 operator ruling) |
| `new-llm-integration` | ACTIVATED 2026-06-12 (strategy O2) |
| `adr-governance-correction` | PRG-charter execution tracker (active) |
| `architecture` | PRG-11 execution tracker (active) |
| `errors-api` | PRG-15 execution tracker (active) |
| `l10n-a11y` | PRG-12 execution tracker (active) |
| `security-pii-inngest` | PRG-13 execution tracker (active) |

None abandoned — several are live or recently-closed project work; simply not
framework scaffolding, so not duplicated at the Nexus root canonical copy.
