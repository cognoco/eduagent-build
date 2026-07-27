# Open-decision ledger — with recommendations

> **STATUS (2026-06-27):** Mostly current, but §13.6 (cohort/segmentation) is stale vs the 2026-06-14 no-cohort ruling — cross-check §13.6 against that decision before relying on it.

> Every unresolved decision across the spec (§13), the plan set, and the audit —
> each with what it blocks and a concrete recommendation, so each one is a ruling,
> not a research task. Sources: spec §13 (lines 329–337), `v2-plan/00-README.md`
> open-decisions table, S4/S5/S6 plan open items. Numbering follows the README's
> §13.1–§13.7 scheme.
>
> **Technical defaults below the line are taken as decided** (recorded here for
> visibility, not for ruling): S4 `edgeId` = nullable FK to `supportership.id`;
> S4 chip scopes = supportership-derived only (guardian-derived added in S5 if
> managed tier activates); exit-funnel server-route disposition = named S5
> deliverable.

## The decisions that are yours

| ID | The question | Blocks | Recommendation |
|---|---|---|---|
| **§13.6 — evidence gate** | What evidence authorizes S3+ (and the back half) to proceed? Pre-launch telemetry still cannot measure "vs V1 baseline," so the gate must be observable before launch. | **S3–S6 entirely.** The program's pivot point. | **Folded into the spec/plans 2026-06-13 as observed-cohort evidence**, not telemetry: 3–5 friendly families with a 13+ teen; pass = (a) teen returns *unprompted* ≥2× in week one and engages a feed/Subject action (not only the camera), (b) parent answers "what did my kid work on this week?" from the app alone in <1 min. Pre-committed stop rule: if (a) fails across the cohort, V2 ends at a measured S2 — feed demoted, camera-first shell kept. The actual PASS/FAIL still must be recorded in the Layer-3 **Bet Sheet** / decision log before S3 starts. |
| **§13.7 — assertiveness dial** | Default mentor proposal tone; who moves it? | S1 *copy templates only* (the build proceeds regardless). | **Adopt the spec's own recommendation as-is**: calm default (invitation, not summons); a two-position dial (*relaxed / push me*) set conversationally and mirrored in settings; never age-inferred. Two positions, not a slider (each position × 10 languages multiplies copy). Nothing further to research — this just needs your "yes." |
| **§13.4 — "Journal" vs "Notebook"** | Third tab's name, kid-tested together with the trust line ("your space is private, unless you're not safe"). | The name only; S3 ships default + one-key flip. | Keep **Journal** as the shipped default; **test both names in the Layer-2 prototype** — the cheapest possible kid-test, no build needed. |
| **§13.1 — V0 retirement threshold** | When may the legacy 5-tab shell actually be deleted? | S6 deletion tasks only (T9–T12). | **Defer** — rule it when S6 is near. Placeholder bar to react to then: two release cycles of V2 default-on in production with no shell-attributable support issues. |
| **§13.5 — managed (under-13) tier at launch** | Activate the managed tier at launch or keep it flag-off? | Nothing buildable — the mechanism is built in S5 behind `MANAGED_TIER_ACTIVE` (default OFF) either way. | **OFF at launch.** This follows from your already-made 13+ ruling (2026-06-08); reopen only with the 10–12 audience decision. |
| **§13.3 — managed-tier reporting richness** | How much extra detail do managed-child supporters get (within the absolute artifact wall)? | S5 build detail only. | **Defer to S5 planning.** No input needed now. |
| **§13.2 — identity sequencing** | Does the identity runway tolerate V2 as a downstream consumer? | S4 (and S5). | **Confirmed by events**: identity W0–W4 closed 2026-06-11; the real remaining gate is the CUT-A/CUT-B cutover after the new-llm→main merge. WI-678 (landed 2026-06-12, `287e99c9b`) re-keyed the S4–S6 blockers to exactly this, and moved S4 ledger-repoint ownership to the identity program (IF M-REPOINT). Treat as answered. |

## Blocking map (what waits on what)

- **Nothing blocks S1/S2 construction.** §13.7 touches S1 copy only; one ruling
  ("calm default, yes") clears it. The real S1 holds are process, not decisions:
  the new-llm→main merge (PRG-17) and WI-678's plan-set re-key.
- **§13.6 blocks S3+** — S4/S5 sit behind both the evidence gate and the identity
  cutover. The planning default is now observed-cohort evidence; the remaining
  gate is the recorded PASS/FAIL after the cohort, not another metric-design debate.
- **Ruled 2026-06-12: launch waits for the full build.** No S1–S3 launch, no
  "parent insight rides V1 surfaces" launch state — that fork (SURPRISE 1's
  launch half) is closed. The evidence gate remains an *internal* checkpoint on
  the back half, not a launch-sequencing decision.
- **§13.1 blocks only deletions** at the very end. **§13.3/§13.5** block nothing now.

## Previously-asked questions, now closed by this dossier

| Question (from the pre-planning discussion) | Resolution |
|---|---|
| Who generates the evidence? | Observed cohort of friendly families (→ Bet Sheet); telemetry gate replaced |
| What's the day-one story? | Scripted in `01-day-in-the-life.md` Scenes 1 & 3 — with gaps 1–3 named as the day-one risk |
| Is the conversation good enough to be the whole app? | Testable in the Layer-2 prototype before any S1 code |
| Pre-committed kill criteria? | Drafted under §13.6 above; formalized in the Bet Sheet |
| Mentor-character timing? | Ruled, parallel brand track (owner: Zuzana); **no V2 beat waits on it** — interim carrier is the conversation surface |
| Which §13 decisions block what? | The blocking map above |

Last updated: 2026-06-13
