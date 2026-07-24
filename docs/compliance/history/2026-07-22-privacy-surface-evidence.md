# Privacy-surface engineering evidence — 2026-07-22

**Purpose:** Engineering evidence for DPO review of the adult privacy notice, child-readable summary, provider inventory, and transparency controls. This is not legal approval and does not replace provider contracts, transfer assessments, or management's DPIA decision.

**Snapshot:** `9a4ae7c` — `origin/main` repository snapshot inspected on 2026-07-22; production configuration was checked through Doppler without printing secret values.

## Status legend

- **Verified:** supported by current code and, where stated, a production configuration check.
- **Configuration-dependent:** behavior exists in code but requires a deployed setting or provider-account configuration.
- **Contract-dependent:** code cannot prove the provider's contractual or operational treatment.
- **Legal decision required:** the controller, DPO, or counsel must decide or supply the evidence.
- **Human review required:** draft copy or translation needs semantic/legal review before publication.

## Public-notice claim matrix

| Claim or disclosure | Status | Engineering evidence | Required close artifact / owner |
|---|---|---|---|
| Controller is ZWIZZLY AS, Norwegian organisation number 811 696 072, Fiskekroken 3B, 0139 Oslo | Legal decision required | Repository compliance artifacts consistently name ZWIZZLY AS; code does not prove corporate registration. | Brønnøysund extract and DPO confirmation — controller. |
| Minimum age is 13 | Verified | `packages/schemas/src/age.ts:10`; exact-date checks in `apps/api/src/services/identity-v2/child-profile-v2.ts:135-166`. | Retain tests and keep store declarations aligned — engineering/store owner. |
| Account data includes email, display name, date of birth, language, and pronouns | Verified | Identity schema and services persist these fields; birth-date use is visible at `apps/api/src/services/identity-v2/consent-v2.ts:425-447`. | Confirm store disclosure categories — store owner. |
| Voice input is converted to text without MentoMate receiving or retaining audio | Verified | The mobile hook wraps on-device speech recognition (`apps/mobile/src/hooks/use-speech-recognition.ts:97-100`) and submits the returned transcript (`:145-178`, `:234-254`); no API audio-upload route was found. | Re-check if a server-side speech provider is ever introduced — engineering. |
| Homework images are used only when selected and are not stored by MentoMate | Verified, with provider egress | `/ocr` reads the request `File` into an in-memory buffer and sends it to the tier-selected vision provider (`apps/api/src/routes/homework.ts:107-162`); no database/object-store write occurs in the route. | Provider contracts must cover image processing and deletion — legal/vendor owner. |
| Adaptive learning profiling is present and has no legal or similarly significant effect | Verified for product use; legal characterization requires confirmation | The persistent learning model is described in `docs/compliance/ropa.md:45`; the DPIA records the Article 22 analysis at `docs/compliance/dpia.md:86`. | DPO confirms Article 13/22 wording — DPO. |
| Minors' names and account identifiers are excluded from AI prompts | Verified | Construction-site gate: `apps/api/src/services/session/session-exchange.ts:2241-2249`; provider-egress guard: `apps/api/src/services/exchange-prompts.ts:763-775`. | Preserve both tests/guards — engineering. |
| An adult owner's display name may be sent to an AI provider | Verified and now disclosed | Same two gates permit a sanitized name only for an unambiguously adult owner. | DPO accepts disclosure wording — DPO. |
| AI providers do not use customer content to train general-purpose models | Contract-dependent | Application code does not control downstream training. | Executed DPA/terms and account-setting evidence for every active provider — controller/vendor owner. |
| International transfers use appropriate safeguards | Contract-dependent | Runtime currently uses a global serving-region placeholder (`apps/api/src/services/llm/router.ts:702-707`); region-aware primary substitution is not built. | SCCs/UK Addendum or adequacy evidence plus TIAs for each non-EEA/UK route — controller/DPO. |
| Chat transcripts are automatically deleted 30 days after summary generation | Verified and configuration-dependent | Daily purge is gated by `RETENTION_PURGE_ENABLED` (`apps/api/src/inngest/functions/transcript-purge-cron.ts:24-40`) and selects summaries 30 days after `summaryGeneratedAt` (`:41-55`). Production check on 2026-07-22 returned enabled. Delayed/incomplete summaries are detected from day 37 (`:65-107`). | Preserve production flag evidence and monitor delayed-purge alerts — engineering/operations. |
| Learning memory persists while the account is active and may contain short quotations | Verified; dormancy retention remains open | `docs/compliance/ropa.md:45` enumerates summaries, memory facts, notes, mastery, and challenge-round quotes. No general dormancy sweep currently proves deletion after inactivity. | DPO-approved dormancy period and implemented sweep if required — DPO/engineering. |
| Account deletion has a cancellable seven-day grace period | Verified | `apps/api/src/services/identity-v2/deletion-v2.ts:104-105`; Inngest sleep at `apps/api/src/inngest/functions/account-deletion.ts:95-96`. | Preserve deletion integration evidence — engineering. |
| Limited consent/financial records may survive deletion | Verified and now disclosed | Consent grants are re-homed to `consent_receipt` (`apps/api/src/services/identity-v2/deletion-v2.ts:490-505`); financial records are retained at `:1063-1069`. | Counsel sets purposes and periods for retained records — counsel/DPO. |
| Consent withdrawal has seven-day restore, delete, or optional 30-day archive behavior | Verified | `apps/api/src/inngest/functions/consent-revocation.ts:42-50`, decision at `:224-260`, archive cleanup scheduling at `:264-345`; `archive-cleanup.ts:9-63`. | DPO confirms best-interests and retention-policy wording — DPO. |
| Access, export, erasure, and consent withdrawal are available | Partially verified | Owner export: `apps/api/src/routes/account.ts:291-304`; deletion: `:157-170`; consent withdrawal is implemented in the identity-v2 consent services. Rectification is not complete for all learning and identity fields. | Do not imply every datum is self-service-correctable; DPO defines DSAR support procedure — DPO/operations. |
| Learners are told at the interaction point that they are speaking with AI | Verified | `apps/mobile/src/components/session/ChatShell.tsx:910-928` renders and exposes the localized `"You're talking to an AI mentor"` label; test at `ChatShell.test.tsx:249-252`. | Include in final transparency evidence pack — engineering. |
| Privacy notice translations are publication-ready | Human review required | Automated translation generated complete locale key sets for `de`, `es`, `ja`, `nb`, `pl`, and `pt`. | Native-speaker legal/semantic review for each locale — controller. |
| Named DPO contact and UK representative are correct | Legal decision required | No publishable DPO details or final UK-representative decision exist in the repository. | Supply confirmed details and amend all surfaces — controller/DPO. |
| Guardian visibility is proportionate and child-readable | Legal decision required | Product visibility exists, but the DPO requested a documented best-interests assessment and exact scope. This change does not silently rule that policy. | Best-interests assessment and approved field-level disclosure — controller/DPO/product. |

## Production provider/model inventory

Production checks on 2026-07-22 returned `LLM_ROUTING_V2_ENABLED=true`, `CHALLENGE_ROUND_GRADER_ENABLED=true`, and present keys for Cerebras, Mistral, OpenAI, Anthropic, and Voyage. Key values were not printed.

| Processing role | Model/provider | Current region fact | May receive minors' data? | Data class | Evidence state |
|---|---|---|---|---|---|
| Default text and asynchronous deep jobs | `gpt-oss-120b` via Cerebras | US; current primary for all regions because regional substitution is not built | Yes | Prompt, recent session context, learning context, generated output | Runtime verified; DPA, ZDR/no-training, SCCs and TIA required. |
| Free fallback and free vision/OCR | `mistral-small-2603` via Mistral | EU per model register | Yes | Text prompt/context or selected homework image | Runtime path verified; DPA, retention, training and subprocessor evidence required. |
| Paid fallback and paid vision/OCR | `gpt-5-mini` via OpenAI | Intended EU-residency configuration; code calls the standard OpenAI API endpoint, so residency is account/configuration evidence | Yes | Text prompt/context or selected homework image | Runtime path verified; OpenAI project/tier, ZDR, DPA and residency evidence required. |
| Plus/Pro deep reasoning, rungs 4–5 | `gpt-5.4` via OpenAI | Same account/configuration dependency | Yes, for eligible 13+ paid learners | Prompt, recent session context, learning context, generated output | Runtime path verified; same OpenAI evidence required. |
| Challenge and suitability judge | `claude-sonnet-4-6` via Anthropic | Provider location/transfer mechanism not established by code | Yes | Tutor output and evaluation context required by the judge | Runtime and production flag verified; DPA, retention, training, deletion and transfer evidence required. |
| Persistent-memory embeddings | `voyage-3.5` via Voyage AI | API endpoint is `api.voyageai.com`; serving/processing location not established by code | Yes | Text selected for embedding; returned 1,024-dimension vector | Code/key presence verified; DPA, retention, training, deletion, subprocessors and transfer evidence required. |

Router source: `apps/api/src/services/llm/router.ts:626-806`, fallbacks at `:1084-1180`; embeddings: `apps/api/src/services/embeddings.ts:73-81`, `:111-126`. The model register's active-set summary is `docs/registers/llm-models/master.md:27-75`.

## Immediate external evidence request

For each active provider above, collect: executed DPA and acceptance record; contracting entity and account tier; incorporated security annexes; subprocessors; hosting/processing locations; retention and deletion; training/service-improvement restrictions; special privacy/ZDR settings; incident-notification terms; data-subject-rights support; and SCC/UK Addendum/adequacy plus TIA where applicable.

Before publication, also supply the DPO's publishable contact details, rule on the UK representative, approve guardian visibility, and obtain native/legal review of the six generated translations.
