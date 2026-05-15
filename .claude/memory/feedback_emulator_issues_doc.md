---
name: Emulator issues doc superseded by runbook
description: The old e2e-emulator-issues.md (2,358 lines) was vaulted 2026-04-30. The runbook at docs/E2Edocs/e2e-runbook.md is the authority. See [[E2E and emulator work — read the runbook first]].
type: feedback
---

The original `docs/E2Edocs/e2e-emulator-issues.md` was a sprawling 2,358-line
doc with accumulated and often contradictory rules. It was vaulted on 2026-04-30
to `docs/_vault/emulator-2026-04-30/E2Edocs/e2e-emulator-issues.md`.

**Why:** Many rules in the old doc were empirically disproven (BUG-7 proxy,
adb reverse, Bluetooth disable, Doppler for Metro). The runbook
(`docs/E2Edocs/e2e-runbook.md`) replaced it with verified-only content.

**How to apply:** Read `docs/E2Edocs/e2e-runbook.md` for current operational
guidance. The vault copy is for archaeology only — never treat it as authority.
