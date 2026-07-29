# DPO Interim Advice — Indexed Action Register Tracker

> Tracks ZWIZZLY AS's response to Stephan Hartmann's Interim DPIA Advice Record (26 Jul 2026, v1.0).
> Format per Stephan's request: action → responsible → evidence doc → expected completion.
> Status values: `not-started` · `partial-exists` · `drafting` · `blocked` · `sent-to-DPO` · `closed-by-DPO`.
> Only Stephan closes items; `sent-to-DPO` is our terminal state.

## Blocking prerequisites (do first)

| # | Item | Owner | Status | Notes |
|---|------|-------|--------|-------|
| P1 | Create `dpo@zwizzly.com`, confidential direct forward to Stephan, test; do NOT publish or register yet | Zuzana (domain admin) | blocked | Confirmation + config question (forwarding vs mailbox) sent to Stephan 2026-07-26; create once he answers. Gate for formal appointment effective date |
| P2 | Migrate OpenAI API org from personal account to ZWIZZLY AS org | Zuzana | not-started | Pre-existing pre-launch item; now blocks Action 7 — all org/project config evidence must come from the ZWIZZLY org |
| P3 | Review + sign External DPO Services Agreement + Formal Designation | Zuzana (chair, sole signatory needed) | blocked | Scope amendment (EEA/Norwegian advisory scope) proposed to Stephan 2026-07-26 (perimeter email, Q2); sign once he accepts/adjusts it. Effective date also gated on P1 mailbox |
| P4 | Rule launch-perimeter conflict | Zuzana | **RULED 2026-07-26** | Screen-based allowlist: EEA threshold-13 (Route 1) + non-EEA via documented screen (Route 2); US = first Route 2 pass (pending DPO concurrence); UK/PL/CH out at launch as expansion candidates. See `docs/compliance/2026-07-26-launch-perimeter-ruling-screen-based-allowlist.md` + `2026-07-26-us-launch-screen-record.md`. M3 response text + DPO-agreement scope amendment drafted in the ruling doc |

## Stephan's action register (his numbering)

| # | Required action | Owner | Existing artifact(s) | Gap | Status | ECD |
|---|-----------------|-------|----------------------|-----|--------|-----|
| 1 | Confirm/revise M1–M7 | Zuzana | Facts known for M1, M2, M4–M7; M3 gated on P4 | Enter responses into the Advice Record; leave acknowledgement unsigned | drafting | |
| 2 | Main-establishment + supervisory-authority memo | Zuzana + agent draft | `evidence/2026-07-26-main-establishment-memo-draft.md` — facts confirmed by management, sent to Stephan 2026-07-26 | Formal signature on final version when Stephan confirms content | sent-to-DPO | |
| 3 | Launch countries, Art 8 sources, residence logic, age controls | Agent draft → Zuzana | `2026-07-23-13-plus-eea-launch-country-ruling.md` (country register w/ sources ≈ done) | Re-verification procedure, residence-determination design, age-assurance design, technical blocking evidence | partial-exists | |
| 4 | Purpose-level legal-basis + consent design | Agent draft → Zuzana | `dpia.md`, `edpb_dpia_filled_2026_v1.md`, `ropa.md`, onboarding consent screens in app | Purpose×basis×recipient×retention matrix; LIAs; consent log spec; screen inventory | partial-exists | |
| 5 | Incidental Art 9 + safeguarding | Zuzana + agent | `art9-special-category-position.md` (thin) | Art 9(2) condition determination; suppression/memory-exclusion proof; crisis/escalation procedure | partial-exists | |
| 6 | Category-specific retention schedule | Agent draft → tech validation | `2026-07-17-consent-withdrawal-bearer-token-threat-posture.md`; archive-first delete design | Full category schedule (raw/derived/embeddings/consent evidence/logs/backups/provider copies); deletion-propagation test evidence | partial-exists | |
| 7 | OpenAI config/security/deletion/transfer evidence | Zuzana (config) + agent (pack) | Signed DPA (sent) | **Blocked on P2.** Then: org/project screenshots (ZDR or MAM, training off, EU region, endpoints/models), TOMs, subprocessor snapshot, TIA | blocked | |
| 8 | Mistral contractual/security/transfer/data-category evidence | Agent gather → Zuzana | Privacy-settings screenshot (sent); DPA/evidence request emailed to Mistral 2026-07-26 (incl. special-categories mismatch + feedback-route asks) | Await response (14-day ask); assemble pack from reply | drafting | |
| 9 | Anthropic, Cerebras, Voyage AI provider packs | Agent gather → Zuzana | DPA/evidence request emailed to Anthropic + Voyage AI 2026-07-26; Cerebras follow-up (incl. concrete TIA inputs B1–B7) sent to A. Mikoyan 2026-07-26 (`evidence/2026-07-26-cerebras-dpa-followup-email.md`) | Await responses; Cerebras call to schedule; assemble packs from replies | drafting | |
| 10 | Recipient matrix (Clerk, RevenueCat, Apple, Google, Resend, Sentry, Inngest, Neon, Cloudflare, Expo, APNs, FCM) reconciled with RoPA | Agent draft | `ropa.md`, `identity-compliance-register.md` | Role determination + DPA reference + data categories per recipient; reconcile RoPA | partial-exists | |
| 11 | Rights + authority-verification workflows, tested | Agent draft → product | Export/delete implemented in-app (`more/privacy.tsx` flows) | Documented workflows for all rights; guardian/former-guardian/representative authority rules; test cases; templates | partial-exists | |
| 12 | Guardian visibility + safeguarding controls | Agent draft → Zuzana | Supporter-surface spec + ADR-0037 (merged); recap-only guardian model in nav contract | Visibility matrix w/ legal basis per element; best-interests assessment; escalation procedure | partial-exists | |
| 13 | Transparency package + Art 35(9) comprehension testing | Zuzana + agent | `privacy-policy.html`, `child-readable-privacy-summary-draft.md` | Layered child notice final; interface text inventory; AI-disclosure copy; testing protocol + results | partial-exists | |
| 14 | Consolidated revised DPIA + evidence package | Zuzana | `dpia.md`, `edpb_dpia_filled_2026_v1.md` | Final version-controlled package after 1–13 | not-started | |
| 15 | Formal DPO opinion (incl. Art 36 determination) | Stephan | — | After appointment + final package | — | |

## Interim operating conditions (accepted constraints, track as launch gates)

- No public processing of learner data on the basis of the interim record. *(Compliant: zero users, pre-launch.)*
- No unreviewed provider/model/endpoint/feedback route receives production learner data → production allow-list needed (part of Action 7–10).
- Training/data-sharing settings stay disabled for production content.
- **Persistent memory + profiling stay disabled until legal basis/controls/transparency/retention approved** — this gates the core "knows-me" feature at launch; closing A3/A4/A6 is the unlock.
- Material changes to product, countries, age model, providers, data categories or safeguarding → DPIA review trigger.

## Correspondence log

| Date | Direction | Content |
|------|-----------|---------|
| 2026-07-24 | → Stephan | Revised DPIA-review response, company certificate, signed OpenAI DPA, Mistral screenshot |
| 2026-07-26 | ← Stephan | Interim DPIA Advice Record v1.0, Interim Provider Review, draft DPO Services Agreement, draft Formal Designation; requests dpo@ mailbox confirmation + amendment feedback |
| 2026-07-26 | → Anthropic, Mistral, Voyage AI | DPA + Article 28 evidence request (9 items; Mistral +2: special-categories mismatch, feedback route); 14-day response window → follow up ~2026-08-09 |
| 2026-07-26 | → Cerebras (A. Mikoyan) | Follow-up email: A1–A6 processor evidence + B1–B7 concrete TIA inputs (SCC/DPF, locations, FISA 702 exposure, gov-access policy, encryption, onward transfers); call to be scheduled |
| 2026-07-26 | → Stephan | Confirmed dpo@zwizzly.com can be created; asked his preference: forwarding-only vs dedicated M365 mailbox (send-as capability named as the difference); drafts feedback to follow separately |
| 2026-07-26 | → Stephan | Perimeter package sent: launch-perimeter ruling + US screen record + 07-23 EEA register attached; proposed M3 response text; Q1 = concurrence on Norwegian threshold-13 Art 8 reading for non-EEA minors (US screen conditional on it); Q2 = DPO-agreement scope amendment (EEA/Norwegian law advisory scope) — with which we're ready to sign both appointment docs; disclosed open US item (App Store Accountability Acts / WI-1116) |
| 2026-07-26 | → Stephan | EU AI Act classification review request sent (`2026-07-24-eu-ai-act-classification-review-request.docx` — 3 written questions on Annex III point 3 family-only classification; specialist-referral escape hatch included). Maps to OPQ-111 |
| 2026-07-26 | → Stephan | Main-establishment + supervisory-authority memo sent (`evidence/2026-07-26-main-establishment-memo-draft.md` — Oslo = main establishment, Datatilsynet = lead SA). Closes drafting of action 2 |
