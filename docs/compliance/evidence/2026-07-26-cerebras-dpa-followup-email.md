# Cerebras DPA follow-up — email to Alexander Mikoyan (v2, concrete TIA inputs)

> Context: Zuzana requested DPA execution via Cerebras Trust Center chat 2026-07-24;
> Alexander Mikoyan replied asking to switch to email (alexander.mikoyan@cerebras.net) + set up a call.
> v2 (2026-07-26): expanded the transfer item into a concrete TIA-input list per DPO requirements —
> ZWIZZLY produces the TIA; Cerebras supplies the factual inputs below.

---

**To:** alexander.mikoyan@cerebras.net
**Subject:** ZWIZZLY AS — DPA, transfer documentation and security evidence for Cerebras Inference API (follow-up from Trust Center)

Dear Alexander,

Thank you for the quick response in the Trust Center — happy to continue by email and to set up a call.

Brief context: ZWIZZLY AS (org. no. 811 696 072, Oslo, Norway) is preparing to use the Cerebras Inference API in production for MentoMate, an AI-supported tutoring application for learners aged 13 and above, including minors aged 13–17. Because the service is directed in part at children, we are completing a GDPR Article 35 Data Protection Impact Assessment supervised by our external Data Protection Officer. Before production use he requires documented Article 28 evidence for every processor and, because processing will take place in the United States, a completed transfer impact assessment on our side. We prepare that assessment ourselves, but it depends on factual inputs only Cerebras can provide.

So the call is as productive as possible, here is the complete list. Items A1–A6 are the general processor evidence; items B1–B7 are the specific transfer-assessment inputs.

**A. Data processing agreement and security evidence**

- **A1.** An **executed Data Processing Agreement** — countersigned, or a binding acceptance record identifying the effective date and version — confirmed to cover the Cerebras Inference API.
- **A2.** The DPA's completed annexes: **description of processing** (data categories, subjects, duration) and **technical and organisational measures**, plus your SOC 2 Type II report or ISO 27001 certificate (under NDA is fine).
- **A3.** Your current **subprocessor list for the Inference API** — entity names, roles, and processing locations — and the change-notification mechanism.
- **A4.** **Retention and deletion behaviour** for Inference API inputs and outputs: whether prompts/outputs are persisted at all, default retention period for any logs containing content, whether a zero-retention option exists for our account, and how deletion is evidenced.
- **A5.** Written confirmation that **API inputs and outputs are not used for model training** or for any purpose beyond providing and securing the service.
- **A6.** Any **conditions applicable to minors' (13–17) personal data** processed through the API, and a named data-protection contact for our records.

**B. Transfer impact assessment inputs (EEA → US)**

- **B1. Transfer tool.** Which mechanism you offer: **EU–US Data Privacy Framework** certification (if so, your active listing), and/or **Standard Contractual Clauses** — confirming SCC version (Commission Decision 2021/914), the module used (Module 2, controller→processor, and Module 3 for subprocessors), and that Annexes I–III are completed for the Inference API.
- **B2. Exact processing locations.** The data-center locations (country/state) where Inference API requests from EEA customers are processed and where any content-bearing logs are stored; whether any routing or failover can move processing outside those locations.
- **B3. US surveillance-law exposure.** Your assessment of whether Cerebras is subject to **FISA Section 702** (i.e., whether you qualify as an "electronic communications service provider" for the relevant service) and your exposure under **Executive Order 12333** and CLOUD Act requests, as relevant to the Inference API.
- **B4. Government-access history and policy.** Whether Cerebras has ever received a government request for customer content (or a statement that it has not); any published transparency report; and your documented policy — including commitments to notify the customer where legally permitted, to challenge overbroad or unlawful requests, and to disclose the minimum necessary.
- **B5. Supplementary technical measures.** Encryption in transit (TLS version) and at rest for any stored content; key management (who holds the keys); whether inference happens in memory only; what content, if any, appears in operational logs; and any pseudonymization or content-redaction options available to customers.
- **B6. Onward transfers.** For each subprocessor in A3 that would touch our content: location and the transfer tool relied on.
- **B7. TIA support documentation.** If Cerebras maintains a standard transfer-impact-assessment support document or Schrems II whitepaper for customers, please share it — it may cover several of the points above in one place.

For the call: I am based in the Oslo timezone (CEST). [Availability — e.g. "I am generally available Tuesday–Thursday, 15:00–18:00 CEST"]. Please suggest a couple of slots that work on your side.

One note on scope so expectations are aligned: we are an early-stage company — our near-term volumes will be modest, and our immediate need is the data-protection documentation above rather than a commercial enterprise arrangement. If parts of this are self-serve or handled by your legal team directly, a pointer to that process is equally welcome.

Kind regards,

Zuzana Kopecna
Chair, ZWIZZLY AS
Org. no. 811 696 072 · Fiskekroken 3B, 0139 Oslo, Norway

---

## Log

| Date | Direction | Event |
|------|-----------|-------|
| 2026-07-24 | → Cerebras (Trust Center chat) | DPA execution request incl. Inference API coverage + EEA→US transfer safeguards |
| 2026-07-24 | ← Alexander Mikoyan | Switch to email (alexander.mikoyan@cerebras.net) + set up a call |
| 2026-07-26 | → Alexander Mikoyan | This email (v2, concrete TIA inputs) sent |
