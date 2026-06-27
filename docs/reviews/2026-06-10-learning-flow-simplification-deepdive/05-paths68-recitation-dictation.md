# Paths 6+8 — Recitation + Dictation: Deep-Dive

> **STATUS (2026-06-27):** Partial — #1 (dictation personalization via `fetchGenerateContext`) and #2 (60s filing-wait bypass for recitation) shipped; voice-first compliance wording, `subjects[0]` pollution, Beta gating, and OCR items still open.

> Cluster scope: Path 6 (Recitation Beta, in-session) + Path 8 (Dictation, standalone activity) — the two practice activities with the weakest integration · Analyst: paths68 · Date 2026-06-10 · Sources verified at HEAD of `new-llm`

**Method note.** Every claim below was re-derived from source on `new-llm`; `learning-path-flows.md`, the atlas, and the proposed/diff docs were used only as leads. Where they diverge from code, the code wins and the divergence is flagged in §4. Two of the brief's cited paths were wrong (`hooks/use-subject-classification.ts` → actually `components/session/use-subject-classification.ts`; `text-preview.tsx` `ocrText` reader → **does not exist**, see §4).

---

## 1. Feature inventory (verified)

### Path 6 — Recitation (in-session, `mode='recitation'`, `sessionType='learning'`)

| Feature / branch | What it does | Status | Load-bearing? (why) | Evidence |
|---|---|---|---|---|
| Practice-hub "Recite (Beta)" tile | Pushes `/(app)/session {mode:'recitation'}` | prod-active (Beta) | Incidental — one of 5 co-equal practice tiles, buried 2 taps inside Practice | `practice/index.tsx:920-924`; Beta chip `:942` |
| Silent `availableSubjects[0]` auto-assign | On first message, recitation auto-picks the first subject with NO classification dialog; sets `classifiedSubject` → session `subjectId` | prod-active | **Incidental + harmful** — see pollution §2.2 | `components/session/use-subject-classification.ts:507-521` |
| Input mode (text default, SecureStore restore) | `inputMode` defaults `'text'`, restored once from SecureStore; BUG-357 guard preserves pref on session change | prod-active | Load-bearing (BUG-357 guard); but text-default *defeats the feature's point* | `session/index.tsx:335,340-360,529-530` |
| Recitation prompt block | Overrides teaching/escalation: listen + feedback, no Socratic ladder, no FIRST TURN RULE | prod-active | **Load-bearing** — this IS the feature | `exchange-prompts.ts:769-796` |
| Input-mode-aware feedback scope | Voice → "comment on delivery: pace, confidence, expression"; text → wording/structure/completeness only | prod-active | Load-bearing **+ compliance flag** (§2.2, §5) | `exchange-prompts.ts:771-774` |
| `recitation_text` evidence source | Last 4 user turns + current bundled as factuality source, reliable only for wording feedback | prod-active | Load-bearing (anti-hallucination grounding) | `exchange-prompts.ts:439`; bundling at `:446` |
| `practice_activity_events` write per AI turn | One row per recitation AI turn, `activityType='recitation'`, tagged `subjectId: session.subjectId` (= subjects[0]) | prod-active | **Incidental** — feeds reports only (§2.2) | `session-exchange.ts:2685-2703` |
| 60s topicless filing-wait | Pipeline `waitForEvent('app/filing.completed', 60s)` fires for any `!topicId` non-abandoned session; recitation is topicless → always times out → Sentry + `app/session.filing_timed_out` → proceeds | prod-active | **Incidental cost** — pure 60s server latency, no value for recitation | gate `session-completed.ts:399`; timeout `:415-439` |
| Full post-completion pipeline | Coaching card, LLM summary, memory, XP, streak, embeddings all run; no overlays, no Challenge | prod-active | Load-bearing (shared infra) | pipeline table, `learning-path-flows.md:610-634` |

### Path 8 — Dictation (standalone activity, own tables, no session)

| Feature / branch | What it does | Status | Load-bearing? (why) | Evidence |
|---|---|---|---|---|
| Two-choice entry hub | "I have a text" → `text-preview`; "Surprise me" → `/dictation/generate` | prod-active | Incidental — collapsible to one primary CTA | `dictation/index.tsx:213-224` |
| "Surprise me" generation | LLM 6-10 sentence passage, age-appropriate | prod-active | **Load-bearing** (the default path) | `services/dictation/generate.ts:205-216`; route `dictation.ts:134-145` |
| Personalization plumbing (interests + libraryTopics) | `GenerateContext` defines them; `buildInterestThemeBlock` fully consumes them into PERSONALIZATION + LIBRARY TOPICS prompt blocks | **built but UNFED** | **Load-bearing latent value** — see §5 #1 | schema `generate.ts:41-49`; consumer `:72-108` |
| `fetchGenerateContext` | Returns ONLY `{nativeLanguage, ageYears}` — never `interests`/`libraryTopics` | prod-active | The bug — strands the plumbing above | `services/dictation/result.ts:166-179` |
| "I have a text" / `prepare-homework` | Blank editable TextInput → LLM sentence-split → playback | prod-active | Load-bearing (manual-text path) | `text-preview.tsx:19,46-60`; `prepare-homework.ts` |
| Client TTS playback | Expo Speech, no network; pace/punctuation prefs; 3.5s SILENT countdown | prod-active | Load-bearing | `use-dictation-playback.ts:43,211` |
| "Check my writing" review | Camera → rung-2 multimodal LLM → per-mistake remediation; reads `learningProfiles.struggles` best-effort; **no write-back**; 10/min rate limit | prod-active | Load-bearing; struggles read is read-only | service `review.ts:164-217`; struggles read `dictation.ts:270-296`; rate limit `dictation.ts:229` |
| **No** flag gate on "Check my writing" | Button is unconditional | prod-active | corrects old doc | `complete.tsx:406-411` |
| `dictation_results` + `practice_activity_events` write | One result row + activity ledger event (`activityType='dictation'`, no XP v1); streak computed on-the-fly | prod-active | Load-bearing (record); feeds **reports only** | `result.ts:41-108`; streak `result.ts:115-159` |
| `GET /dictation/streak` | Computes consecutive-day streak — **no mobile consumer** | orphaned (data-only) | Incidental — dead read | `dictation.ts:311`; atlas signal #6 |
| `ocrText` param read in dictation | **DOES NOT EXIST** in `text-preview.tsx` | absent | n/a — refutes doc claim (§4) | `text-preview.tsx` has no `useLocalSearchParams`/`ocrText` |

---

## 2. Complexity map

### 2.1 User-felt complexity
- **Recitation:** named "Recite (**Beta**)" — "Beta" reads as "might break" to a nervous kid practicing a graded recital. Lands in a **keyboard** by default (text mode), so a first-timer never discovers the voice-feedback gem (pace/expression) — the feature quietly degrades to a spelling test. No subject question, which is good UX-wise, but see pollution below.
- **Dictation:** buried 2 taps inside Practice, then a **two-choice fork** the user must reason about ("I have a text" vs "Surprise me"). "Surprise me" produces an **age-only generic passage** with zero relation to what the kid studies or likes — personalization is built but invisible. The review screen is 5-7 taps from a tab root (atlas signal #2). The streak the backend computes is never shown.

### 2.2 Hidden complexity
- **Recitation subjects[0] pollution (VERIFIED, bounded).** Recitation auto-assigns `availableSubjects[0]` (`use-subject-classification.ts:507-521`); each AI turn then writes `practice_activity_events` tagged with that `subjectId` (`session-exchange.ts:2685-2703`). Those events are read **only** by `getPracticeActivitySummary` (`practice-activity-summary.ts`), consumed by `weekly-progress-push.ts`, `monthly-report-cron.ts`, `weekly-self-reports.ts` — i.e. parent/self **reports**. So a recited English poem inflates the *first* subject's (alphabetically/recency-first, e.g. "Biology") practice count in weekly/monthly reports. **It does NOT touch retention/SRS/memory/curriculum** — the row carries no topicId and no quality. The pollution is real but its blast radius is report attribution, not mastery state.
- **Recitation 60s latency tax (VERIFIED).** Because recitation is topicless (`sessionType='learning'`, no topic classification — confirmed: only subject auto-pick exists in the exchange, `session-exchange.ts` has no recitation topic resolution), the pipeline gate `(sessionType==='homework' || !topicId) && !isAbandoned` (`session-completed.ts:399`) is TRUE, so every recitation session waits the full 60s for a `filing.completed` event that never comes, then Sentry-logs a false alarm and proceeds. Pure server latency + Sentry noise, transparent to the user.
- **Recitation feeds memory (subtle, VERIFIED).** Recitation is a real session that dispatches `app/session.completed` with a transcript. The memory step (`analyze-learner-profile`) is gated only on consent+GDPR, **not** `sessionType` (`learning-path-flows.md:663` confirms the exclusion is emergent, not enforced). So recitation transcripts CAN write `learning_profiles` — an under-documented data flow.
- **Dictation review's hidden personalization (VERIFIED).** `dictation.ts:270-296` reads `learningProfiles.struggles` best-effort to theme mistake explanations. Atlas flags this as silent. It is read-only — no write-back — so it cannot compound.
- **Dictation personalization is one unfed function (VERIFIED).** The full PERSONALIZATION/LIBRARY-TOPICS prompt machinery (`generate.ts:72-108`) is dead because `fetchGenerateContext` (`result.ts:166-179`) returns only nativeLanguage+ageYears. The route (`dictation.ts:134-145`) spreads that ctx and adds only `conversationLanguage`.

### 2.3 Load-bearing vs incidental verdict
- **Load-bearing (keep):** recitation prompt block + `recitation_text` grounding + input-mode-aware feedback; dictation generation, TTS playback, prepare-homework, "Check my writing" review, `dictation_results` record. These ARE the two features.
- **Incidental (cut/fix freely):** recitation "Beta" label, text-default, subjects[0] auto-assign, 60s filing-wait; dictation two-choice fork, orphaned `/dictation/streak`. Removing any of these does not remove a capability.

---

## 3. Hypothesis audit (claims from proposed/diff docs on this cluster)

| Claim | Verdict | Evidence |
|---|---|---|
| Recitation auto-picks `subjects[0]` silently (`use-subject-classification.ts:507-521`) | **CONFIRMED** | `components/session/use-subject-classification.ts:507-521` (note: file is under `components/session/`, not `hooks/`) |
| The subjects[0] write pollutes that subject's progress via `practice_activity_events` | **CONFIRMED (scope-corrected)** | Write `session-exchange.ts:2685-2703`; pollution lands in **reports only** (`getPracticeActivitySummary` → weekly/monthly), NOT retention |
| Input defaults to `text` + SecureStore restore; BUG-357 guard at `:527` | **CONFIRMED** (guard is at `:529-530`, comment spans `:529`) | `session/index.tsx:335,340-360,529-530` |
| Voice-first seed is S-size, feedback prompt already branches on input mode (`exchange-prompts.ts:769-787`) | **CONFIRMED** | branch at `:771-774` |
| 60s topicless filing-wait applies to recitation; killable by skipping for recitation | **CONFIRMED** | gate `session-completed.ts:399` (recitation is `!topicId`); timeout `:415-439`. Skipping requires only widening the gate to exclude `effectiveMode==='recitation'` |
| Dictation personalization plumbing fully built but unfed — `generate.ts:72-108` supports it, `fetchGenerateContext` (`result.ts:178`) never populates | **CONFIRMED** — the cheapest win | schema `:41-49`, consumer `:72-108`, unfed `result.ts:166-179`, fix site `dictation.ts:134-145` |
| `text-preview.tsx:25-29` already reads `ocrText` but is unreachable; wiring is S/M | **REFUTED** | `text-preview.tsx` has NO `useLocalSearchParams` and NO `ocrText`; `text` starts `''` (`:19`). `ocrText` lives only in the homework→session flow. Wiring camera→dictation needs a NEW param read + NEW navigation, not "reuse existing" → larger than M |
| `/review` only reads struggles, no write-back; de-islanding needs a new topic-bound write | **CONFIRMED** | read-only `dictation.ts:270-296` + `review.ts:164-217`; returns mistakes, persists nothing durable beyond `mistakeCount` |
| "Check my writing" has no flag gate (`complete.tsx:399`) | **CONFIRMED** (button at `:406-411`) | unconditional |
| 3.5s countdown is silent; `COUNTDOWN_MS=3500` | **CONFIRMED** | `use-dictation-playback.ts:43` |
| Relearn→Challenge block: nothing in `session-completed.ts` resolves `needs_deepening` on relearn completion | **PARTIAL** | No relearn-specific resolver, but `updateNeedsDeepeningProgress` (`retention-data.ts:1432-1471`) DOES flip the active row to `resolved` on a later quality-bearing review (gated `completionQualityRating != null`, `session-completed.ts:847`). Block is **not permanent** — self-heals on next quality review of the topic. (Tangential to this cluster.) |

---

## 4. Current-doc corrections (`learning-path-flows.md` errors, file:line proof)

1. **`learning-path-flows.md:408` — "ocrText param exists but no in-flow nav sets it"** (re: dictation text-preview). **Wrong on both halves for dictation.** `dictation/text-preview.tsx` does not read `ocrText` at all (no `useLocalSearchParams`; `text` starts `''`, `:19`). The `ocrText` param exists only in the homework camera→session path (`homework/camera.tsx:73,548`; `session/index.tsx:152,172`). The atlas (`dictation-homework-ocr.md:194-201`) inherits the same error, asserting a "homework → dictation" `ocrText` hand-off that the code does not wire. **There is no dictation OCR path today, reachable or not.**
2. **`learning-path-flows.md:306` (Path 5) "resolution path UNVERIFIED" for relearn→Challenge block.** The resolver IS `updateNeedsDeepeningProgress` (`retention-data.ts:1432-1471`), gated on `completionQualityRating != null`. Verifiable now: the block clears on the next quality-bearing review of the topic, so it is not the permanent lock the doc implies.
3. **Brief path slip (not a doc error, for the record):** recitation subject auto-assign is in `apps/mobile/src/components/session/use-subject-classification.ts`, not `apps/mobile/src/hooks/...`.
4. **Memory-feed nuance (`learning-path-flows.md:663`)** correctly notes the learning/homework/interleaved "in practice" set is emergent, not enforced — worth making explicit that **recitation (sessionType=learning, dispatches a transcript) can feed `learning_profiles`**, since recitation is not in the "in practice" list but is structurally eligible.

---

## 5. Simplification candidates

**#1 — Feed dictation "Surprise me" personalization (populate `fetchGenerateContext`).**
- User gain: "Surprise me" stops being irrelevant-by-construction — passages theme around the kid's interests and current curriculum topics. The single highest-value-per-line change in this cluster.
- Deleted/kept: nothing deleted; populates two already-consumed fields.
- Size: **M** (server-only: load interests from profile JSONB + library topics from active `curriculum_topics` via scoped repo into `fetchGenerateContext` at `result.ts:166-179`; no prompt change — `buildInterestThemeBlock` already consumes them; no schema change; no migration).
- Classification: **SHIP-NOW.** Aligns with spec personalization ethos; no conflict.
- Risk: low. Profile-scoped reads; the prompt already sanitizes labels (`safeLabels`). Respect existing consent posture for interests (interests ride the consent-gated memory block elsewhere — gate the load on the same memory-consent check to be safe).
- Verdict: **REAL WIN.**

**#2 — Kill the 60s recitation filing-wait.**
- User gain: ~60s server latency + a false Sentry alarm removed per recitation session (transparent to user, but real infra waste + on-call noise).
- Deleted/kept: widen the gate at `session-completed.ts:399` to exclude `effectiveMode==='recitation'` (recitation never files). Nothing else changes.
- Size: **S** (read `effectiveMode` from event/metadata in the gate; recitation already carries it).
- Classification: **SHIP-NOW.** No spec conflict.
- Risk: low — recitation has no topic to file; the wait can only ever time out.
- Verdict: **REAL WIN.**

**#3 — Voice-first default for recitation (seed `voice` for `mode==='recitation'` without clobbering the global pref).**
- User gain: first-timer lands in the voice experience and discovers pace/expression feedback — the actual point of recitation. Falls back to the stored pref if the user previously chose text.
- Deleted/kept: add a recitation-scoped initial `inputMode='voice'` that does not write the global SecureStore key (respect BUG-357 guard at `session/index.tsx:529-530`).
- Size: **S**.
- Classification: **SHIP-NOW**, **with one CONFLICTS caveat** — see compliance note below.
- Risk: **compliance wording.** The voice feedback branch instructs the LLM to "comment briefly on delivery: **pace, confidence, expression**" (`exchange-prompts.ts:771-774`). Input is STT-transcribed before the LLM (no audio reaches the model), so (a) the LLM can't actually observe pace/expression from text → hallucination risk, and (b) "confidence"/"expression" lean toward affect/emotion characterization, brushing the spec's AI Act Art 5(1)(f) invariant ("voice is transcription-only, never tone/emotion analysis"). Promoting voice as the default *amplifies* exposure to this wording. **Recommend pairing #3 with a wording fix**: scope voice feedback to objectively-transcribable signals (fluency, pauses, completeness vs the text) and drop "confidence/expression," OR keep voice opt-in until the wording is corrected.
- Verdict: **CONDITIONAL** (real UX win, gated on the prompt-wording fix to stay inside the spec's voice invariant).

**#4 — Collapse the dictation two-choice entry to one primary "Start dictation" (personalized generate), demote "Use my own text" to secondary.**
- User gain: one tap to a (now personalized, post-#1) dictation; removes a fork the user shouldn't have to reason about.
- Deleted/kept: keep both paths; reorder/restyle `dictation/index.tsx:213-224`.
- Size: **S**.
- Classification: **SHIP-NOW** (or fold into the Practice-Hub rework, diff doc §"Practice Hub" / spec is silent on intra-Practice layout).
- Risk: low.
- Verdict: **REAL WIN** (small), best sequenced after #1 so the primary CTA is actually worth defaulting to.

**#5 — Drop recitation's subjects[0] auto-assign (use a synthetic/no-subject bucket).**
- User gain: a recited poem stops inflating "Biology" practice counts in parent/self reports.
- Deleted/kept: remove the auto-pick (`use-subject-classification.ts:507-521`); allow null `subjectId` on recitation sessions; the `practice_activity_events` write (`session-exchange.ts:2685-2703`) must tolerate null subjectId (or write a synthetic "Practice" bucket).
- Size: **M** (null-subject tolerance across the exchange + report breakdown; **L** if a synthetic-subject row + migration is chosen). Report reader `getPracticeActivitySummary` groups by subjectId/subjectName — must handle null gracefully.
- Classification: **SHIP-NOW**, but **low priority** — blast radius is report attribution only (no mastery/retention corruption), so the harm is cosmetic.
- Risk: medium (touches a report aggregate; needs the null-subject path tested).
- Verdict: **CONDITIONAL** (correct, but lowest urgency in the cluster — fix only if recitation usage is non-trivial; otherwise the report noise is tolerable).

**#6 — Drop the "Beta" label on recitation.**
- User gain: removes the "might break" signal for a nervous learner.
- Size: **S** (copy + prompt header `exchange-prompts.ts:776`).
- Classification: SHIP-NOW (product call — only if the team considers recitation stable).
- Verdict: **REAL WIN** (trivial), contingent on a stability judgment.

**#7 — De-island dictation: write `/review` mistakes into the shared retention/struggles store.**
- User gain (claimed): dictation effort compounds into the retention loop instead of evaporating.
- Deleted/kept: requires a NEW topic anchor for spelling/grammar mistakes + a NEW write path (Inngest or scoped write) into `retention_cards`/`needs_deepening`/struggles.
- Size: **L+**.
- Classification: **CONFLICTS / SPEC-ABSORBED (§8.3, S0-R).** The spec is mid-refactor of the retention write-side: §8.3 unifies **~9-10 existing `retention_cards` writers across 7 files** into a single new `applyRetentionUpdate()` chokepoint, shipping on its own S0-R track with break-tests + rollback. **Dictation is not among those writers** (it has no topic anchor). Adding a brand-new dictation→retention writer *now* would (a) require inventing the topic anchor that doesn't exist, and (b) add an N+1 writer to the exact set being collapsed — guaranteeing rework and merge risk against S0-R.
- Risk: high (touches core SRS mid-refactor).
- Verdict: **MIRAGE (now).** The valuable end-state ("dictation counts toward something") is *already half-served*: dictation writes `practice_activity_events`, which is precisely the activity-ledger shape the spec is formalizing in §8.2. If anything, route dictation through the §8.2 ledger, not the SRS core. Defer any retention write until after S0-R lands and `applyRetentionUpdate()` exists; then it's a single-chokepoint add instead of an 11th parallel writer.

**#8 — Camera-first "Use my own text" for dictation (wire `ocrText`).**
- User gain: snap a worksheet instead of hand-typing.
- Size: **M-L** (NOT the S/M the diff doc claims — there is no existing `ocrText` reader in `text-preview.tsx` to "reuse"; needs a new param read + new camera→dictation navigation; reuses homework OCR infra).
- Classification: SHIP-NOW-eligible but lower ROI than #1/#2/#4.
- Verdict: **CONDITIONAL** (nice-to-have; the size is understated in the source docs).

---

## 6. Bottom line

**Scores (1=park/fold, 5=keep & invest):**
- **Path 6 — Recitation: 2.5.** A thin in-session prompt override (one feature = one prompt block) wearing three avoidable warts (Beta label, text-default, subjects[0] + 60s tax). Low maintenance weight (no own tables — it rides the session pipeline), but also low integration value: its only durable output is report-only `practice_activity_events`, and that output is mis-attributed. Not worth *folding* (cost to keep is near-zero), but not worth *promoting* either. Keep as a quiet `pedagogy=verbatim` derivation under the future `tutor` mode (diff doc §Mode taxonomy) rather than a top-level Beta tile.
- **Path 8 — Dictation: 3.5.** Genuinely useful standalone activity (own tables, real review loop, TTS) with the single cheapest personalization win in the whole review sitting unfed one function away. Worth keeping and investing the M-sized personalization fix. Its "island" status is *fine* — it already writes the activity ledger the spec is formalizing; forcing it into the SRS core is the trap.

**Highest-value move:** **#1 — populate `fetchGenerateContext` (dictation personalization).** M-size, server-only, no schema/prompt/migration, turns "Surprise me" from generic-by-construction into curriculum/interest-aware. Best ROI per line in the cluster. Pair it with **#2 (kill recitation's 60s wait, S)** as a free infra-hygiene win in the same PR-window.

**The one thing that must NOT be simplified away:** the **input-mode-aware feedback gating in the recitation prompt** (`exchange-prompts.ts:771-774`) and the `recitation_text` grounding source (`:439`). The text branch's explicit "do NOT claim to hear pace, confidence, expression, pronunciation, or delivery" is the guard that keeps a text-mode recitation from hallucinating audio it never received — and is the seam where the AI Act voice invariant lives. Any voice-first push (#3) must *tighten* this wording, never remove or loosen it. Equally, do **not** "de-island" dictation into the retention core (#7) ahead of the spec's S0-R `applyRetentionUpdate()` refactor — that's a MIRAGE that adds an 11th writer to a write-set mid-collapse.

---
**[ BOTTOM LINE ]** Dictation is the keeper (3.5) — one unfed function from real personalization; Recitation is a thin keep-but-don't-promote (2.5) carrying three cheap-to-remove warts; "de-islanding dictation into retention" is a MIRAGE that fights the spec's S0-R retention-writer refactor.

**[ FYI ]**
- Two source-doc errors found: `text-preview.tsx` has NO `ocrText` reader (no dictation OCR path exists at all) — refutes flows-doc `:408` + atlas `:194-201`; and the relearn→Challenge block is not permanent (self-heals via `updateNeedsDeepeningProgress`, `retention-data.ts:1432-1471`).
- Recitation subjects[0] pollution is real but bounded to **report attribution** (`practice_activity_events` → weekly/monthly), never retention/SRS/memory.
- Recitation transcripts can feed `learning_profiles` (memory step is consent-gated, not sessionType-gated) — under-documented.

**[ ACTIONS ]**
1. Ship **#1** (populate `fetchGenerateContext`, M, server-only) + **#2** (kill 60s recitation filing-wait, S) together — highest ROI, no spec conflict.
2. If pursuing voice-first recitation (#3), **first** fix the `exchange-prompts.ts:771-774` voice wording ("confidence/expression" → transcribable signals) to stay inside the AI Act Art 5(1)(f) voice invariant.

**[ DECISIONS ]**
1. De-islanding dictation into retention (#7): recommend **DEFER until after S0-R** — route through the §8.2 activity ledger (already half-built) rather than adding an 11th `retention_cards` writer mid-refactor.
