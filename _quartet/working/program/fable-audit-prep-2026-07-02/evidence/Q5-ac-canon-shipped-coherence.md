# Q5 — AC / canon / shipped-reality coherence (timeboxed)

## Question
Are work-item acceptance criteria aligned with ratified specs and actual shipped behavior, or
are there systemic signs of drift?

## Scope
- Included: the WS-28 canonical priority plan vs Cosmo state; documented AC-drift data points
  (§4.5) as leads; one independently-found spec/AC retraction.
- Excluded (prep): per-WI AC-vs-spec deep verification for every item — that is Fable's
  adversarial job. This pack surfaces the pattern + the concrete leads.
- Timebox: pattern-level, not exhaustive.

## Method
- Read `docs/plans/2026-06-30-v2-publish-readiness-canonical-plan.md` (origin/main) head + headers.
- Cross-ref its task checkboxes against `artifacts/cosmo-ws28.tsv`.
- Git-verified the §4.5 process observations (WI-1102/1118/1120/1170) exist as commits/items.
- Ratified specs on hand: `docs/specs/2026-06-09-mentor-is-the-app-shell-redesign.md`,
  `docs/specs/2026-06-27-felt-knowing-loop.md`.

## Findings

| ID | Claim | Severity | Confidence | Evidence | Gap / caveat |
| --- | --- | --- | --- | --- | --- |
| Q5-F1 | **A "living" canonical plan is out of sync with Cosmo** (same as Q6-F4): T3/WI-1170, T4/WI-1171, T7/WI-1174 shown unchecked in the plan doc but Closed/Done in Cosmo. | medium | high | plan doc vs `cosmo-ws28.tsv` | Isolated staleness or systemic? Fable should spot-check 2–3 more WS-28 ACs vs shipped code. |
| Q5-F2 | **At least one finding was formally retracted** — WI-1170 "silent-scope-narrowing finding" retracted (commit `2e9942dcf docs(v2-plan): retract WI-1170 silent-scope-narrowing finding`). | info | high | git log origin/main WI-1170 | Healthy self-correction signal, OR churn signal. Fable: was the retraction evidence-based? |
| Q5-F3 | **§4.5 AC-drift leads (unverified — re-verify before use):** WI-1102 AC clause superseded by later work; WI-1118 AC required a topicless notes endpoint the ratified `felt-knowing-loop` spec refutes; WI-1120 internally contradictory reduced-motion criteria. | medium | low | handover §4.5; WI-1118/1120 confirmed as real items in `cosmo-ws28.tsv` | These are the sharpest AC-vs-spec drift leads. NOT independently verified here — Fable verifies against the felt-knowing-loop spec + the WI ACs directly. |
| Q5-F4 | **Publish-readiness is self-assessed as supporter-gap-blocked** in canon: canonical plan "Current Ruling" — learner V2 substantially built; supporter V2 (support hub, person-scope Journal, shared-record, drill-in, visibility ceremony) is "the critical publish gap". | high | high | plan doc "Current Ruling" + Scope | This is the shipped-reality self-assessment Fable should test against actual code (Q4 seam / app-shell map) and against the now-Closed WI-1170/1171 (which claim those gaps done). Tension with Q5-F1. |

## Contradictions
- **Q5-F1 ↔ Q5-F4:** the plan says supporter gaps are the blocker AND shows the supporter-gap
  tasks (WI-1170/1171) unchecked — but Cosmo says those tasks are Closed/Done. So either the
  supporter gap is now closed (Cosmo) and the plan's "Current Ruling" is stale, or the tasks
  were closed prematurely. **This is the single most important coherence question for the ship
  decision** and is handed to Fable unresolved (prep did not adjudicate task-closure quality).

## Fable prompts
- Are WI-1170 (support hub) and WI-1171 (visibility ceremony) *actually* shipped to the
  canonical plan's done-conditions, or closed against weaker criteria? Verify against
  `apps/mobile/src/components/support/**` and the visibility routes (Q4 map).
- Does WI-1118's shipped notes endpoint match the felt-knowing-loop spec, or the refuted
  topicless shape? (§4.5 lead.)
- Is the plan-vs-Cosmo staleness systemic across WS-28, or a single un-ticked checkbox?
