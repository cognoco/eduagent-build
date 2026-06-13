# Path 3 — Homework Help: Deep-Dive
> Cluster scope: camera capture · OCR cascade · subject auto-classify · homework session (sub-modes, multi-problem state) · exit filing prompt · Recall Bridge · homework-state sync · parent homeworkSummary. · Analyst: path3 · Date 2026-06-10 · Sources verified at HEAD of `new-llm` (`git branch --show-current` = `new-llm`).

Legend: **[V]** = verified by reading source at HEAD · **[I]** = inferred from naming/structure, not line-proven.

---

## 1. Feature inventory (verified)

| Feature / branch | What it does | Status | Load-bearing? (why) | Evidence |
|---|---|---|---|---|
| Camera screen as 7-phase state machine | One file renders permission/viewfinder/preview/processing/result/error/manual via reducer | **[V]** prod-active | Load-bearing as a *capability*, incidental as *one file* — phases are 7 screens fused | `homework/camera.tsx` (1717 lines, atlas-counted); reducer in `components/homework/camera-reducer.ts` |
| Permission states | First-request vs permanently-denied; capture via `takePictureAsync` / gallery via `ImagePicker.launchImageLibraryAsync` | **[V]** | Load-bearing (camera is the whole path) | `camera.tsx:351-365` (`handleCapture`), `:367-373` (`handlePickFromGallery`) |
| OCR leg 1 — on-device ML Kit | `TextRecognition.recognize` on resized (1600px) image, 20s timeout, only if native module linked | **[V]** | Load-bearing (free, fast, offline) | `use-homework-ocr.ts:169-185`, `OCR_DEVICE_TIMEOUT_MS=20_000` `:114`, `isTextRecognitionAvailable` `:32-34` |
| OCR gate (local trust) | `isCleanPrintedLocalRead()` decides if local read is trusted; else falls through to server | **[V]** | Load-bearing (prevents shipping garbage to LLM) | `:467` calls `isCleanPrintedLocalRead`; `:322` `isLikelyHomework` reject gate |
| OCR leg 2 — server `/v1/ocr` | `recognizeTextServerSide` POSTs resized JPEG to `/v1/ocr` (Gemini multimodal), 15s timeout, looser accept gate (`countMeaningfulTokens >= 1`) | **[V]** | Load-bearing (handwriting / low-quality fallback) | `:191-265`, endpoint `${getApiUrl()}/v1/ocr` `:233`, `OCR_SERVER_TIMEOUT_MS=15_000` `:115`, accept gate `:346-349`. (Atlas says `/ocr`; actual route is `/v1/ocr` — atlas drift, minor) |
| OCR leg 3 — retry / manual | `retry()` re-runs last URI; manual phase = type/dictate text instead | **[V]** | Load-bearing (no dead-end on OCR fail) | `retry` `:557-560`; manual entry phase in `camera.tsx` |
| **Image ALSO rides as `inline_data`** | The raw photo is read to base64 (`useImageBase64`, security-allowlisted) and attached as an `inline_data` MessagePart on the FIRST homework exchange, alongside OCR text | **[V]** | **Load-bearing** — LLM sees raw image even when OCR is imperfect; no separate "skip OCR" path needed | `buildUserContent` `exchanges.ts:169-182` (`type:'inline_data'`); `use-image-base64.ts:24-114` (base64 read + WI-284 sandbox allowlist `:53`); gated `effectiveMode==='homework' && attachImage` `use-session-streaming.ts:597-607`; one-shot consume (refs nulled) `:777-782`; flag origin `imageAttachmentStatus==='ready'` `session/index.tsx:902` |
| Subject auto-classify | `useClassifySubject()` fires in camera result phase → auto-set / auto-create / picker fallback | **[V]** | Load-bearing for zero-friction, but multi-domain leak (subject domain inside camera) | classify in `camera.tsx` (`classify()` effect `:347`); error→picker fallbacks `:319-345` |
| Subject auto-create | `createSubject.mutateAsync()` makes a new shelf when classify is confident-but-new | **[V]** | Load-bearing (no manual setup) | `camera.tsx:285-326` auto-create + Sentry-on-fail |
| Sub-mode chips `help_me`/`check_answer` | Picked **per problem in the SESSION screen** (not camera); **default `undefined`** | **[V]** | Load-bearing as behavior; the *default* is the simplification lever | state `session/index.tsx:366-367` (`undefined`), reset per problem `:557`, sent only if set `use-session-streaming.ts:774-776` |
| **Server fallback for undefined sub-mode** | When `homeworkMode===undefined`, server prompt falls through both branches to a generic homework block | **[V]** | Load-bearing — proves chips can be made zero-tap without breaking the LLM | `exchange-prompts.ts:83-87` (`homeworkMode?` optional), `check_answer` `:97`, `help_me` `:113`, generic fallback `:130-143` |
| Multi-problem state machine | Problems split client-side, navigated one-by-one; `POST /sessions/:id/homework-state` emits `homework_problem_started/_completed/ocr_correction` | **[V]** | Load-bearing (parent summary + progress events depend on it) | route `sessions.ts:1364-1380` (proxy-blocked, profileId-scoped `withProfile`); `homeworkStateSyncSchema` `:1366` |
| URL-param truncation guard | `buildHomeworkSessionParams` truncates to URL budget; alerts + Sentry on drop | **[V]** | Load-bearing fix (BUG-823) but a fragile transport (URL params for problems+image) | `camera.tsx:483-514` (`truncation` alert + Sentry) |
| **Exit filing prompt (homework-only)** | `setShowFilingPrompt(true)` fires ONLY when `effectiveMode==='homework'`; all other modes go straight to summary | **[V]** | This is the cluster's central simplification target | `use-session-actions.ts:375-376` (`if (effectiveMode === 'homework')`) |
| Filing prompt UI ("Yes, add it" / "No thanks") | Accept → `filing.mutateAsync` → summary WITH `shelfId/bookId`; Dismiss → `filingDismissed=true` → summary with NO args (no file) | **[V]** | The conditional that starves the Recall Bridge | `SessionFooter.tsx:166-280`; accept `:204-261` (`filing-prompt-accept`), dismiss `:262-276` (`filing-prompt-dismiss`) |
| **Recall Bridge** | After homework, generates **max 2** recall questions on the topic's METHOD; **returns `[]` when `!session.topicId`** | **[V]** | Load-bearing payoff (the "rescue → learning" moment); empty unless filed | `recall-bridge.ts:37-108`; topicId gate `:48-50`; max-2 slice `:101`; profileId parent-chain scope `:57-72` |
| Recall Bridge trigger (mobile) | Fires **only on the SKIP path** of the summary screen, homework-only, if not already loaded | **[V]** | Skip-path-only is itself a finding (submit-reflection path never triggers it) | `session-summary/[sessionId].tsx:774-784` (skip path); render `:1300-1336`; **NOT** in submit path `:627-678` |
| Filing flow (server) — **synchronous** | `POST /filing`: `fileToLibrary` (LLM rung1) → `resolveFilingResult` (DB txn shelf→curriculum→book→topic) → `markSessionFiled` writes `topicId` → returns shelfId/bookId/topicId | **[V]** | **The key sequencing fact** — topicId committed before response | `filing.ts:116-317`; `resolveFilingResult` `:220`; `markSessionFiled` `:228-229`; sync return `:311-316`; async retry ONLY on failure via `safeSend` `:172-187`, `:241-256` |
| Freeform close-path auto-file — **async, homework-EXCLUDED** | `dispatchClosePathAutoFileIfEligible`: freeform-only, ≥5 exchanges, async Inngest dispatch | **[V]** | Distinguishes the async freeform path from the sync homework path — central to the auto-file analysis | `session-filing-dispatch.ts:12-55`; `=== 'freeform'` `:20`, `safeSend` async `:45-54` |
| Keep-out opt-out | `useKeepSessionOutOfLibrary()` → `POST .../keep-out`; `isKeptOut = filingStatus==='filing_kept_out'` | **[V]** | Available reuse for a post-hoc "don't keep this" affordance | `use-filing.ts:354-359` (mutation), `:334` (`isKeptOut`), kind union `:124`, `:143-145` |
| Parent homeworkSummary | Post-session Inngest step 6 extracts `problemCount/practicedSkills/independent/guided/summary/displayTitle`; shown ONLY in parent-proxy child view | **[V]** | Load-bearing for parent value; asymmetric (learner never sees it) | flows-doc §Path3 `:270`; atlas §7 `child/[profileId]/index.tsx:225` |

---

## 2. Complexity map

### 2.1 User-felt complexity (the 9pm stuck-kid trace: taps, decisions, waits)

The actual happy path from Home (V0/V1 learner shape):

1. **Tap 1** — Home → `home-action-homework` card → camera screen (shallow; 2 taps to camera per atlas) **[V]** `LearnerScreen.tsx` intent action → `homework/camera.tsx`.
2. **Decision** — viewfinder: shutter vs gallery vs "type it" (3-way, but shutter is the obvious default). **Tap 2.**
3. **Wait** — OCR. Best case ML Kit ~instant. Worst case: ML Kit 20s timeout → server `/v1/ocr` up to 15s → **up to ~35s of spinner on a bad photo** before any fallback. **[V]** `:114-115` timeouts stack sequentially (local then server).
4. **Decision** — result phase: review problem cards + subject (auto-set / auto-create / **manual picker** if classify fails). On classify failure this is an extra interruption (`platformAlert` + picker) **[V]** `:319-345`. **Tap 3** ("Let's Go").
5. Session: per-problem, the kid *may* tap a sub-mode chip (`help_me`/`check_answer`) — but `undefined` already works, so this is an **optional** tap, not required **[V]** `:366-367,774-776`.
6. **End Session** → **the filing prompt interrupts** ("Yes, add it" / "No thanks") — a save-decision the 9pm kid did not come for. **Decision + Tap 4.** **[V]** `use-session-actions.ts:375-376`, `SessionFooter.tsx:166-280`.
7. Session Summary → "Your Words" reflection or **Skip**. The **Recall Bridge only appears if (a) they skipped AND (b) the session was filed at step 6** **[V]** `[sessionId].tsx:774`, `recall-bridge.ts:48`.

**Felt count:** ~4 taps + ~3 decisions + 1 long wait. The two avoidable frictions are the **OCR spinner with no escape** (step 3) and the **binary filing prompt** (step 6) that gates the payoff (step 7).

### 2.2 Hidden complexity

- **Two OCR timeouts stack** (20s + 15s) with no mid-wait "type it instead" escape on the slow leg. **[V]** `:114-115`.
- **Image-as-base64 is a separate path from OCR** — read on the session screen, sandbox-allowlisted (WI-284), one-shot consumed. A learner never knows the photo itself reaches the LLM. **[V]** `use-image-base64.ts`, `use-session-streaming.ts:777-782`.
- **Subject domain leaks into camera** — classify + auto-create + picker, each with its own loading/error/retry, layered inside the result phase. **[V]** atlas signal #8; `camera.tsx:285-345`.
- **Problems travel as URL params** with a silent-truncation guard; a 10-problem worksheet can lose 9. **[V]** `camera.tsx:483-514`.
- **Recall Bridge is skip-path-only** — a kid who writes a reflection (the *better* behavior) never sees the recall questions, because the submit path doesn't call `recallBridge.mutateAsync()`. **[V]** present at `:776`, absent in `handleSubmit` `:627-678`.
- **homeworkSummary is parent-only** — written every homework session, surfaced only in the proxy child view. **[V]** atlas §7.

### 2.3 Load-bearing vs incidental verdict

- **Load-bearing (do not simplify away):** the OCR cascade *as a fallback ladder* (ML Kit → server → image-to-LLM → manual); the **raw-image `inline_data` attachment** (it is the real robustness against bad OCR — verified `exchanges.ts:176`); profileId scoping on homework-state and recall-bridge; the homework sub-mode *capability*; the synchronous filing route (it is what makes auto-file-at-exit safe).
- **Incidental / removable friction:** the **binary filing prompt** as a *modal decision* (the filing *action* is load-bearing, the *prompt* is not); the **required-feeling sub-mode chips** (server already defaults); the **OCR-spinner dead-wait**; **camera-as-one-1717-line-file** (refactor target, not a user feature).

---

## 3. Hypothesis audit (claims from proposed/diff docs on this cluster)

| Claim (source) | Verdict | Evidence |
|---|---|---|
| "Kill the binary filing prompt at exit; auto-file then straight to summary" (diff `:145-149`) | **CONFIRMED feasible** | Prompt is homework-only `use-session-actions.ts:375-376`; the accept branch already calls the same `filing.mutateAsync` `SessionFooter.tsx:213`. Replacing the prompt with a silent call to the same synchronous route is mechanically trivial. |
| "Run the Recall Bridge for everyone — auto-filing populates topicId so the bridge fires" (diff `:150`) | **CONFIRMED (with one correction)** | Bridge is empty iff `!session.topicId` `recall-bridge.ts:48-50`. Auto-filing sets topicId (`markSessionFiled` `filing.ts:228-229`). **Correction:** "for everyone" is wrong scope — bridge is homework-only by trigger (`isHomeworkSession` `[sessionId].tsx:774`) AND topicId-gated; only homework sessions ever reach it. The win is "for every *homework* session," not all sessions. |
| "Biggest unknown = filing/topicId timing; if auto-file is async (Inngest) topicId may not commit before the bridge POST" (diff `:155-156`) | **REFUTED for the homework path** | The async path (`session-filing-dispatch.ts`) is **freeform-only and homework-EXCLUDED** (`:20` `=== 'freeform'`). Homework's `POST /filing` is **fully synchronous**: `markSessionFiled` `:228-229` commits topicId *before* the 200 returns `:311`. If the silent auto-file `await`s that response before navigating to summary, the bridge (which re-reads topicId from the scoped repo `recall-bridge.ts:44`) is guaranteed to see it. No new sync path needs building — it exists. |
| "Demote mode chips to one default-off toggle; server handles `undefined`" (diff `:152`) | **CONFIRMED** | `homeworkMode` already defaults `undefined` `session/index.tsx:366-367`; server generic block at `exchange-prompts.ts:130-143` handles it. Mobile-only change. |
| "Mid-wait 'type it instead' on the OCR spinner (server-OCR leg only)" (diff `:153`) | **CONFIRMED feasible** | Cascade in `use-homework-ocr.ts`; the manual phase already exists in `camera.tsx`. A timed CTA during the `tryServerFallback` leg is additive. |
| "Quiet 'Don't keep this' opt-out in summary reusing keep-out" (diff `:151`) | **CONFIRMED feasible** | `useKeepSessionOutOfLibrary()` → `POST .../keep-out` exists `use-filing.ts:354-359`. Pairs with auto-file (file-by-default, opt-out-quietly). |
| Atlas "Recall Bridge max 2 [was 3]" (atlas, flows-doc `:266`) | **CONFIRMED** | `.slice(0, 2)` `recall-bridge.ts:101`; prompt says "exactly 2" `:121`. |
| Atlas "server OCR is `/ocr`" (atlas §OCR Architecture) | **REFUTED (minor)** | Actual endpoint is `/v1/ocr` `use-homework-ocr.ts:233`. Atlas dropped the `/v1` prefix. |

---

## 4. Current-doc corrections (`learning-path-flows.md`)

The trusted doc's Path 3 section is accurate on the load-bearing facts. Two refinements, both file:line-proven:

1. **`learning-path-flows.md:266-267`** ("Recall Bridge … requires topicId (so empty unless the session was filed)") is correct, but should add that the **trigger is skip-path-only**: `recallBridge.mutateAsync()` fires at `[sessionId].tsx:776` inside `handleSkip`, and is **absent from the submit-reflection path** (`handleSubmit` `:627-678`). A homework kid who *writes a reflection* never sees the recall questions. The doc currently implies the bridge runs whenever the session is filed; in fact it also requires the user to skip.
2. **`learning-path-flows.md:255-256`** correctly states the image rides as `inline_data`. Worth pinning the exact gate for future readers: it is attached **only on the first homework exchange**, gated `effectiveMode==='homework' && attachImage` and consumed once (refs nulled) — `use-session-streaming.ts:597-607,777-782`; flag set when `imageAttachmentStatus==='ready'` `session/index.tsx:902`. (No correction; precision add.)

No load-bearing error found in the doc's Path 3.

---

## 5. Simplification candidates

### C1 — Auto-file homework at exit (kill the binary filing prompt) + un-starve the Recall Bridge
- **User gain:** removes a save-decision the stuck kid never came for; the Recall Bridge (the path's actual learning payoff) fires for *every* homework session instead of only the fraction that taps "Yes, add it".
- **Deleted/kept:** delete the `StandardFilingPrompt` *as a blocking decision*; keep the filing *action* (silent `POST /filing`) and add a quiet "Don't keep this" opt-out in summary (reuse `keep-out`). The 60s topicless filing-wait does not apply to homework (homework files synchronously), so no wait-removal coupling here.
- **Size:** **M** (mobile: swap the prompt for an awaited silent file; reuse existing `useFiling` + `useKeepSessionOutOfLibrary`; no backend change — the sync route already exists).
- **SHIP-NOW vs SPEC-ABSORBED:** **PARTIALLY SPEC-ABSORBED.** Spec §7 rules "the 3-screen session exit funnel dies, dissolving into the mentor's wrap-up conversation turn, **only after** P3 park-and-return eval coverage exists." The filing prompt is one screen of that funnel. **However:** §7 gates the *funnel dissolution* on P3 evals and ships behind `MODE_NAV_V2_ENABLED`. Auto-filing homework + firing the bridge is a **behavior change inside today's shell** that does not touch tab shape and does not regress V0 (spec §7 hard constraint). The *mechanism* (silent file → bridge) is exactly what the V2 wrap-up turn will need, so building it now is **not wasted** — it is the load-bearing primitive the spec's exit-funnel-death reuses. **Recommended: build the auto-file + bridge-un-starve now (shell-independent); do NOT also build a redesigned prompt UI that V2 will delete.**
- **Risk:** auto-filing creates a shelf/book/topic the learner didn't ask for → mitigated by the quiet opt-out. The filing LLM call is rung-1 and can fail; on failure the homework session simply has no topicId and the bridge stays empty (status quo today). The auto-file must be `await`ed before navigating to summary so topicId is committed first — **verified safe because `POST /filing` is synchronous** (`filing.ts:228-229,311`).
- **Verdict:** **REAL WIN.** The single highest-value move in this cluster. The "interruption suppresses its own payoff" claim is **CONFIRMED**: the Recall Bridge requires `topicId` (`recall-bridge.ts:48`), and `topicId` is set only when the user taps "Yes, add it" (`SessionFooter.tsx:213` accept → file → topicId; `:262-265` dismiss → no file → no topicId → empty bridge). The payoff is gated behind a decision a tired kid is most likely to skip with "No thanks."

### C2 — Make sub-mode chips zero-tap (server `undefined` default already works)
- **User gain:** the urgent default (stuck-kid help) needs zero taps; the chip becomes an optional refinement, not a gate.
- **Deleted/kept:** keep both chips as optional toggles; delete any UI that *requires* a choice before the first reply.
- **Size:** **S** (mobile-only; server already handles `undefined` — `exchange-prompts.ts:130-143`).
- **SHIP-NOW:** **SHIP-NOW.** Independent of the new shell; no tab/nav surface; no V0 regression.
- **Risk:** the generic prompt is slightly less tailored than `check_answer`/`help_me`, but the LLM still gets OCR text + raw image. Low.
- **Verdict:** **REAL WIN** (small, clean, shell-independent).

### C3 — Mid-wait "type it instead" CTA on the slow OCR leg
- **User gain:** no staring at a spinner for up to ~35s on bad cellular / handwriting; an escape to the manual phase that already exists.
- **Deleted/kept:** nothing deleted; additive timed CTA on the `tryServerFallback` leg only.
- **Size:** **S** (mobile-only).
- **SHIP-NOW:** **SHIP-NOW.** Spec §3.1 makes homework a first-class instant affordance and §3.1/§14 ("Homework photo fails → retry or continue by typing") *wants* exactly this resilience. Building it now feeds the spec, doesn't conflict.
- **Risk:** minimal; the manual path is proven.
- **Verdict:** **REAL WIN.**

### C4 — Fire the Recall Bridge on the submit-reflection path too (not just skip)
- **User gain:** the kid who writes a reflection (the behavior we *want*) currently gets *less* — no recall questions. Firing the bridge on submit as well makes the payoff reflection-positive.
- **Deleted/kept:** additive — call `recallBridge.mutateAsync()` after a successful homework submit, same render block.
- **Size:** **S** (mobile-only; the render + mutation already exist `[sessionId].tsx:776,1300-1336`).
- **SHIP-NOW:** **SHIP-NOW** but **best bundled with C1** (the bridge is worthless until C1 guarantees topicId). On its own without C1, it still only helps filed sessions.
- **Risk:** an extra LLM call on submit; rung-1, cheap, best-effort (the existing skip-path call already swallows errors `:781-783`).
- **Verdict:** **CONDITIONAL** — REAL WIN only when shipped with C1.

### C5 — Extract the camera state machine into discrete screens / move subject domain out
- **User gain:** none directly felt by the user; this is a maintainability / deep-linkability refactor.
- **Deleted/kept:** splits 1717-line `camera.tsx`; moves classify/create out of the result phase.
- **Size:** **L–XL**.
- **SPEC-ABSORBED / CONFLICTS:** the spec (§3) keeps a permanent **camera + Homework chip on the Mentor bar**, and §3.1 rules a **dual-path reply** (camera affordance inside the chat reply, chat continuing underneath) — i.e., the V2 entry into homework is *not* the standalone `homework/camera.tsx` flow; it is the mentor reply with an inline camera. A large refactor of the standalone camera screen now risks being **rebuilt-twice** work: V2 changes the entry topology. **CONFLICTS with §3/§3.1 — defer.**
- **Risk:** high churn, re-opens BUG-31/234/236-class subject-pick regressions, for zero user-felt gain pre-V2.
- **Verdict:** **MIRAGE** (as a now-task). Right instinct, wrong time — the spec moves the entry point, so refactoring the current screen is wasted unless it directly feeds the V2 inline-camera reply.

### C6 — Surface homeworkSummary to the learner (not just the parent)
- **User gain:** the learner sees their own session recap; removes the asymmetry.
- **Deleted/kept:** additive read; data already written every homework session.
- **Size:** **S–M**.
- **SPEC-ABSORBED:** spec Journal tab (§3) + `/now` activity ledger (§8.2) are where learner-facing recaps live in V2. Building a bespoke learner homeworkSummary view *now* partially duplicates the Journal. **Lean SPEC-ABSORBED (§3 Journal / §8.2 ledger).**
- **Risk:** low, but duplicative with V2 Journal.
- **Verdict:** **CONDITIONAL** — defer unless a cheap learner-facing surface is wanted before V2.

---

## 6. Bottom line

**Score: 4 / 5.** Path 3 is the most coherent of the learning paths — shallow nav (2 taps to camera), a genuinely robust OCR cascade backed by raw-image `inline_data`, and a real learning payoff (Recall Bridge). It loses a point for two self-inflicted wounds: the **binary filing prompt that gates its own payoff**, and the **OCR dead-wait**.

**Highest-value move: C1 — auto-file homework at exit and un-starve the Recall Bridge.** The "interruption suppresses its own payoff" claim is **verified true**: the bridge returns `[]` without `topicId` (`recall-bridge.ts:48-50`), and `topicId` is set only on the "Yes, add it" branch (`SessionFooter.tsx:213`), which a tired kid is most likely to decline. The diff doc's "biggest unknown" (async timing could leave the bridge empty) is **refuted for homework** — the async auto-file is freeform-only (`session-filing-dispatch.ts:20`), while homework's `POST /filing` commits `topicId` synchronously before responding (`filing.ts:228-229,311`). So the implementation guarantee is simple and already satisfiable: **the mobile exit handler must `await` the silent `POST /filing` (or its in-flight result) before navigating to the summary screen, so the Recall Bridge POST that fires there re-reads a committed `topicId`.** No new synchronous path is needed; it exists. C1 + C2 + C3 + C4 are all SHIP-NOW or shell-independent and build the exact primitives §7's exit-funnel-death will reuse — not wasted work. The one to defer is C5 (camera refactor): §3/§3.1 relocate the homework entry to an inline-camera mentor reply, so refactoring today's standalone screen is rebuilt-twice risk.

**The one thing that must NOT be simplified away: the OCR cascade's raw-image `inline_data` attachment** (`exchanges.ts:176`, gated `use-session-streaming.ts:597-607`). It is the real robustness — the LLM can still help when OCR mangles handwriting or a diagram. Any "just send the OCR text" simplification would silently degrade exactly the 9pm-handwritten-worksheet case the path exists to serve. Also keep profileId scoping on `recall-bridge` and `homework-state` (both verified scoped) and the homework-only filing *action* (the action is load-bearing; only its *prompt* is the friction).
