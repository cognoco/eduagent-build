# Safety guards — prompt-only vs server-side-gate ledger

> **INTERIM MASTER.** This table is the source of truth for which
> `exchange-prompts.ts` SAFETY-block rules are enforced *only* by the LLM
> following its system prompt, versus which have a deterministic server-side
> backstop. It exists so a later safety audit does not re-flag a guard already
> reviewed and judged acceptable as prompt-only, and does not lose track of
> which guards still need one. It is **not canon** (L1) — canon points here,
> it never copies these rows. No migration target is defined yet; this folder
> is the durable record until one exists.
>
> **Governance:** no row may change without a new immutable record in
> [`trail/`](trail/). The current rows were seeded by
> [`trail/2026-07-03-seed.md`](trail/2026-07-03-seed.md).

## Provenance

The rows below originate from the **WI-1285** audit — an inventory of eight
SAFETY-block sites found in `exchange-prompts.ts`'s SAFETY block, recorded as
an 8-site table appended to the WI-1285 Cosmo page. That audit classified each
site as either **acceptable as prompt-only** or **needs a server-side gate**,
and named the follow-up Work Items for the latter two.
This register transcribes and verifies the four rows with a settled,
citable outcome (two gated, two justified-prompt-only) so that outcome is
discoverable from the repo, not only from the Cosmo page. **This register
does not yet reproduce the remaining four WI-1285 inventory sites** (crisis
redirect, "not a crisis" carve-out, anti-fabrication, and one further site);
add them as new rows + trail records in a follow-up pass that transcribes
the full WI-1285 table, rather than leaving this register implying they
were reviewed here.

## Ledger

| # | Guard | Enforcement | Rationale | Source | WI provenance |
|---|---|---|---|---|---|
| 1 | Harmful/dangerous-procedure operational how-to refusal | **server-side gate** — `services/dangerous-procedure-gate.ts` (`applyDangerousProcedureGate`, `detectDangerousProcedureLeak`, `detectCatastrophicProcedureLeak`) | A prompt-only rule regressed silently once live envelope-flow evals began invoking the model (eval probe SL-DU02 leaked opium→heroin extraction steps to a 13yo via a weak fallback model). Deterministic, allocation-light detector runs on the PARSED reply and fails closed with a harm-education-preserving refusal. **Age-scoped (`MMT-ADR-0030`):** minors get the full gate (all controlled/dangerous items); adults get a narrow catastrophic subset only — CBRN weapons + explosive-device construction — preserving adult latitude for general chemistry/pharmacology/energetics/weapons-history. | `apps/api/src/services/exchange-prompts.ts:696-697` | Rule authored under WI-558 (prompt-only); gate landed **WI-1154**; classified in **WI-1285** audit as a site that needed (and got) a gate; adult catastrophic subset added **WI-1351** (`MMT-ADR-0030`) |
| 2 | Minor-PII echo-back suppression | **server-side gate** — `services/minor-pii-echo-gate.ts` (`extractVolunteeredPiiMatches` + reply scrub) | A drifted/weak/jailbroken model could echo a minor's volunteered PII (name, school, email, phone, handle, address) straight into the persisted `ai_response.content` — a GDPR-K data-protection incident, not just a UX miss. Narrow echo-back scope: strips only the concrete PII values the learner volunteered, so curriculum content (a school in a history lesson) is untouched. | `apps/api/src/services/exchange-prompts.ts:692-694` | Rule pre-existing prompt-only; gate landed **WI-1348**; classified in **WI-1285** audit as a site that needed (and got) a gate |
| 3 | Jailbreak / system-prompt exfiltration / roleplay refusal | **prompt-only** (justified — no gate) | The system prompt holds no secrets to leak (it is entirely non-confidential pedagogy/safety instruction), so an exfiltration "win" discloses nothing sensitive. Deterministic detection of "is this a jailbreak attempt" is high-false-positive / low-value against natural roleplay requests in a tutoring context (many legitimate lessons ask the model to "be" a historical figure or a character in a story). The cost of a miss is low; the cost of a false-positive gate (refusing legitimate roleplay pedagogy) is real. | `apps/api/src/services/exchange-prompts.ts:695` | Classified in **WI-1285** audit as acceptable prompt-only (inventory item #6); recorded by **WI-1353** |
| 4 | Slur-explanation-without-repetition | **prompt-only** (justified — no gate) | Low stakes: the failure mode is the model explaining a slur's meaning without perfectly avoiding repeating the word, not a safety or data-protection harm. Answering the learner's question first (before any "tell a trusted adult" suggestion) is the correct UX and is easy for a deterministic gate to break by over-triggering on ordinary vocabulary questions ("what does the word idiot mean") that are not remotely this case. | `apps/api/src/services/exchange-prompts.ts:689-691` | Classified in **WI-1285** audit as acceptable prompt-only (inventory item #7); recorded by **WI-1353** |

## How to add a row

1. Add the row to the Ledger table above (living edit).
2. Add a new immutable file to `trail/`, named `YYYY-MM-DD-<change-slug>.md`,
   describing what changed and why (decision/vetting evidence). Never edit an
   existing trail file for a later change.
