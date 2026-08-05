# WI-2919 — Memory-claim copy audit (launch/store + in-app)

**Status:** Audit complete, 2026-08-04. Agent-executed under WI-2919.
**Disposition:** §7 open item 1 answered by a **provisional** operator ruling of
2026-08-05 — **provisional pending DPO ratification (OPQ-169)**, not final, not
ratified, not a compliance sign-off. See §0 before reading §1.
**Purpose:** Audit user-facing copy for cross-session memory / "remembers you" /
personalization claims while persistent memory is parked under the DPO interim
condition, so the launch screen record can cite a surface-by-surface result.
**Exposure driving the audit:** NY GBL Art 47 prong (i) — a launch-visible claim
that the product remembers the user across sessions.
**Method:** direct read of every named surface; `jq` enumeration across all 7 shipped
UI locales — **by string value over every scalar**, after a namespace-scoped first
pass proved incomplete (§3 coverage correction, §4.1b); code-path trace of the read,
write, and injection paths that determine whether each string can render and whether
the claim it makes is true.

> **Supersedes the premise of** [`2026-07-30-memory-disclosure-copy-inventory.md`](2026-07-30-memory-disclosure-copy-inventory.md).
> That inventory stated the feature is "inert because the server never returns
> memory reads while the flag is off." Section 2 below shows that is not what the
> code does. The inventory's surface list remains useful; its gate premise does not.

---

## 0. Provisional operator ruling of 2026-08-05 — read before §1

> **PROVISIONAL, NOT RATIFIED.** On 2026-08-05, after this audit was completed, the
> operator ruled **provisionally** that the DPO interim persistent-memory-parked
> condition is **satisfied by the per-profile fail-closed consent gating as built** —
> the gating described in §2.3 and §2.3b — and that no global kill-switch is required
> at this time. The operator explicitly accepted the rework risk if the ruling is
> later overturned.
>
> **This ruling is provisional pending DPO ratification, which is in flight as
> OPQ-169.** It is an operator decision, not a DPO determination, not counsel review,
> and not a compliance sign-off. Until OPQ-169 concludes, nothing in this document
> may be cited by the launch-screen record as a settled compliance position.
>
> **What the ruling does and does not change.** It answers §7 open item 1 —
> provisionally. It changes **nothing** in the code findings below: §2 remains an
> accurate description of what the runtime does, and `MEMORY_FACTS_READ_ENABLED`
> remains a storage-backend selector rather than a kill-switch. What changed is the
> **disposition** of that state, not the state. §7 items 2–3 are therefore retained
> in full: they state what a genuine park would require, and they become live again
> if the DPO overturns the ruling.

---

## 1. Two headline findings

> _Read with §0._ Finding 1 records that no global gate exists in code — which is
> still true. Under the provisional operator ruling of 2026-08-05, that absence is
> provisionally accepted rather than treated as an open defect, pending DPO
> ratification (OPQ-169).

**Finding 1 — the parked state is not implemented in code.**
`MEMORY_FACTS_READ_ENABLED` is a **storage-backend selector**, not a feature
kill-switch. Persistent memory read, write, and injection paths are all live at
launch, gated only by per-profile user consent. Evidence in §2.

**Finding 2 — because memory genuinely operates, the in-app copy is accurate.**
The prong-(i) exposure from copy is therefore **low**, and the disposition
"reword to session-scoped phrasing" is **actively contraindicated**: it would
understate real processing and create a GDPR Art 13/14 transparency defect while
contradicting the app's own privacy policy. No strings were reworded. Reasoning
in §6.

The material compliance gap this audit surfaces is not the copy. It is that the
DPO interim condition — *"persistent memory + profiling stay disabled until legal
basis/controls/transparency/retention approved"* — has **no implementing gate**.

---

## 2. Gate-state evidence (why "unreachable" is unavailable as a disposition)

The AC permits a disposition of "verified unreachable behind the disabled
persistent-memory feature (with the gate named)." That disposition is
**unavailable for every hit in this audit**, because no such gate exists. Each
claim below is a direct code read.

### 2.1 The flag selects a storage backend; it does not disable memory

`apps/api/src/config.ts` declares `MEMORY_FACTS_READ_ENABLED`,
`MEMORY_FACTS_RELEVANCE_RETRIEVAL`, `MEMORY_FACTS_DEDUP_ENABLED` in its env schema,
all defaulting `'false'`. (Cited by symbol rather than line: these sat at 135-137
when this audit was run and had drifted to 151-153 within a day, so a line range
here would go stale faster than the finding it supports.) What `false` actually
does:

```text
apps/api/src/services/memory/projection.ts:290-293
  const useFacts = options?.memoryFactsReadEnabled && hasMemoryFactsMarker(row);
  if (!useFacts) {
    return buildProjectionFromRow(row);
  }
```

With the flag off, the projection falls back to `buildProjectionFromRow(row)`,
which sources the memory arrays (`interests`, `strengths`, `struggles`,
`communicationNotes`) from the **JSONB columns on `learning_profiles`**. The
module docstring states this outright (`projection.ts:43-45`): the arrays "may
come from the JSONB columns on `learning_profiles` or from the normalised
`memory_facts` table, depending on the `MEMORY_FACTS_READ_ENABLED` flag."

The flag chooses *which store to read from*. Neither branch returns empty.

### 2.2 Write paths are live and carry no parked-state gate

- **User-authored ("Tell Your Mentor").** `POST /learner-profile/tell`
  (`apps/api/src/routes/learner-profile.ts:339-357`) → `parseLearnerInput`
  (`apps/api/src/services/learner-input.ts:233`) → `applyAnalysis`, which
  persists. Its guards are proxy-mode (`assertNotProxyMode`) and LLM consent
  (`assertLlmConsent`) — neither is a memory-parked gate. The owner-gated
  parent variant `POST /learner-profile/:profileId/tell` behaves the same.
- **Automatic extraction.** `apps/api/src/inngest/functions/topic-probe-extract.ts:418`
  triggers on `app/topic-probe.requested`, which **is** dispatched from
  production code at `apps/api/src/services/session/session-exchange.ts:2251`.
  No memory flag appears anywhere in that function.

### 2.3 LLM injection is gated on user consent only

```text
apps/api/src/services/curated-memory.ts:196-200
  // [F-PV-09] Gate injection on consent — if consent is not granted,
  // injection must be off regardless of the DB flag.
  injectionEnabled:
    profile.memoryConsentStatus === 'granted' &&
    (profile.memoryInjectionEnabled ?? true),
```

The only gate on memory reaching the model is **per-profile consent**. There is
no global, environment, or launch-state condition.

### 2.3b The live prompt-injection path also falls back to JSONB

`MEMORY_FACTS_RELEVANCE_RETRIEVAL` (`config.ts`, §2.1) is a **sub-flag** of the read
flag, not an independent gate — `routes/sessions.ts:521-523` computes
`memoryFactsRelevanceEnabled = memoryFactsReadEnabled && isMemoryFactsRelevanceEnabled(...)`.
Both being `false` does **not** withhold memory from the model. In
`apps/api/src/services/session/session-exchange.ts:3584-3615`, the two flags only
choose *which store and retrieval strategy* populate `memorySnapshot`:

- relevance on + backfill marker → `getRelevantMemories(...)` (vector relevance over `memory_facts`);
- else read on + backfill marker → `readMemorySnapshotFromFacts(...)` (full read of `memory_facts`);
- **else `memorySnapshot` stays `null`.**

A null snapshot is not an empty memory block. `buildMemoryBlock`
(`session-exchange.ts:3617-3640`) falls through on every field to the
`learning_profiles` JSONB columns:

```ts
interests: memorySnapshot
  ? memorySnapshot.interests
  : Array.isArray(learningProfile.interests)
    ? learningProfile.interests
    : [],
```

…and identically for `strengths`, `struggles`, and `communicationNotes`. With both
flags off — the shipped default — the learner's persisted memory is injected into
the live session prompt from the JSONB store. The only values `buildMemoryBlock`
receives that can suppress it are `memoryEnabled`, `memoryInjectionEnabled`, and
`memoryConsentStatus` (`session-exchange.ts:3641-3643`) — i.e. **per-profile
consent**, matching §2.3. This is the most direct evidence in this audit that
memory is live: it is the production prompt-assembly path, not a settings read.

### 2.4 The UI entry point is ungated

The "Mentor memory" row in the More tab renders unconditionally — no feature
flag, no conditional wrapper:

```text
apps/mobile/src/app/(app)/more/index.tsx:135-141
  <SettingsRow
    label={t('more.mentorMemory.sectionHeader')}
    onPress={() => router.push('/(app)/mentor-memory?returnTo=more' as Href)}
    testID="more-row-mentor-memory"
  />
```

The mentor-memory screen does call `useEntryGate('mentor-memory')`
(`apps/mobile/src/app/(app)/mentor-memory.tsx:250`), but that is a **navigation**
gate, not a memory gate: `computeEntryGateBlocked`
(`apps/mobile/src/hooks/use-entry-gate.ts`) resolves to `!contract.canEnter(...)`
or `contract.isParentProxy`. It blocks parent-proxy and non-enterable routes. It
has no relationship to memory state.

The consent prompt — the strongest claim in the app — renders for any owner whose
consent is still pending, i.e. **every new user at launch**:
`mentor-memory.tsx:434-438`, `consentStatus === 'pending' && isOwnerSelf`.

---

## 3. Surface-by-surface result (every surface named in the AC)

| # | Surface (as named in AC) | Exists? | Hits | Result |
|---|---|---|---|---|
| 1a | `docs/screenshots_and_store_info/store description.md` | Yes | 3 | **Not launch-visible** — superseded |
| 1b | `docs/screenshots_and_store_info/google-play/*` | Yes | 2 docs | listing-copy clean; data-safety declares personalization |
| 1c | `app-privacy-data-safety-worksheet.md` | Yes | 2 | Declares personalization — see §5 |
| 1d | `reviewer-notes-draft.md` | Yes | 0 | **Checked, clean** |
| 1e | `store-compliance-checklist.md` | Yes | 0 product hits | **Checked, clean** (one false positive, §4.3) |
| 2 | `apps/mobile/src/i18n/locales/*.json` | Yes — 7 locales | 67 keys × 7 in the three memory namespaces (§4.1) **plus 62 keys × 7 in ten further namespaces (§4.1b)** | **Live, renderable, accurate** |
| 3 | Repo-wide sweep for memory/remember/personalize phrasing | — | see §4 | Legal/policy copy + screened set |

Every surface named in the AC exists, and each was read.

> **Coverage correction, 2026-08-05.** This section previously read "None was
> skipped." That was **wrong as recorded**, and the correction is the substance of
> §4.1b. The locale sweep behind row 2 was **namespace-scoped** — it enumerated keys
> under the three `mentorMemory` / `tellMentor` namespaces and reported the result as
> if it were exhaustive. Independent review named four live memory-claim keys outside
> those namespaces; re-running the sweep **by string value across every scalar in the
> locale files**, rather than by namespace, found ten further namespaces carrying
> user-visible memory copy that this audit had not dispositioned. They are
> dispositioned in §4.1b.
>
> The dispositions did not change — every one of them lands where §4.1 landed, for
> the reason §6 gives. What changed is the **coverage claim**, and in a document the
> launch-screen record cites, a coverage claim that overstates its own reach is the
> defect regardless of whether the conclusion survives. A namespace-scoped sweep
> reported as complete is a universal quantifier asserted over a set nobody
> enumerated.

---

## 4. Hit register and dispositions

### 4.1 In-app cross-session memory claims — **LIVE, ACCURATE, RETAINED**

Namespace key counts, verified identical across **all 7 shipped UI locales**
(`en, de, es, ja, nb, pl, pt`) by `jq` key enumeration — a claim surviving in one
locale ships in all:

| Namespace | Keys per locale | Parity |
|---|---|---|
| `session.mentorMemory.*` | 56 | 7/7 identical |
| `session.tellMentor.*` | 10 | 7/7 identical |
| `more.mentorMemory.*` | 1 | 7/7 identical |

**Total: 67 keys × 7 locales.** No locale escapes; no locale carries an orphaned
variant the others dropped.

The strongest claims, all in `apps/mobile/src/i18n/locales/en.json`:

| Key | Copy (en) | Renders at launch? |
|---|---|---|
| `more.mentorMemory.sectionHeader` | "Mentor memory" | Yes — ungated More row, `more/index.tsx:136` |
| `session.mentorMemory.consent.title` | "Let your mentor remember what helps" | Yes — pending-consent owners, `mentor-memory.tsx:434-437` |
| `session.mentorMemory.consent.description` | "Let the mentor remember what works for you — your strengths, preferred explanations, and topics you find tricky." | Yes — same gate |
| `session.mentorMemory.title` | "What your mentor knows about you." | Yes |
| `session.mentorMemory.status.enabled` | "Your mentor can remember helpful learning notes." | Yes — consent granted |
| `session.mentorMemory.empty.title` | "Your mentor is getting to know you" | Yes |
| `session.mentorMemory.empty.message` | "As you study, your mentor will learn about your interests, strengths, and how you like to learn. Everything will appear here over time." | Yes — forward-looking cross-session promise |
| `session.tellMentor.adult.description` | "Add something you want your mentor to remember for future sessions." | Yes — explicit cross-session claim |
| `session.tellMentor.parent.description` | "Add something important for the mentor to remember about this child." | Yes |

**Disposition: RETAINED, unmodified.** Not removed, not reworded, and explicitly
**not** "unreachable" — §2 shows there is no gate to hide behind. These strings
make cross-session memory claims that the system genuinely performs (§2.2, §2.3),
so they are accurate disclosures. Rewording them is contraindicated (§6).

### 4.1b Memory claims OUTSIDE the three namespaces — **added 2026-08-05, LIVE, ACCURATE, RETAINED**

Added after independent review found the §4.1 sweep was namespace-scoped and had
recorded itself as complete. The sweep was re-run **by string value over every
scalar in the locale files** — matching `remember`, `memory`, `personali[sz]`,
`picks up where`, `knows about you` — which is the enumeration that licenses a
coverage claim; a namespace list is not.

Ten further namespaces carry user-visible memory copy. **62 keys per locale**,
counted the same way as §4.1. Every render site below was opened, not inferred:

| Namespace | Strongest claim (en) | Renders from |
|---|---|---|
| `welcomeIntro.*` | **"Remembers you, picks up where you left off"** and "Create a free account so your mentor can remember your subjects, notes, and progress." | `components/welcome/WelcomeIntro.tsx` and `app/(auth)/welcome.tsx` |
| `parentView.mentorMemory.*` | "Allow the mentor to build a memory of your child's strengths and focus areas"; "Saved — the mentor will remember this" | `app/(app)/child/[profileId]/mentor-memory.tsx` |
| `parentView.index.*` | "Manage what the mentor remembers about {{name}}" | same parent surface |
| `memoryConsent.*` | "This lets the mentor remember what kinds of explanations work, what is still tricky, and which examples feel relevant." | `components/memory-consent-prompt.tsx` |
| `journal.*` (memory + sections + trust) | "Review, edit, hide, export, or clear what your mentor remembers from the full memory screen."; "Your private learning trail: saved moments, notes, reports, and mentor memory." | `components/journal/JournalTabView.tsx`, `JournalSegmentedControl.tsx` |
| `tabs.previewSampleCoaching.*` | "Your mentor remembers what you know and adjusts to your pace" | `app/(app)/_components/PreviewSampleCoaching.tsx` |
| `sessionSummary.mentorMemoryCue.*` | "What your mentor knows about you." | `app/session-summary/[sessionId].tsx` |
| `mentorHome.coldStart.*` | "I'll remember what you write here so the next step starts closer to you." | `app/(app)/session/index.tsx` |
| `supportHub.journal.*` | "Private chats, notes, and mentor memory are not shown here." | `components/support/SupportHubJournalTab.tsx`, `PersonScopeJournalPlaceholder.tsx` |
| `guardian.*` | "Could not enable memory" | parent mentor-memory surface |

**The welcome-intro headline is the one that matters most for the exposure this
audit was commissioned to find.** "Remembers you, picks up where you left off" is a
cross-session memory claim on one of the earliest screens a user sees, and the
account-bridge line makes the same promise **before an account exists**. Both are
squarely inside the NY GBL Art 47 prong (i) surface named at the head of this
document, and neither had a disposition until now.

**Disposition: RETAINED, unmodified — identical to §4.1 and for the same reason.**
The system genuinely performs cross-session memory (§2.2, §2.3, §2.3b), so these are
accurate disclosures; rewording them would understate real processing (§6). Nothing
here changes the conclusion. What it changes is that the conclusion now rests on an
enumeration instead of a namespace filter.

**Locale parity, measured rather than asserted.** Six of the seven locales carry all
62 keys. Polish carries 64. The two extra are `_few` and `_many` plural forms on an
attempt-count string — ordinary Polish pluralization, **not** an orphaned memory
claim that escaped the other locales. Recorded as measured; parity is intact.

**Not re-screened here.** The learner-recall class (§4.4) and the legal/policy class
(§4.2) both reappear in a value-matched sweep and are unchanged — the exclusions in
§4.4 remain correct, because they concern the learner recalling material rather than
the product remembering the person.

### 4.2 Legal / policy copy — **ACCURATE, RETAINED**

In `en.json`, describing persistent memory as active processing:

- `legal.privacy.s2Body2` — "Some of this data builds a persistent learning memory
  so the tutor can remember what you have already studied."
- `legal.privacy.s8Body2` — "Learning memory: summaries of what you have studied…
  are kept while your account is active so the tutor can remember your learning
  over time. This learning memory is used only to provide tutoring continuity; it
  is not used for advertising, marketing profiles, or training third-party AI models."
- `legal.privacy.s3Body` — "We use your data to provide personalised AI tutoring…
  This profiling is used only to personalise your teaching."
- `legal.privacy.s5Body` — display-name personalization for adult owners.
- `legal.privacy.s6Body2` — providers "for learning responses and learning memory".
- `legal.terms.s2Body` — "personalised learning".

**Disposition: RETAINED.** These are consistent with the live system state
established in §2. They are the reason rewording the UI copy would produce an
internal contradiction inside a single app build.

### 4.3 Store surfaces

| Surface | Hits | Disposition |
|---|---|---|
| `store description.md` | "AI coach that adapts to you"; "boost long-term memory"; "Personalize your experience with analogy preferences" | **NOT LAUNCH-VISIBLE.** Its own header (lines 1-4) reads "SUPERSEDED FOR GOOGLE PLAY… retained for provenance and contains claims that are not approved for submission." Superseded by `google-play/2026-07-30/listing-copy.md`. This is a supersession call, **not** a gate-based unreachability call. No edit made. |
| `google-play/2026-07-30/listing-copy.md` | 0 | **CLEAN.** No memory/personalization claim. Its "Copy guardrails" section already excludes "guaranteed or 'optimal' learning/memory outcomes". The nearest line — "Return to subjects, notes, and saved learning in one place" — refers to user-created artifacts, not a claim that the app remembers the learner. |
| `reviewer-notes-draft.md` | 0 | **CLEAN** — checked explicitly, no memory/personalization phrasing. |
| `store-compliance-checklist.md` | 0 product hits | **CLEAN.** Sole regex match (line 22) is a path reference to `.claude/memory/*.md` agent-memory files — repo tooling, not product copy. False positive. |

### 4.4 Screened and excluded — learner's memory of content, not app's memory of learner

Matched the sweep regex; **out of scope** because they concern the learner
recalling material (spaced repetition / retrieval practice), not the product
remembering the person. Listed so the exclusion is auditable rather than silent:

`topic.recallTest.*` (recall check, "Test your memory", "I don't remember"),
`practiceHub.review.memoryBoost`, `practiceHub.recitation.*` ("Recite from
memory"), `practiceHub.subtitle` ("helps your memory stick"),
`library.retentionPill.a11y*` ("Memory check"), `progress.recallQueue.*`,
`progress.register.adult.retentionStrong`, `assessment.*` ("examples you
remember"), `session.notePrompt.summaryPlaceholder` and
`session.parkingLot.placeholder` (user-authored session artifacts).

### 4.5 Borderline — cross-session continuity, not memory-facts

Called **in scope, low exposure, retained**; recorded rather than dropped:

| Key | Copy | Reason |
|---|---|---|
| `home.parent.card.quietWithFocus` | "{{name}} had a quieter week — last time the focus was {{focus}}." | Genuine cross-session continuity, but derived from session/progress records, not the memory-facts subsystem. Reports observed activity; makes no "remembers you" claim. |
| `home.parent.tonight.promptFallback` | "What felt easier this week than last time?" | Same — a prompt referencing elapsed time, not a memory claim. |
| `quiz.index.vocabPersonalisedTitle` / `vocabStarterSubtitle` | "record {{threshold}} of your own to unlock personalised rounds" | "Personalised" here means built from the learner's own recorded vocabulary items — a user-created artifact, not inferred profiling. |

---

## 5. Data-safety declaration consistency check

The AC requires checking data-safety declarations claiming personalization
against the parked state.

| Document | Declaration | Consistency |
|---|---|---|
| `app-privacy-data-safety-worksheet.md:44` | Name/display name "Used for app functionality and personalization." | Consistent with **live** state (§2); **inconsistent** with the DPO parked condition. |
| `app-privacy-data-safety-worksheet.md:48` | Learning content "Used for app functionality, progress tracking, personalization, and AI tutoring" — explicitly lists `learning profiles` among exported tables. | Same. |
| `google-play/2026-07-30/data-safety-content-rating.md:55` | Messages/UGC — "App functionality, personalisation within approved gates". | Same. The phrase "within approved gates" implies a gate that §2 shows does not exist in code. |
| `google-play/2026-07-30/data-safety-content-rating.md:56` | App activity — "App functionality, analytics, personalisation, account management". | Same. |

**Result:** the data-safety declarations are **accurate to the shipped system**
and are **not** the source of prong-(i) exposure. They are, however, direct
documentary evidence that personalization/profiling is declared active — which
is what makes Finding 1 a live compliance gap rather than a copy problem. No
edits made; these declarations should not be weakened to match a parked state
that is not implemented.

---

## 6. Why no copy was reworded

The AC offers "reworded to session-scoped phrasing" as a disposition. It was
deliberately **not** exercised. Reasons, in order of weight:

1. **It would be false.** §2 establishes that cross-session memory reads, writes,
   and consent-gated injection all operate at launch. Session-scoped phrasing
   would understate real processing — a GDPR Art 13/14 transparency defect, i.e.
   a second violation introduced to paper over the first.
2. **It would contradict the app's own privacy policy.** `legal.privacy.s8Body2`
   and `s2Body2` describe persistent learning memory in the same build. UI copy
   saying session-scoped and policy copy saying persistent is an internal
   contradiction that would itself be a finding.
3. **It is not an executor's call.** Copy wording under a live DPO interim
   condition is a DPO/product decision. A 67-key × 7-locale rewrite of consent
   copy is precisely the change that must be ruled before it is written.

Consequently **no `t()` keys were added, changed, or removed, and no `en.json`
edit was made** — so no i18n CI gate (orphan-key checker, hardcoded-JSX-literal
ratchet) was triggered or required. This change is documentation-only.

**Honest statement against the AC's outcome-level "done":** the AC defines done as
*"no launch-visible copy promises cross-session memory or personalization while
the DPO interim condition holds."* That outcome is **not reached, and cannot be
reached by copy edits**, because the condition it presupposes — that persistent
memory is parked — does not hold in code. Launch-visible copy does promise
cross-session memory (§4.1), and it is telling the truth. Closing the gap
requires a ruling on the feature state, not a rewrite of the strings.

---

## 7. Open items for the DPO / launch screen

1. ~~**Rule the actual feature state.**~~ **ANSWERED PROVISIONALLY — operator ruling
   of 2026-08-05 (see §0).** The original item read: *either implement a real
   kill-switch honoring the interim condition (no gate exists today — §2), or record
   a decision that persistent memory ships consent-gated and lift the interim
   condition; the present state satisfies neither.* The operator took the second
   branch **provisionally**: persistent memory ships consent-gated, and the interim
   parked condition is provisionally ruled satisfied by that per-profile fail-closed
   consent gating. **This is provisional pending DPO ratification (OPQ-169)** and is
   not a ratified or final position; the rework risk was explicitly accepted at
   operator level. Item 2 below states what must happen if the DPO overturns it.
2. **If memory is to be genuinely parked**, the gate must cover all three paths —
   read (`projection.ts:290`), write (`learner-input.ts:233` and
   `topic-probe-extract.ts:418`), and prompt injection (`session-exchange.ts:3617-3643`,
   `curated-memory.ts:196-200`). Flipping `MEMORY_FACTS_READ_ENABLED` **and**
   `MEMORY_FACTS_RELEVANCE_RETRIEVAL` does none of these: both are
   `memory_facts`-store selectors, and with both off the prompt-assembly path
   falls back to the `learning_profiles` JSONB columns (§2.3b). A real park needs
   a gate on the fallback itself, not on the store selectors.
3. **Only after (1)** should UI copy be revisited. If the feature is parked, the
   67-key set in §4.1 **and the 62-key set in §4.1b** need a DPO-ruled rewrite
   across 7 locales — 129 keys per locale, not 67 — and the privacy
   policy strings in §4.2 must move in the same change-set.
4. **`store description.md`** is superseded but still in-tree with unapproved
   claims. Consider archiving it to remove the footgun; not done here as it is
   out of this WI's scope and is a cross-lane file.

---

## 8. Scope note

This audit made **no code or copy changes**. It adds this note only.
`docs/compliance/README.md` was deliberately not modified (cross-lane conflict
magnet); if an index entry is wanted, it should be added by the owning lane.
