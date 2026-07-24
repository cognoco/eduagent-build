# WI-1655 Orion evidence matrix

V1 APK source commit: `9f5c556317a2300ed891920509d99bb5f60941cb`

Build contract:

- V1 APK: `EXPO_PUBLIC_E2E=true`, V0=true, V1=true, V2=false.
- V2 APK: `EXPO_PUBLIC_E2E=true`, V0=true, V1=true, V2=true.
- Each APK must be signature-verified, SHA-256 hashed, installed on
  `emulator-5554`, and shown non-debuggable.
- Every flow runs through `run-release-flow.ps1`, which records the scenario,
  exact commit/APK, flags, command, exit code, sanitized log, and screenshot
  paths.

| Variant | Scenario | Flow | Seed slot | Required screenshots | Status | Receipt |
| --- | --- | --- | --- | --- | --- | --- |
| V1 | `parent-with-children` | `flows/parent/parent-dashboard.yaml` | `native-03` | `parent-dashboard-complete` | PASS | `evidence/v1/20260723T062603Z-parent-dashboard-native-03/receipt.json` |
| V1 | `parent-multi-child` | `flows/parent/multi-child-dashboard.yaml` | `native-05` | `multi-child-01` through `multi-child-06` | PASS | `evidence/v1/20260723T072745Z-multi-child-dashboard-native-05/receipt.json` |
| V1 | `parent-with-children` | `flows/parent/consent-management.yaml` | `native-03` | `consent-mgmt-01` through `consent-mgmt-05` | PASS | `evidence/v1/20260723T074151Z-consent-management-native-03/receipt.json` |
| V1 | `learning-active` | `flows/quiz/quiz-quit-modal.yaml` | `native-01` | `quit-01` through `quit-05` | PASS | `evidence/v1/20260723T075141Z-quiz-quit-modal-native-01/receipt.json` |
| V1 | `homework-ready` | `flows/homework/gallery-picker.yaml` | `native-05` | `homework-gallery-01` through `homework-gallery-05`; indexed JPEG | PASS | `evidence/v1/20260723T081228Z-gallery-picker-native-05/receipt.json` |
| V1 | `child-quota-exceeded` | `flows/billing/child-in-chat-quota-exceeded.yaml` | `native-01` | `child-quota-exceeded-chat` | Pending; flow stays parked until PASS | |
| V2 | `v2-supporter-self-learning` | `flows/v2/v2-supporter-self-learning-cold.yaml` | `native-01` | `v2-supporter-self-learning-cold-01` through `-03` | Pending | |
| V2 | `v2-supporter-self-learning-active` | `flows/v2/v2-supporter-self-learning-doorway.yaml` | `native-01` | `v2-supporter-self-learning-active-01` through `-04` | Pending | |

Excluded debt — record separately; never count as a WI-1655 pass:

- WI-1408 resume-crash-recovery: blocked on a deterministic emulator cold-start
  prerequisite.
- Challenge Round: no executable Maestro flow and no seed scenario.

Prohibited:

- Physical-device interaction.
- Deploys or EAS Update.
- Production credentials.
