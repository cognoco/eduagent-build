# OpenAI provider evidence

**ZWIZZLY AS holds TWO OpenAI organizations — different products, easily confused.** Both are
company-owned (owners: zuzana.kopecna@zwizzly.com, jorn.jorgensen@cognix.no):

| Product | Org ID | Covered by |
|---|---|---|
| **API Platform** organization "Zwizzly" — processes MentoMate learner data (programmatic model calls; project "Mentomate") | `org-SYWZbs7TCGCelnbxit5tmR0M` | `2026-08-08-ZWIZZLY-AS-signed-openai-api-org-dpa.pdf` — **this is the action 7 / DPIA evidence DPA** |
| **ChatGPT Business** workspace "Zwizzly" — the founders' chat subscription; no learner data | `org-IMRkhcySvit5vcMn3pLTScqs` | `2026-07-24-ZWIZZLY-AS-signed-openai-dpa.pdf` |

History: the 2026-07-24 DPA was intended for the API organization but the form was filled with the
ChatGPT workspace's org ID (both are labeled "Zwizzly" in their consoles). Caught 2026-08-08 during
action 7 evidence verification (text-extraction of the org ID against the console); the API-org DPA
was re-executed the same day. The 07-24 DPA is retained deliberately — it validly covers the
ChatGPT Business workspace the founders use for company work.

Counterparty in both: OpenAI Ireland Ltd. (EEA customer path).

**Standing warning — free-daily-tokens offer (never accept):** the API console advertises free daily
usage (1M–10M tokens/day) *in exchange for sharing traffic with OpenAI for training*
(Data controls → Sharing). All three sharing settings are Disabled (evidenced
`2026-08-08-api-org-data-controls-sharing.png`, offer-dormant state
`2026-08-08-api-org-sharing-free-tokens-offer-dormant.png`). Enabling it would breach the DPO's
interim operating condition "training/data-sharing settings stay disabled for production content".
The offer is dormant while sharing is Disabled — leave it that way.

Billing note: the payment card on file is a founder's personal card (normal pre-revenue posture;
operator-confirmed 2026-08-08). Invoices bill ZWIZZLY AS (org.nr/VAT 811696072MVA) — the customer
of record is the company regardless of the settling card. Expired cards removed 2026-08-08
(`2026-08-08-api-org-billing-payment-methods-after-cleanup.png`).

**Retention hardening (2026-08-08):** org-level **API call logging = Disabled** — conversation
storage in the OpenAI dashboard is impossible regardless of per-call parameters (the code uses
chat completions, `apps/api/src/services/llm/providers/openai.ts`, which never sets `store`; the
org control converts that from "doesn't happen" to "can't happen", covering any future Responses-API
adoption whose default is store-on). Org **audit logging = Active** (irreversible without contacting
OpenAI — deliberate). Evidence: `2026-08-08-api-org-data-retention-hardened.png`.
