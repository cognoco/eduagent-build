# Age × Consent × Activity Landscape — Proof of Concept

> **This is a proof-of-concept, not a canonical artefact.** It exists to
> test the shape of (a) the underlying data and (b) the artefact itself.
> Do not cite cells from this document in canonical work without
> re-verification.

## What this is

An experiment in mapping the cross-product of:

- **10 jurisdictions** (US, UK, Norway, plus 7 EU Member States — Germany, France, Slovakia, Sweden, Denmark, Estonia, Greece)
- **8 activity categories** (general data processing, marketing, profiling, third-party disclosure, LLM-conversation content, AI-specific behavioural, retention, account-existence)
- **2 actual-knowledge states** (unknown, known under threshold)

= **160 cells** in the full cross-product.

This is an *experiment*, not a deliverable. The goal is to see what the data looks like when you arrange it this way, and what the artefact (an HTML matrix) looks like when a viewer can slice and dice it.

## How to read it

- Open `index.html` in a browser. The data is in `data.json` next to it; the HTML fetches it on load.
- **Table view** lists cells row-by-row. Filter by jurisdiction, activity, knowledge state, or confidence threshold. Click a confidence cell to inspect.
- **Heatmap view** shows the maximum confidence per (jurisdiction × activity) pair. Useful for seeing at a glance which jurisdiction × activity combinations have strong data and which are "?".

## The 80% rule

Each cell carries a `confidence` score from 0.0 to 1.0. The convention for this proof-of-concept:

- **0.80–1.00** — directly stated in the under-13 walkthrough synthesis with a verified citation. **Trustworthy enough to use as-is.**
- **0.60–0.79** — derivable from the synthesis framework, but the citation may be unverified (URL real, primary text 403'd). **Trustworthy as a working assumption; re-verify before quoting.**
- **0.40–0.59** — derivable only by inference from related findings in the synthesis. **Working hypothesis, not a finding.**
- **0.20–0.39** — very weak; not populated with a rule, just a confidence score.
- **< 0.20 or "?"** — not defensible from the corpus. **Marked "?" in the matrix.** The "?" cells are information, not gaps to be ashamed of.

A cell is populated with a `controlling_rule` if and only if its confidence is ≥ 0.4. Below that, the cell shows "?" so the heatmap and the filter views make the gap visible.

## What is *not* in this proof-of-concept

- **No new research.** Every populated cell is defensible from the existing under-13 walkthrough synthesis + the four sub-area returns + the `SOURCES.md` verified list. No `WebFetch` retry pass on unverified primaries was run for this experiment.
- **No canonical status.** The cells do not override the data model, the ADRs, or any other canonical artefact. They are inputs to a future canonical artefact, not one.
- **No full EU MS coverage.** Only 3 of 10 jurisdictions (US, UK, DE) are populated in detail. The other 7 (NO, FR, SK, SE, DK, EE, GR) are skeleton rows with consent-age-threshold metadata only. The room can see what a populated cell looks like in the three priority jurisdictions, and where the research would go for the rest.

## What the experiment tells us (initial impressions)

These are observations, not findings. Each is "what does the shape of the matrix suggest" — not "what does the matrix prove":

1. **The "consent-unlockable" column is the most differentiated dimension across cells.** Many cells in the matrix show `consent_unlockable: false` — meaning the rule binds regardless of whether the user (or their guardian) has consented. AI Act Art 5(1)(b) (age-vulnerability exploitation), AI Act Art 5(1)(f) (emotion-inference in education), platform terms (OpenAI Root, Gemini under-18, Anthropic CSAM), and the COPPA "actual knowledge" trigger all bind without consent. The canonical model would need a *prohibition-floor* primitive distinct from the *consent-edge* primitive to express this cleanly.

2. **The actual-knowledge modifier changes the cell in 7 of 8 activity categories, in every populated jurisdiction.** The exception is the platform-terms activities (LLM conversation, AI-specific behavioural), where the rules are *jurisdiction-independent* and bind globally regardless of controller knowledge.

3. **Slovakia and Estonia are the most uncertain cells.** Slovakia because the synthesis flagged PT/SK as unverified in the EDPB Member-State list. Estonia because the consent-age derogation under GDPR Art 8 is unclear in the corpus. The "?" cells for these two are the *first* place a full-scan would go.

4. **The non-EU "?" rows (Norway, France, Slovakia, Sweden, Denmark, Estonia, Greece) are visible in the heatmap as a dark band.** This is the *experiment's value* — it shows at a glance that the corpus is concentrated in 3 of 10 jurisdictions, and that a full scan would need to focus on the other 7.

5. **The highest-confidence cells (≥0.85) cluster in two places:** the US × LLM-conversation / AI-behavioural cells (because OpenAI / Anthropic / Gemini terms are all verified), and the DE × LLM-conversation / AI-behavioural cells (because AI Act Art 5(1)(b), Art 5(1)(f), and Art 50 are all verified). These are also the cells where the AI Act and the platform terms *both* bind, which is what makes them strong.

## Next-step hooks

If this experiment is useful, the next steps would be:

- **Full population pass** for the 7 unpopulated jurisdictions (NO, FR, SK, SE, DK, EE, GR). Each gets the same per-activity × per-knowledge-state cell treatment as US / UK / DE.
- **Adversarial verification** of the medium-confidence cells (0.6–0.8) via the same `/workflow` judge-panel pattern used in the under-13 walkthrough. Likely lenses: jurisdiction-completeness (per regime), age-band-correctness (per activity × age-threshold interaction), statutory-vs-interpretive accuracy (rule placement), platform-mechanics-accuracy (the Layer 3 cells).
- **WebFetch retry pass** on the unverified primaries (FTC, ICO, EDPB, Datatilsynet, Apple Developer, Google Play). This is what the under-13 walkthrough deferred to the live walkthrough room; for a full canonical version, it would happen here.
- **Data-model amendment** to MMT-ADR-0011 (or new MMT-ADR-0013) to add a *prohibition-floor* primitive. The matrix shows this is needed: the consent axis alone cannot model the cells where `consent_unlockable: false` is the binding constraint.
- **Input to a future walkthrough** on the under-13 carve-out. The matrix gives the walkthrough room a 160-cell grid to argue over, rather than the 4-jurisdiction × 1-axis framing of the under-13 walkthrough.

## Provenance

- Underlying research: `_wip/identity-foundation/under-13-floor-walkthrough/SYNTHESIS.md` and the four sub-area returns in the same folder.
- Citation list: `_wip/identity-foundation/under-13-floor-walkthrough/SOURCES.md`.
- Roadmap context: `_wip/identity-foundation/ROADMAP.md` Phase F sub-thread on the under-13 floor re-litigation.
- This experiment authored in the `age-consent` Claude Code session, 2026-06-05.

---

*End of README. The matrix is the artefact. The experiment is the value.*
