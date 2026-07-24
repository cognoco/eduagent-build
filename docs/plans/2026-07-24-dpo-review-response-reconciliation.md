# DPO review response reconciliation plan

**Date:** 24 July 2026<br>
**Profile:** Change<br>
**Status:** Complete

## Objective

Produce a response to the 23 July DPO review that is complete across all ten
questions, distinguishes code evidence from production and legal evidence, and
uses one consistent launch-country position:

- launch only in jurisdictions whose currently verified Article 8 digital
  self-consent threshold is 13;
- block unknown, unverified, unsupported, and higher-threshold jurisdictions at
  launch;
- add further supported countries only after the jurisdiction-aware country
  matrix and guardian-authorisation flow are implemented, legally verified, and
  enabled.

## File map

| Artefact | Intended change | Done when |
|---|---|---|
| `docs/compliance/DPO exchanges/2026-07-23-dpia-review-response-draft.md` | Replace the partial six-question draft with a challenged, evidence-labelled response to questions 1–10 | Every DPO question is answered; unsupported claims are removed or qualified; open evidence and decisions are explicit |
| `docs/compliance/history/2026-07-23-dpia-review-response-superseded.md` | Retain the earlier body but add an unmistakable superseded/do-not-send banner | Readers cannot confuse the incomplete snapshot with the current response |
| `docs/compliance/DPO exchanges/2026-07-24-stephan-decision-annex.md` | Add a decision/sign-off annex | Management decisions, DPO advice requests, prerequisites, and signature meanings are separated |
| `docs/compliance/history/2026-07-24-legacy-test-environment-disposition.md` | Record the obsolete owner-only test environment’s disposition | Readers cannot mistake it for launch evidence or include it in the DPO bundle |
| Notion `OPQ-108`, `OPQ-133`, and `OPQ-103` discussion | Reconcile the country-consent ruling | The age-13-jurisdiction launch rule and later expansion rule read consistently, with the superseded ruling preserved as history |

The similarly named
`docs/compliance/history/2026-07-23-dpia-review-response-superseded.md` is an older retained
snapshot, not the user-nominated working response. Its body remains historical;
an explicit superseded/do-not-send banner and index correction prevent it from
being mistaken for the current response.

## Tasks and verification

### T1 — Refresh configuration evidence

Read the current `prd` source configuration through Doppler, emitting only:

- the values of compliance-relevant non-secret feature flags;
- whether named provider credentials are present;
- the check timestamp and source/config name.

Do not treat source configuration as proof of the currently deployed Worker
version or runtime path. Verify the resulting file contains no credential value.

### T2 — Rewrite the DPO response

For each of the ten review questions:

1. state the strongest answer the evidence supports;
2. cite the current code or dated evidence;
3. identify defects, limitations, and contradictions;
4. identify the close artefact and owner;
5. avoid presenting an internal product ruling as DPO approval or legal advice.

Challenge the following high-risk claims explicitly:

- controller main establishment and lead authority;
- effective LLM fallback and regional-routing behaviour;
- Article 8 launch-country enforcement;
- affirmative consent and withdrawal behaviour;
- incidental Article 9 processing;
- transcript, account, consent, provider, backup, and dormancy retention;
- processor/controller role allocation and transfer evidence;
- complete data-subject-rights coverage;
- child transparency and Article 35(9) consultation;
- residual-risk acceptance and Article 36 prior consultation.

### T3 — Prepare Stephan’s annex

Separate:

- facts or product decisions management must attest;
- legal/DPO advice requested from Stephan;
- evidence that must exist before a sign-off can be meaningful;
- the DPO opinion from the controller’s management decision.

### T4 — Reconcile OPQs

Re-read the current Notion records immediately before mutation. Preserve the
22 July all-market ruling as superseded history rather than deleting it.

- `OPQ-108` — reaffirm the threshold-13 launch allowlist and later expansion.
- `OPQ-133` — mark the all-market MVP ruling superseded by the 24 July launch
  decision; keep its implementation work relevant to expansion.
- `OPQ-103` — correct the discussion input that currently cites the superseded
  all-market MVP decision.

### T5 — Final verification

- compare response headings against all ten DPO questions;
- search for the disproved “item 6 was only a heading” claim;
- search for conflicting country-launch language;
- inspect every code citation named in the response;
- inspect the final diff for unrelated changes and secrets;
- run repository documentation checks if a focused command exists.
