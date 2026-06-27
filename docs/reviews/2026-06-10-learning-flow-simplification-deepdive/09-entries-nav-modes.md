# Entry Surfaces, Navigation & Practice Hub: Deep-Dive

> **STATUS (2026-06-27):** Partial — C1 (locked Assessment row fix) done; C2 (subject carousel destination) partial; C3 (Relearn entry scatter) and C4 (Practice hub de-scatter) unverified.

> Cluster scope: Home/LearnerScreen entry surfaces (quick actions, CoachBand, subject carousel), the Practice hub, the Library-vs-progress double destination, the V0/V1 nav contracts + flag states + `canEnter`/`FULL_SCREEN_ROUTES`, and the per-flow entry-point scatter (Relearn×4, Quiz×3, Path-0×3) · Analyst: nav · Date 2026-06-10 · Sources verified at HEAD of `new-llm`

**Adjudication headline (the one the brief asked first):** the proposed doc's §1 — promote Practice to a **4th learner tab** (Learn/Practice/Library/Progress) and fold More into an avatar menu — **CONFLICTS-WITH-SPEC**. The ratified `mentor-is-the-app` spec (§3, §7, §15.3) rules **three tabs** (Mentor/Subjects/Journal), kills the Library *tab* (search-first archive moves into Subjects/Journal), moves More behind the avatar, and replaces `LearnerScreen`/`ParentHomeScreen` with the Mentor feed. Building a 4th learner tab in the current shell is **dead work**: S1 (`MODE_NAV_V2_ENABLED`) replaces the home surface wholesale, and the spec explicitly bans new destination screens (P2/§7). The salvageable kernel of proposed §1 is the **de-scatter intent** (one canonical entry per verb, deep-links land inside it), which survives because S1 also routes everything through the feed + a closed route catalog — but the *mechanism* is the feed, not a Practice tab.

---

## 1. Feature inventory (verified)

| Surface / contract | What it does | Status | Load-bearing? (why) | Evidence |
|---|---|---|---|---|
| `STUDY_TABS` (learner shell) | `home, library, progress, more` (4 tabs) | prod-active (default learner) | **Load-bearing** — the canonical learner shell on every flag state | VERIFIED `navigation-contract.ts:145-150` |
| `FAMILY_TABS` (V1 guardian) | `home, recaps, progress, more` (4) | flag-gated (V1 on) | Load-bearing on V1 dev/preview/staging | VERIFIED `navigation-contract.ts:151-156` |
| `PROXY_TABS` | `home, library, progress` (3, no `more`) | prod-active (proxy) | Load-bearing — proxy chrome | VERIFIED `navigation-contract.ts:157-161` |
| `LEGACY_GUARDIAN_TABS` (V0/flags-off guardian) | `home, own-learning, library, progress, more` (5) | **prod default for owner+children** | **HARD CONSTRAINT — must not regress** (spec §7) | VERIFIED `navigation-contract.ts:162-168`, branch `:272-282` |
| `LEARNER_TABS` (legacy V0 helper) | `home, library, progress, more` (4) | V0-path only | Incidental — V0 mode helpers; **DOES exist** (diff doc wrongly denied this) | VERIFIED `legacy-navigation-contract.ts:12-17` |
| `GUARDIAN/FAMILY_MODE/STUDY_MODE_TABS` (legacy) | V0 mode-driven sets (5/3/4) | V0-path only | Incidental — only on V0 mode switch | VERIFIED `legacy-navigation-contract.ts:4-36` |
| `TabKey` enum | `home, own-learning, library, recaps, progress, more` — **no `practice`** | — | Load-bearing — proves Practice is NOT a tab today | VERIFIED `navigation-contract.ts:13-19` |
| `LEARNING_ROUTES` (incl. `practice`) | `canEnter` gate set: `familyShape ? ownerRole : true` | prod-active | Load-bearing — the single learning-route gate | VERIFIED `navigation-contract.ts:170-179, 407-409` |
| `canEnter(route, params)` | Single gate; proxy → only home/library/progress; family-child rules; learning routes owner-gated in family | prod-active | **Load-bearing** — every learning entry passes through it (V1); V0 falls back to proxy-only block | VERIFIED `navigation-contract.ts:388-435` |
| `FULL_SCREEN_ROUTES` (incl. `practice`) | Collapses tab bar to height 0 for immersive screens | prod-active | Load-bearing — `practice` added here (Bug 770) so it renders full-screen, **not** as a tab | VERIFIED `_layout.tsx:60-70` |
| `home.tsx:161` branch | `home.screen==='FamilyHome' ? ParentHomeScreen : LearnerScreen(showParentHome=false)` | prod-active | Load-bearing — the learner/supporter fork | VERIFIED `home.tsx:159-169` |
| Home intent actions (4) | `home-action-homework`→`/homework/camera`; `home-ask-anything`→`/session`; `home-action-practice`→`/practice`; `home-action-study-new`→`/create-subject` | prod-active | Load-bearing — the primary learner entry row | VERIFIED `LearnerScreen.tsx:70-100` |
| CoachBand (priority chain) | recovery-marker → resume-target → overdue "Revisit … fading"→`/topic/relearn` → quiz-discovery → null | prod-active | **Load-bearing** — the one-tap resume + spaced-repetition nudge (the product's soul) | VERIFIED `LearnerScreen.tsx:309-406` |
| Subject carousel | `home-subject-card-*` → `/(app)/progress/[subjectId]` (a **progress/report** screen) | prod-active | Incidental destination choice — **the double-destination bug** | VERIFIED `LearnerScreen.tsx:642-666` (route `:657-663`) |
| Practice Hub (`practice/index.tsx`) | 4 sections: bestNextStep (review→relearn + locked Assessment row), quiz, otherPractice (vocab/dictation/recite slider), recentProgress (history) | prod-active | Load-bearing as a launcher; **buried behind a button, not a tab** | VERIFIED sections `:500/675/797/958` |
| Locked Assessment row | renders `lock-closed` icon when `assessmentCount===0`; tap → shelf or library | prod-active | **Incidental — bad first impression** ("stuff I can't use") | VERIFIED `:649-651` (icon), `openAssessment` `:425-440` |

---

## 2. Complexity map

### 2.1 User-felt complexity (the scatter as a learner experiences it)

- **One intent, two destinations.** The home subject carousel routes to `/(app)/progress/[subjectId]` (a *report* screen, `LearnerScreen.tsx:657-663`) while Library routes to its own shelf tree. Same tap-on-a-subject mental model, two different places — the carousel feels like "open my subject" but lands on stats, not study material. **VERIFIED.**
- **The busiest verb-cluster has no front door.** Practice/test-myself (Quiz, Dictation, Recite, Assessment, Relearn — 5 activities) hides behind one `home-action-practice` button (`LearnerScreen.tsx:87-91`); the hub itself is a launcher-only screen (atlas §327). Discovery is poor — many users never reach it.
- **Per-verb entry scatter.** Relearn has **4** live entries (CoachBand `LearnerScreen.tsx:369-372`, Practice hub `practice/index.tsx:514`, book "Start Review" `book/[bookId].tsx:1184`, clone-from-child `use-clone-from-child.ts:203-214` — all VERIFIED via the trusted doc §Path 5); Quiz has 3 (Practice hub card, CoachBand quiz-discovery, history "Play again"); Path 0 (Learn-new) has 3 tiles (`home-action-study-new`, `home-add-subject-tile`, `home-add-first-subject`). Helpful intent, but un-anchored — back-navigation and re-discovery don't resolve to one canonical place.
- **A locked row as a first impression.** The Assessment row renders a padlock when no topics are eligible (`practice/index.tsx:649-651`) — many kids' first Practice-hub view is "this app is full of stuff I can't use," and tapping it silently bounces to the shelf/library (`openAssessment:425-440`).
- **CTA relabel whiplash.** Topic-detail CTA silently swaps "Practice again" (strong, secretly `mode=learning`) vs "Review this topic" (overdue, `mode=review`) between days — synonyms to a 13-year-old (trusted doc Path 2/4). Not in my files, but it's the same scatter pathology and a cheap copy fix.

### 2.2 Hidden complexity (two nav engines, flag states, canEnter, FULL_SCREEN_ROUTES)

- **Two contract engines behind two flags.** V1 = `resolveNavigationContract()` (`navigation-contract.ts:245`); V0 = legacy helpers (`legacy-navigation-contract.ts:62-131`). Both flags default OFF (`feature-flags.ts:30-31`), so the *production default* is the legacy path → `LEGACY_GUARDIAN_TABS` (5 tabs) for owner+children. **VERIFIED** branch `navigation-contract.ts:272-282`.
- **Three flag states, three tab counts for one owner.** flags-off → 5 (`LEGACY_GUARDIAN_TABS`); V0-on family mode → 3 (`FAMILY_MODE_TABS`); V1-on → 4 (`FAMILY_TABS`). Per-environment (memory `project_nav_contract_preserve_v0_off`): prod=V0-on, dev/stage=V1, local=flags-off. The learner shape (`STUDY_TABS`, 4 tabs) is stable across all three.
- **`canEnter` is the single learning gate but has a deliberate quirk.** Proxy → only `home/library/progress` (`:390-392`); `LEARNING_ROUTES` (incl. `practice`, `session`, `quiz`, `topic/relearn`) → `familyShape ? ownerRole : true` (`:407-409`); the flags-off guardian keeps `shape:'study'` but renders `FamilyHome` + 5 tabs — a deliberate split (`:278-282`, comment in source). V0 fallback per screen: `blocked = MODE_NAV_V1_ENABLED ? !canEnter(route) : isParentProxy` (VERIFIED `practice/index.tsx:442-444`).
- **`practice` lives in THREE registers, none of them a tab.** `LEARNING_ROUTES` (gate, `:175`), `FULL_SCREEN_ROUTES` (tab-bar collapse, `_layout.tsx:66`), `HIDDEN_TAB_ROUTES` (phantom-route defense, `_layout.tsx:91`). Promoting it to a tab means edits in all three plus `TabKey` + `STUDY_TABS` + a `<Tabs.Screen>` — and removing it from the full-screen/hidden sets.
- **Gating sprawls across layers.** Tab visibility (contract `visibleTabs`), content visibility (`gates.*`, `navigation-contract.ts:358-374`), `isOwner`/`role`/age/proxy/subscription, and two flags all interact (atlas §249).

### 2.3 Load-bearing vs incidental verdict

- **Load-bearing (do not touch lightly):** `canEnter`, the `LEGACY_GUARDIAN_TABS` branch, `FULL_SCREEN_ROUTES`, the `home.tsx:161` fork, CoachBand's resume + overdue chain, the 4 home intent actions, the Practice hub's bestNextStep review card. These are the spine; the V0 hard constraint (spec §7) protects the 5-tab guardian shell with 3 test suites (`navigation-contract.test.ts`, `.totality.test.ts`, `.guard.test.ts`).
- **Incidental (safe to improve now):** the carousel→`progress/[subjectId]` destination choice, the locked-Assessment-row render, CTA copy, kid-legible names, the `home-action-practice` button label. None of these touch the contract or the V0 shape.

---

## 3. Hypothesis audit (claims from proposed/diff docs on this cluster)

| Claim | Verdict | Evidence |
|---|---|---|
| **Promote Practice to a 4th learner tab (Learn/Practice/Library/Progress)** | **CONFLICTS-WITH-SPEC** | Spec §3/§7/§15.3 rule 3 tabs (Mentor/Subjects/Journal); Library tab dies; new destination screens banned (P2). The current shell is replaced by S1 (`MODE_NAV_V2_ENABLED`). Building this is dead work. Practice is genuinely NOT a tab today (`TabKey:13-19`, `STUDY_TABS:145-150`, `FULL_SCREEN_ROUTES:66`) — so the diff doc's *factual* claim is CONFIRMED; only the *recommendation* conflicts. |
| **Fold More into header/avatar menu, learner tabs stay 4** | **PARTIAL / SPEC-ABSORBED** | Direction matches spec §3 ("admin behind the avatar"), but the spec does it at **S3** (Journal + avatar split), against the new shell — not by editing today's `STUDY_TABS`. Doing it in the current shell now = throwaway. |
| **Diff doc: "there is no `LEARNER_TABS` symbol; code has only `STUDY_TABS`"** | **REFUTED** | `LEARNER_TABS` exists at `legacy-navigation-contract.ts:12-17` (the V0 helper). The diff doc only checked the V1 file. Brief's known-good detail confirmed. |
| **Unify subject-carousel destination with Library (repoint one onPress)** | **CONFIRMED** (and SHIP-NOW-eligible) | Carousel routes to `/(app)/progress/[subjectId]` (`LearnerScreen.tsx:657-663`), Library to the shelf tree — same intent, two destinations. One-line repoint. Survives the redesign (carousel→hub in S2). |
| **One canonical entry per verb; contextual nudges deep-link inside it** | **PARTIAL / SPEC-ABSORBED** | Relearn×4 / Quiz×3 / Path-0×3 scatter VERIFIED (trusted doc §3, §Path 5). But spec §7: "collapse follows usage evidence, **not precedes it**." Repointing nudges to honor the ancestor-chain push rule is good hygiene NOW; *deleting* front doors waits for S1+S2 evidence. |
| **Home "Continue where you left off" card collapses a "5-tap resume" to 1 tap** | **PARTIAL** (already mostly built) | One-tap resume already exists via CoachBand → `pushLearningResumeTarget` (`LearnerScreen.tsx:350-356`) + recovery marker (`:312-347`). The "5-tap dig" is the *Library→shelf→book→topic→CTA* path, not the home path. The remaining delta is a dedicated card + label-matching `deriveStudyCTA` — and it's mooted by S1's feed. |
| **V0/V1 hard constraint binds Practice-tab + More-fold + Recaps-fold simultaneously** | **CONFIRMED** | Any edit to shared tab `Set`s risks the 5-tab guardian (`navigation-contract.ts:272-282`); 3 nav test suites guard it. |
| **`isAdultOwner` null-birthYear bug does NOT reproduce** | **CONFIRMED** | `isAdultOwner` delegates to schema guard (`navigation-contract.ts:199-201`); memory `project_navcontract_isadultowner_null_bug` is stale per trusted doc §1. |
| **Hide the locked Assessment row** | **CONFIRMED** (SHIP-NOW-eligible) | `practice/index.tsx:649-651` renders `lock-closed` at `assessmentCount===0`; S, learner-scoped, survives any redesign. |

---

## 4. Current-doc corrections (`learning-path-flows.md`)

The trusted doc is accurate on this cluster. One nuance to add and one cite to tighten:

1. **§1 nav matrix labels the V1-ON learner shell `STUDY_TABS = home, library, progress, more`** (line 40) — **correct** (`navigation-contract.ts:145-150`). But the same table's "V1 OFF" learner cells say `LEARNER_TABS (4)`. That's the V0 *helper* symbol (`legacy-navigation-contract.ts:12`), not what `resolveNavigationContract` returns — on the V1-off / V0-off learner path the contract still returns `STUDY_TABS` (the `else`/`explicit-study` fall-through, `navigation-contract.ts:265-268`). Both are `home, library, progress, more`, so the *shape* is right; the *symbol name* differs by engine. Worth a one-line footnote so a reader doesn't think two different sets render. **Not a defect, a labeling nuance.**
2. **§3 entry map, Quiz row cite** says CoachBand quiz-discovery routes capitals/guess_who → `/quiz/launch`, vocabulary → `/quiz` picker (fixed 2026-06-10). **VERIFIED accurate** at `LearnerScreen.tsx:388-401` (the `[QUIZ-16]` branch). No correction needed — flagging it as confirmed.
3. **CoachBand overdue headline** — trusted doc §3 cites `LearnerScreen.tsx:367-372`. VERIFIED: the "Revisit … fading" → `/topic/relearn` block is at `:360-373`. Cite is accurate within one line.

No substantive errors found in the cluster's claims against source.

---

## 5. Simplification candidates

**C1 — Repoint the subject carousel to the library shelf (or, post-S2, the subject hub).**
User gain: "open my subject" lands on study material, not a stats report — removes the double-destination confusion. Deleted/kept: kept (one-line onPress repoint at `LearnerScreen.tsx:657-663`); deletes nothing. Size: **S**. **SHIP-NOW** (learner-scoped, contract-untouched) — and it *pre-stages* S2 (carousel→subject hub). Risk: low; one nav target change + a snapshot/test update. Verdict: **REAL WIN.**

**C2 — Hide the locked Assessment row when `assessmentCount===0`.**
User gain: kills the "padlocked stuff I can't use" first impression. Deleted/kept: conditionally render the row (`practice/index.tsx:649-651`, gated on `assessmentCount`). Size: **S**. **SHIP-NOW** (learner-scoped). Risk: low — but confirm the empty-state still teaches *how* to unlock it (a one-liner "complete a topic to unlock"), else you hide the affordance entirely. Verdict: **REAL WIN** (with the empty-state caveat).

**C3 — Kid-legible renames + CTA subtitles (i18n-only).**
User gain: "Assessment"→"Check what you've mastered", "Best next step"→plain copy, CTA "why" subtitles ("Review this topic" → *"It's been a while — let's check it stuck."*). Deleted/kept: copy only. Size: **S** *per string* but **taxed**: every rename hits **7 UI locales** (`SUPPORTED_LANGUAGES`, `i18n/index.ts:23-31`) via `pnpm translate`, must pass the orphan-key checker (`scripts/check-i18n-orphan-keys.ts`) and the JSX-literal ratchet, and Home headlines are currently **hardcoded English** (pre-existing i18n debt, diff doc Path 2). **SHIP-NOW** but budget the i18n tax. Risk: low-medium (translation churn + ratchet). Verdict: **REAL WIN**, with the i18n surcharge made explicit.

**C4 — Repoint contextual nudges to honor the ancestor-chain push rule (de-scatter, no deletion).**
User gain: back-navigation from a deep-linked Relearn/Quiz resolves correctly instead of falling through to Home (CLAUDE.md cross-stack-push rule). Deleted/kept: kept — fix the *push* (full chain), don't delete the entry. Size: **M** (per-call-site across `LearnerScreen.tsx`, `practice/index.tsx`, `book/[bookId].tsx`, `topic/relearn.tsx`). **SHIP-NOW** (correctness, not IA collapse) — but *only the push-correctness half*; collapsing the 4 Relearn doors waits for evidence (spec §7). Risk: medium — must verify each push synthesizes the parent stack. Verdict: **CONDITIONAL** (do push-correctness now; defer door-collapse).

**C5 — Promote Practice to a 4th learner tab + More→avatar (proposed §1).**
User gain: persistent Practice front door. Deleted/kept: adds `TabKey`/`STUDY_TABS`/`<Tabs.Screen>` entries; removes `practice` from `FULL_SCREEN_ROUTES`/`HIDDEN_TAB_ROUTES`. Size: **L**. **CONFLICTS** — the ratified ruling is 3 tabs (Mentor/Subjects/Journal, spec §3/§15.3), Library tab dies, More→avatar at S3. Editing shared tab `Set`s also risks the V0 5-tab guardian (`navigation-contract.ts:272-282`, 3 test suites). Risk: high (V0 regression + thrown-away on S1). Verdict: **MIRAGE** — do not build; the discovery problem it targets is the *exact* problem S1's feed solves (spec §Problem-source).

**C6 — A dedicated Home "Continue" card matching `deriveStudyCTA` labels.**
User gain: label/mode mirror Topic Detail exactly. Deleted/kept: a new card; needs `completionStatus`+`retentionStatus` added to the resume-target payload for true label reuse. Size: **S–M**. **SPEC-ABSORBED (§3/§8.1)** — the `/now` feed's top card *is* the computed continuation; building a bespoke card in `LearnerScreen` now is throwaway. One-tap resume already exists (CoachBand). Verdict: **MIRAGE** for net-new build; the *existing* resume is already a REAL WIN that's shipped.

---

## 6. Bottom line

**Score: 2 / 5 for "invest in the current shell's IA."** The current entry/nav surface has real, verified friction (double-destination carousel, locked-row first impression, per-verb scatter, three tab counts behind two flag engines), but the ratified `mentor-is-the-app` spec replaces the entire home surface at S1 (`MODE_NAV_V2_ENABLED`) and collapses the tab matrix at S4. Most structural IA work here is **dead work** — the spec's S2→S3 evidence gate means S1+S2 ship-and-measure *first*, so the timeline does not reward rebuilding the shell that's being strangled.

**Highest-value move (and the only structural one worth doing now):** the **two learner-scoped, contract-untouched, redesign-surviving micro-fixes** — repoint the carousel to the shelf/hub (C1, S) and hide the locked Assessment row (C2, S) — plus the **push-correctness half** of de-scatter (C4). These are honest wins that cost almost nothing, don't risk the V0 hard constraint, and pre-stage S2. Renames/subtitles (C3) are worth it but carry the explicit 7-locale + orphan-key + JSX-ratchet tax on every string.

**The 4-tab adjudication, stated plainly:** the proposed §1 4-tab learner shell is **REFUTED as a direction** — it directly contradicts the ruled 3-tab shell, revives the Library tab the spec kills, edits the exact shared `Set`s the V0 constraint protects, and would be thrown away by S1. No part of it is salvageable *as a current-shell change*; its only living kernel (one canonical entry per verb) is delivered by the spec's feed + closed route catalog, not by a Practice tab.

**The one thing that must NOT be simplified away:** the **V0 5-tab guardian shell** (`LEGACY_GUARDIAN_TABS`, `navigation-contract.ts:162-168`, branch `:272-282`) — it is the shipped production guardian state and a hard no-regress constraint until the spec §13.1 ruling at S6. Any tab-`Set` edit must be learner-scoped, and the 3 nav-contract test suites must stay green. Second on that list: `canEnter` and `FULL_SCREEN_ROUTES` — the single learning gate and the immersive-screen tab-bar collapse are load-bearing for every learning entry and must not be loosened in the name of "fewer flag branches."

---
**[ BOTTOM LINE ]** The proposed 4-tab learner shell CONFLICTS with the ratified 3-tab spec and is dead work; only two S-sized learner-scoped fixes (carousel repoint, hide locked Assessment row) plus de-scatter push-correctness are worth doing before S1 replaces the home surface.

**[ FYI ]**
- VERIFIED: `LEARNER_TABS` exists (`legacy-navigation-contract.ts:12`) — the diff doc was wrong to deny it.
- VERIFIED: `practice` is in `LEARNING_ROUTES`, `FULL_SCREEN_ROUTES`, and `HIDDEN_TAB_ROUTES` but NOT `TabKey`/`STUDY_TABS` — it is a full-screen route, not a tab, by design (Bug 770).
- VERIFIED: carousel→`/progress/[subjectId]` (report), Library→shelf tree = the double destination (`LearnerScreen.tsx:657-663`).
- The V0 5-tab guardian shell is guarded by 3 nav-contract test suites; any tab-`Set` edit risks regressing it.

**[ ACTIONS ]**
1. If shipping interim wins: repoint the carousel onPress (C1, S) and hide the locked Assessment row with an unlock hint (C2, S) — both learner-scoped, contract-untouched, redesign-surviving.
2. Budget the 7-locale + orphan-key-checker + JSX-ratchet tax before any rename (C3).
