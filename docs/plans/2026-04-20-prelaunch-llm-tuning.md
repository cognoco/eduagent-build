# Pre-Launch LLM Tuning Plan

**Status:** Draft
**Date:** 2026-04-20
**Last status refresh:** 2026-05-01
**Relationship to existing spec:** Complements — does not replace — [docs/specs/2026-04-19-prompt-tuning-design.md](../specs/2026-04-19-prompt-tuning-design.md). That spec remains the reference plan for **post-launch continuous tuning** once real traffic exists. This plan covers the 2-3 weeks before launch, when the spec's baseline / rollout / telemetry apparatus cannot be exercised because there are no users.

> **Progress check (2026-05-01):** Some prompt tuning work has shipped under different banners (`de9f55b3` "exchange prompt tuning", `855a632f` PR #125 "exchanges service", `3ce28b45` envelope migration + prompt extraction). None of those commits reference this plan by name — verify whether Track 0 (probe battery), B.2, or B.5 are partially or fully done before treating the plan as untouched. Companion spec `docs/specs/2026-04-19-prompt-tuning-design.md` has stale file/line references (`exchanges.ts:230-245` → moved to `exchange-prompts.ts`) — refresh those when this plan is next picked up.

**Core constraint:** Zero users, zero traffic. The spec's `buildSystemPrompt` changes (B.1-B.5) are mostly still the right changes, but the scaffolding around them (7-day production baselines, 10% rollouts, drift dashboards, compliance-rate measurements across live Tier-2 runs) is premature. This plan reshapes the work for the pre-launch stage while keeping the post-launch plan intact for later.

---

## Why a separate plan

Two honest observations:

1. **Evidence base is N=1.** The prompt-tuning spec's Problem Statement rests on a single web-preview probe (`TestKid`, 2026-04-19). At-scale that's a seed observation you'd multiply via production sampling. At zero traffic there is no production to sample — the probe set itself has to be manufactured before any tuning decision can be trusted.

2. **Spec machinery is stage-inappropriate.** "Tier-2 across 10 seeded variations with ≥70% pass rate," "baseline from 7 days of production logs," "rollout monitoring dashboards" — these are post-launch instruments. Running them pre-launch produces numbers against synthetic fixtures only, which is useful for the mechanism-check but misleading if framed as the compliance metric.

The spec doesn't become wrong at launch — it becomes correct. This plan is the work that makes the spec applicable.

---

## Goals

- Ship the two trivial spec items (B.2 text-mode pronunciation, B.5 age calibration) without waiting for tuning infrastructure.
- Build a deliberate 30-40 probe synthetic battery that replaces N=1 as the pre-launch evidence base.
- Hand-edit B.1 (tone compliance) against the battery, reading transcripts directly — no regex eval, no autoresearch.
- Run a single Flash-vs-Sonnet comparison on the battery to answer whether tone compliance is a prompt problem or a model problem before launch.
- Ship B.3 and B.4 plumbing conservatively so the mechanisms exist at launch, but defer behavior tuning to post-launch when real data exists.
- Emit the telemetry events the spec defines (so they exist from day 1) without building dashboards yet.

## Non-Goals

- **No autoresearch loop.** The autoresearch pattern (Karpathy-style agent iterates on prompt, judged by a scalar metric) is explicitly deferred. It's a post-launch tool; at ~30 probes a human reads all transcripts and iterates faster than an agent adds value.
- **No production baselines.** Nothing to baseline against.
- **No drift dashboards or rollout gates.** Not meaningful at zero traffic.
- **No model-routing changes.** Track 3 answers the question; any routing change it prompts is a separate follow-up.
- **No new prompt surfaces beyond the spec's scope.** U1 `continueHint`, quiz surfaces, dictation surfaces — all stay out.

---

## Track 0 — Synthetic probe battery (PREREQUISITE)

Everything else depends on this. Ship first.

**What:** 30-40 probe sessions spanning the dimensions the launch user base will actually span.

**Dimensions (sample diagonals — not combinatorial):**

| Dimension | Values |
|---|---|
| Age (birthYear → ageYears) | 11, 13, 15, 17 |
| Input mode | text, voice |
| Subject | math, language (four_strands), non-STEM (history or science) |
| Mood | eager, bored, struggling, distracted, emotional |
| Session state | first-ever, returning with summary, mid-session, ending |
| Answer quality | all-correct streak, all-wrong streak, mixed, confused-but-trying |

**Adversarial seeds** (deliberately include — these are the cases real traffic will surface that a happy-path probe misses):
- Kid types `"i hate this"` mid-session
- Kid answers wrong 4 times in a row and is getting visibly discouraged
- Kid asks about something emotionally loaded (family, body, mental health)
- Kid is clearly bored and engaging in single-word replies
- Kid asks a meta question (`"are you real"`, `"do you remember me"`)
- Parent-visible context (parent role via family_links)

**How:** Each probe is a hand-authored fixture in `apps/api/eval-llm/fixtures/probes/` consisting of:
- Profile stub (`profiles.ts` style)
- Session history (3-8 prior exchanges)
- Next user input (the turn being generated for)

For the "user side" of multi-turn probes, prompt a separate LLM with a persona card to generate the kid's replies. **Simulator model choice matters:** use GPT-4o as the simulator — a third model family — so no Track 3 arm shares its distribution. (Using Sonnet as the simulator would bias the Sonnet arm upward; using Gemini would bias the Gemini arm upward. GPT-4o is neutral to both.) Not a perfect simulation — good enough for pre-launch.

**Validity limit to name in the battery header:** simulator-generated kid replies approximate but do not reproduce real-user distribution. The battery is the best pre-launch evidence base available, not a substitute for the real-traffic re-baseline at launch + 2 weeks (see "When to revisit the spec").

**Output:** `apps/api/eval-llm/fixtures/probes/battery.ts` exporting an array of 30-40 named probes, each runnable through the EXCH harness.

**Deliverables:**

| Item | Verified By |
|---|---|
| Probe battery file with ≥30 entries | Count assertion in harness bootstrap |
| Each dimension represented ≥3 times | Coverage table in the file header |
| ≥6 adversarial seeds included | Named subset `adversarialProbes` |
| Runs green end-to-end against current prompt | Harness snapshot run |

**Budget:** 2-3 days. LLM spend for authoring kid-side replies: <$20.

---

## Track 1 — Ship trivial B.* changes (half-day)

These ship regardless of battery state. They match product constraints (not behavior hypotheses), so probe evidence isn't the gating concern.

**B.5 — Age calibration rephrase.** Replace `"A 9-year-old... A 16-year-old... An adult..."` at [exchanges.ts:244](../../apps/api/src/services/exchanges.ts#L244) with the 12/15/17 anchors from the spec. Also remove any `adult`-as-learner-anchor text in `getAgeVoice` at [exchanges.ts:756](../../apps/api/src/services/exchanges.ts#L756). Spec text at [2026-04-19-prompt-tuning-design.md §B.5](../specs/2026-04-19-prompt-tuning-design.md).

**B.2 — Text-mode pronunciation block.** Add the symmetric TEXT MODE conditional block near the existing VOICE MODE block at [exchanges.ts:574](../../apps/api/src/services/exchanges.ts#L574). Guard with `!isLanguageMode` so four_strands sessions retain pronunciation guides. Spec text at [2026-04-19-prompt-tuning-design.md §B.2](../specs/2026-04-19-prompt-tuning-design.md).

**Deliverables:**

| Item | Verified By |
|---|---|
| B.5 text change landed | `exchanges.test.ts` snapshot: rendered prompt omits `9-year-old`, `10-year-old`, `an adult` learner anchors |
| B.2 block conditional landed | Unit test: `buildSystemPrompt` output contains TEXT MODE block iff `inputMode !== 'voice' && !isLanguageMode` |
| No regression in existing snapshots | `pnpm exec nx run api:test` passes |

**Budget:** 30 minutes of work + 30 minutes of verification.

**Rollback:** Git revert. No DB migrations, no data changes.

---

## Track 2 — Hand-edit B.1 against the battery (1-2 days)

**Prerequisite:** Track 0 complete.

**What:** Apply B.1's banned-opener list + minimal-acknowledgment framing from the spec. Then iterate against the probe battery by reading transcripts, not by running a regex.

**Why this shape:** The spec's regex eval (`first 6 words` match against a banned list) is trivially gameable by the model — it will switch from `"Great!"` to `"Wonderful!"` or `"Oh, great question"` and pass the regex while failing the intent. At 30 probes, a human reads all outputs in ~20 minutes and catches the class of behavior, not the specific strings.

**Loop (repeat 2-3 times):**
1. Edit the tone paragraph per current B.1 draft.
2. Run battery through EXCH harness capturing outputs.
3. Read all 30-40 transcripts. Mark each reply as `minimal | warm | filler | flat-robotic`.
4. Count category rates. Spot-check 5 adversarial seeds specifically for warmth loss.
5. Adjust wording; go to step 2.

**Stop condition:** `filler` ≤ 10% and `flat-robotic` ≤ 5% across the battery, with adversarial seeds checked for warmth preservation.

**Rater discipline (single-rater bias mitigation):**
- Record the rater's identity in the run summary (solo-human review at this scale).
- Second-pass a 10-probe subset at the final iteration — re-label blind to the first pass, after ≥4 hours. Report agreement rate. Disagreement >20% means the label rubric is under-specified; tighten it before trusting the compliance numbers.
- Disambiguate `warm` vs `filler` in the label rubric before the first iteration — "warm" = emotional attunement to this kid's current state; "filler" = generic praise that could be pasted into any reply. Write the rubric into the battery file header.

**Key risk:** Overcorrection to flat register. This is why manual reading > regex — the regex doesn't detect flatness, human reading does. The battery's emotional / struggling / discouraged probes are the specific ones to watch for warmth regression.

**Deliverables:**

| Item | Verified By |
|---|---|
| Tone paragraph revision committed | Snapshot test: new text present in assembled prompt |
| Battery run transcripts captured | Fixture file `battery-outputs-b1-v{n}.json` per iteration |
| Category counts logged | Plain-text summary alongside each run: `minimal X / warm Y / filler Z / flat W` |
| Adversarial seed warmth spot-check | Manual: 6 transcripts read + annotated in the commit description |

**Budget:** 1-2 days. LLM spend: ~$10-$20 across iterations.

**Rollback:** Git revert. No data changes.

---

## Track 3 — Three-way model comparison on the battery (1 day)

**Prerequisite:** Track 0 complete. Independent of Track 2 — can run in parallel.

**What:** The same battery, same prompt (current + Track 1 changes), **three models:**
- **Gemini 2.5 Flash** — standard tier, rung ≤ 2 (lighter exchanges today).
- **Gemini 2.5 Pro** — standard tier, rung > 2 (tone-critical exchanges today).
- **Claude Sonnet 4.6** — premium tier.

The router at [apps/api/src/services/llm/router.ts:134-147](../../apps/api/src/services/llm/router.ts#L134) splits the exchange surface across Flash and Pro by rung, and swaps the whole flight to Sonnet for premium tier. Testing only two models would conflate the rung-split decision with the tier-promotion decision. Run all three so the decision memo can answer each independently.

**Why:** The spec acknowledges three times that the fallback for prompt-edit failure is promoting tone-critical calls to Sonnet. At zero traffic, that experiment is a day of work instead of a multi-week rollout. Pre-launch is the one moment cost-vs-quality pressure is lopsided in favor of quality — a bad launch is much more expensive than inference.

**How:**
- Run the battery three times, forcing each model via a one-off harness path (bypass the rung-based routing so every probe hits the same model for a clean comparison).
- Read side-by-side — three transcripts per probe.
- Score each triple on: tone compliance, warmth preservation, pedagogical soundness, age-register following.

**Decision rule (two independent questions):**

*Question A — "Pin exchange surface to Pro, regardless of rung?"* (uses existing per-call `llmTier` plumbing; no router structural change)
- Pro decisively beats Flash on tone-critical probes (emotional / struggling / adversarial) → **pin exchange surface to Pro at launch.**
- Comparable on tone-critical probes → **keep rung-based split.**

*Question B — "Promote exchange surface to Sonnet at launch?"* (force `llmTier: 'premium'` at the exchange call site; cheaper and more surgical than flipping the tier default)
- Sonnet decisively beats Pro (e.g., ≥20-point gap on tone compliance **on the Gemini-arm-biased simulator** — see note below — with no warmth regression) → **launch with exchange surface on Sonnet.** Leave the rest of the fleet on standard. Optimize post-launch once traffic informs the trade-off.
- Comparable → **launch on standard tier** with the per-call override wired and documented as the first post-launch escape hatch.
- Pro beats Sonnet → interesting data point, launch on standard, investigate whether Gemini's defaults (safety settings, temperature) are doing unseen work we'd lose on Sonnet.

**Simulator-bias note (see Track 0):** the kid-reply simulator is GPT-4o (third family) specifically to avoid biasing either Gemini or Sonnet arms. If GPT-4o is unavailable and Gemini 2.5 Pro is used as a fallback simulator, the bias lands on the Gemini arms — interpret a Sonnet win as "despite a simulator bias against it," which is *stronger* evidence not weaker. Never use Sonnet as the simulator in this track.

**Cost budget if Sonnet wins:** before recording "launch with exchange surface on Sonnet," add a short projection to the decision memo — **per-exchange cost × projected exchanges/day at 100 / 500 / 1,000 DAU**, using the current `services/llm/router.ts` Sonnet `maxTokens` caps (4096 rung ≤ 2, 8192 rung > 2). A 5–10× per-exchange cost delta matters at 1,000 DAU even if it's invisible at 10.

**Deliverables:**

| Item | Verified By |
|---|---|
| Paired transcripts captured | `battery-outputs-flash.json`, `battery-outputs-pro.json`, `battery-outputs-sonnet.json` |
| Side-by-side scoring table | Plain-text scoring sheet with per-probe ratings across all three columns |
| Question A + Question B decisions recorded separately | Short decision memo in this file's "Track 3 outcome" section after completion, with the cost projection if Sonnet is chosen |
| Router / call-site config updated | Either per-call `llmTier: 'premium'` at exchange call site, or rung-bypass (pin to Pro), matching decisions |

**Budget:** 1 day. LLM spend: ~$25 (Sonnet + Pro are the expensive halves).

**Rollback:** Per-call `llmTier` or rung-bypass are one-line edits at the exchange call site. No router structural change.

---

## Track 4 — B.3 and B.4 conservative ship (2-3 days)

Neither can be behaviorally tuned pre-launch — B.3 depends on real streaks, B.4 depends on returning users. Ship the plumbing and the mechanism, accept untuned behavior at launch, plan for post-launch tuning in the spec.

### Track 4a — B.3 correctStreak (conservative)

**Ship:**
- Add `correctStreak?: number` to `ExchangeContext`.
- Compute server-side in `session-exchange.ts::prepareExchangeContext` as the spec describes, cap at 5.
- Add the ADAPTIVE ESCALATION prompt section **but raise threshold from `>= 3` to `>= 4`** at launch. Reason: with untuned `correctAnswer: true` reliability, false positives at streak-3 will interrupt genuinely-struggling kids; the higher threshold costs a little responsiveness in exchange for much less false-positive risk.
- **Feature-flag the ESCALATION prompt injection, defaulted OFF.** The `correctStreak` computation ships (so telemetry exists from day 1 and the flag can be flipped without a code deploy), but the prompt section only injects when the flag is on. This addresses the concern that shipping the mechanism while deferring the `correctAnswer: true` classifier reliability audit bets on a classifier that hasn't been validated. Flip the flag on once a few days of real streak data exist and the classifier looks trustworthy (Track 5 telemetry gives the audit inputs).
- Unit test `computeCorrectStreak` as a pure function with seeded event streams.
- Single battery probe (`correctStreak_4`) to verify mechanism fires **when the flag is on** — test both flag states.

**Explicitly defer to post-launch:**
- Actual tuning of the threshold (3 vs 4 vs 5) — requires real-streak data.
- `correctAnswer: true` reliability audit (my critique #4 on the spec) — requires production classifier labels.

### Track 4b — B.4 memory block re-injection

**Ship:**
- `lastSessionSummary` and `parkedQuestions` fields on `MemoryBlockProfile`.
- Queries in `prepareExchangeContext` (with the 14-day freshness window as proposed).
- `buildMemoryBlock` emits the two new sections.
- Length cap with priority ordering: interests → struggles → strengths → summary → parked questions.
- **Summary-quality gate** added as a spec gap: only inject summaries where the generating session had ≥4 exchanges AND the summary is ≤200 chars. This addresses the spec's "summary is misleading" failure mode which was dismissed as out-of-scope.
- Synthetic `returningLearnerWithSummary` probe in the battery.

**Explicitly defer to post-launch:**
- Tuning the freshness window, summary quality gate thresholds, and priority ordering — requires real returning-user data.

**Deliverables (Track 4 combined):**

| Item | Verified By |
|---|---|
| `correctStreak` pure function | `session-exchange.test.ts::computeCorrectStreak` unit tests |
| `correctStreak >= 4` prompt injection | Snapshot test on `correctStreak_4` probe |
| Memory block new fields + rendering | `learner-profile.test.ts::buildMemoryBlock` with synthetic fixtures |
| Summary-quality gate | Unit test: summary ≥201 chars or session <4 exchanges is NOT injected |
| Synthetic returning-learner probe runs green | Battery snapshot |

**Budget:** 2-3 days. Mostly code, minimal LLM spend.

**Rollback:** Feature-flag both via `context.correctStreak ?? undefined` and `profile.lastSessionSummary ?? undefined` — absence reverts to pre-feature behavior automatically.

---

## Track 5 — Telemetry scaffolding without dashboards (half-day)

**Ship** (so it's ready for day-1 production data):
- `app/llm.tone_check` emission per exchange with `{ sessionId, firstSixWords, wordCount, startsWithFiller, model }` — add `model` field (not in spec) because Track 3's outcome may mean mixed-model fleet at launch.
- `app/llm.text_mode_pronunciation_leak` counter.
- `app/llm.escalation_offered` counter.
- `app/llm.memory_block_size` gauge with `{ sessionId, sizeBytes, sectionCount, truncated }`.

**Defer:**
- Dashboards — build post-launch once data shape is known.
- Baselines — impossible pre-launch.
- Alert thresholds — wrong without traffic to calibrate.
- Drift detection — post-launch concern.

**Deliverables:**

| Item | Verified By |
|---|---|
| All four events fire in integration test | `exchange-integration.test.ts` mock-event assertions |
| Event payload schema typed in shared types | `@eduagent/schemas` types compile |

**Budget:** Half a day. No LLM spend.

**Rollback:** Event emission can be removed per-event without side effects.

---

## Sequencing

```
Track 0 (probe battery) ────┬──→ Track 2 (B.1 hand-edit) ───┐
                            │                                │
                            └──→ Track 3 (Flash vs Sonnet) ──┤
                                                             │
Track 1 (B.2, B.5 ship) ─────────────────────────────────────┤
                                                             │
Track 4 (B.3 + B.4 plumbing) ────────────────────────────────┤
                                                             │
Track 5 (telemetry scaffolding) ─────────────────────────────┤
                                                             ▼
                                                        LAUNCH GATE
```

**Day-by-day suggestion:**
- Day 1: Track 1 ships in the morning. Track 0 probe-battery authoring starts.
- Day 2-3: Track 0 continues. Track 5 (telemetry) lands in parallel.
- Day 4: Track 0 complete. Track 2 and Track 3 start in parallel.
- Day 5: Track 3 three-way run + scoring. Track 2 iteration 1.
- Day 6-7: Track 2 iterations 2-3. Track 3 decision memo finalized with cost projection.
- Day 4-7: Track 4 plumbing in parallel (mostly independent code work).
- Day 8: Launch gate review (one day of buffer added for rater second-pass + Track 3 cost sign-off).

---

## Launch gate

Do not launch unless:

- [ ] B.2 and B.5 landed and green
- [ ] Probe battery ≥30 entries with ≥6 adversarial seeds
- [ ] Track 2 final run: `filler` ≤ 10%, `flat-robotic` ≤ 5%
- [ ] Track 2 adversarial seeds: all 6 warmth-checked, annotated pass/fail in commit, **≥5 of 6 pass** (1 acknowledged failure allowed with a named post-launch follow-up; 2+ failures blocks launch)
- [ ] Track 2 rater second-pass: 10-probe blind re-label shows ≥80% agreement with first pass
- [ ] Track 3 decision recorded; router config matches decision
- [ ] Track 4 plumbing committed with unit tests green
- [ ] Track 5 events emit in integration test
- [ ] No regression in existing `api:test`, `api:lint`, `api:typecheck`
- [ ] Mobile unaffected (no spec change touches mobile) — run `mobile:lint` + `mobile:typecheck` as sanity

---

## Failure Modes

| State | Trigger | Recovery |
|---|---|---|
| Track 2 can't get filler below 10% | Prompt edits alone insufficient; model ceiling | Use Track 3 outcome to promote to Sonnet for exchange surface. If Sonnet also stuck, accept launch-day compliance rate and plan autoresearch loop post-launch per the spec. |
| Track 3 inconclusive (Flash ≈ Sonnet) | Both models comparable on battery | Launch on Flash (cheaper); flag the specific probe categories where neither did well as post-launch priorities. |
| Probe battery biased (missed real-world cases) | Discovered post-launch | Expand battery with real-traffic transcripts in first 2 weeks post-launch; run full Track 2-3 loop again. Accepted risk. |
| `correctAnswer: true` classifier unreliable at launch | B.3 interrupts struggling kids with false offers | Raise threshold further (5 or disable entirely via feature flag) until post-launch classifier audit completes. |
| Session-summary re-injection surfaces bad content | Upstream summary LLM generated misleading text | Summary-quality gate blocks the worst cases; long-tail caught in post-launch monitoring. Parent complaint is the likely surfacing mechanism — not automated. |
| Battery-authoring takes longer than 2-3 days | Adversarial probe design harder than expected | Reduce to 20 probes with all 6 adversarial seeds preserved; diagonal sampling more aggressive. 20 > N=1 is the minimum useful improvement. |

---

## Rollback

N/A for this plan as a unit — each track's rollback is described in its section. No destructive migrations, no irreversible operations. All changes are git-revertable.

---

## When to revisit the spec

The spec [2026-04-19-prompt-tuning-design.md](../specs/2026-04-19-prompt-tuning-design.md) becomes the operative tuning document at **launch + 2 weeks**, when:

- Real-traffic transcripts exist for baseline measurement
- Praise-filler rate, pronunciation-leak rate, escalation-offer rate can be computed from production logs
- A/B splits against real users become meaningful (assuming ≥100 DAU by then)
- The judge-LLM classifier infrastructure (recommended for post-launch) can be calibrated against real-traffic human labels
- Autoresearch-pattern experiments on bounded prompt sub-surfaces become worth the $25-$100 overnight spend they cost

Specifically, the spec's sections that go from premature to correct at that point:
- Section "Testing Strategy" Tier-2 compliance rates — measured against real traffic
- Section "Rollout monitoring" — builds dashboards on real data
- Section "Suggested baselines to capture" — captured from real traffic
- Item B.3 threshold tuning — use real streak data
- Item B.4 freshness window and summary-quality gate tuning — use real returning-user data

At that point, the autoresearch complement discussed in the design conversation becomes live: bounded agent-driven iteration on the tone paragraph, gated by a judge-LLM classifier, running overnight. That's explicitly out of scope for this plan but worth scheduling for week-3-post-launch.

---

## Related Documents

- [docs/specs/2026-04-19-prompt-tuning-design.md](../specs/2026-04-19-prompt-tuning-design.md) — the post-launch tuning spec this plan defers to
- [docs/specs/2026-04-18-llm-personalization-audit.md](../specs/2026-04-18-llm-personalization-audit.md) — audit that motivated B.1-B.5
- [apps/api/eval-llm/flows/exchanges.ts](../../apps/api/eval-llm/flows/exchanges.ts) — EXCH harness the battery plugs into
- [apps/api/src/services/exchanges.ts](../../apps/api/src/services/exchanges.ts) — `buildSystemPrompt` target of B.1/B.2/B.5
- [apps/api/src/services/learner-profile.ts](../../apps/api/src/services/learner-profile.ts) — `buildMemoryBlock` target of B.4
- Memory: `project_llm_audit_2026_04_18.md`, `project_eval_llm_harness.md`
