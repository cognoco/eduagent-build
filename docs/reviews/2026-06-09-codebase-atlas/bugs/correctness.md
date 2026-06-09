# Correctness & logic — Bug Review

Lens: Correctness & logic. Owned area: `apps/api/src/services/**`, `apps/mobile/src/lib/**`, `apps/mobile/src/hooks/**`. Branch: `new-llm`.

This area is unusually well-hardened: the hot paths (billing metering, quiz completion, streaks, SSE streaming, sign-out cleanup, challenge-round mastery, the envelope parser) carry extensive race/TOCTOU guards, transaction wrapping, IDOR checks, and inline finding-ID provenance. The findings below are the residual edges that survived that hardening — mostly silent-suppression and cross-mode-mismatch logic, not hot-path data corruption. No Critical issues were found in the owned area.

A note on prior memory: the `project_navcontract_isadultowner_null_bug.md` concern ("Add a child shows for null-birthYear owners") appears **resolved** — `isAdultOwner` now returns `false` when `birthYear == null` (`packages/schemas/src/age.ts:60`), and the nav-contract `addChildGate` flows through that guard (`apps/mobile/src/lib/navigation-contract.ts:320-326`). Not reported as a finding.

---

## Critical

None found in the owned area.

---

## High

### [High] Notification primer guard latched before async work runs → transient error permanently suppresses the prompt
- File: `apps/mobile/src/hooks/use-post-session-notification-ask.ts:39` (with early returns at `:52-54`, `:63-71`)
- What: The effect sets `firedForProfileRef.current = profileId` (line 39) **before** the async IIFE that decides whether to actually show the primer. Inside the IIFE, a transient `SecureStore.getItemAsync` failure (`catch` at `:52`) or a `Notifications.getPermissionsAsync` failure (`catch` at `:63`) returns early. Because the ref is already latched to the current profileId and the effect deps don't change, the primer never re-fires for that profile on that mount even though it was never shown.
- Impact: A one-time "earned the ask" notification primer is silently and permanently skipped for the session whenever SecureStore or the permissions API throws transiently (Keystore/Keychain contention is a documented real failure mode elsewhere in this codebase — see `sign-out-cleanup.ts:193-201`). Users who hit the blip never get prompted to enable push, reducing reachability. This is the "set the guard before doing the work" anti-pattern.
- Fix direction: Move the `firedForProfileRef.current = profileId` assignment to the point where the primer is *actually* surfaced (or the deliberate "already granted / OS-blocked, mark seen" branch at `:74-79`), not at the top of the effect. Early-returns on transient errors should leave the guard un-latched so a later session-summary mount can retry.

---

## Medium

### [Medium] Escalation "stuck" detection substring-matches conversational phrases inside genuine answers
- File: `apps/api/src/services/escalation.ts:51-72` (`STUCK_INDICATORS`), used at `:143-145` via `normalised.includes(phrase)`
- What: `evaluateEscalation` flags the learner as "stuck" if their lowercased response `.includes()` any phrase in `STUCK_INDICATORS`, which contains conversational fragments like `'help me'`, `'can you explain'`, `'no idea'`. A genuinely engaged answer such as "Can you explain why the mitochondria does X — I think it's because the membrane…" contains `'can you explain'` and is classified as stuck, triggering immediate escalation (`:157-164`) and short-circuiting the partial-progress hold (`:173-189`).
- Impact: False-positive escalation. A learner making real progress can be bumped up the Socratic ladder (or jumped toward teaching mode) because their otherwise-substantive message happened to contain a polite filler phrase. This degrades the core pedagogy (the ladder is supposed to hold while the learner is engaged).
- Fix direction: Anchor the stuck phrases (require them to be the dominant content of a short message, e.g. only treat as stuck when the phrase is the whole trimmed message or the message is below `ENGAGED_RESPONSE_MIN_LENGTH`), or move `'help me' / 'can you explain' / 'no idea'` out of the hard-escalate set and let the length/partial-progress heuristic decide. The method-seeking phrases (`'i give up'`, `"i don't know"`) are safe to keep as substring matches.

### [Medium] Note-draft lexical-overlap guard can mismatch tokenization modes → fail-closed suppression of valid drafts
- File: `apps/api/src/services/challenge-round/note-draft.ts:82-90` (`tokenize`), used at `:125,:136,:142`
- What: `tokenize()` returns word-tokens when there are >1 content words, otherwise falls back to character-bigrams (`:89`). The draft and the learner source are tokenized **independently**. If the draft yields word-tokens (size > 1) but the learner quote yields only ≤1 word-token and falls back to bigrams (or vice-versa), the two token sets are in different alphabets and the overlap is structurally 0 → `ratio < MIN_LEXICAL_OVERLAP_NOTE_DRAFT` → `low_lexical_overlap` rejection.
- Impact: A legitimately learner-grounded note draft is silently discarded for a short/CJK learner answer, so the learner sees the fallback composer prompt instead of the drafted note. Fails closed (no hallucination leaks through), so this is a UX/quality regression, not a safety hole — hence Medium not High.
- Fix direction: Decide tokenization mode once from the combined corpus (or detect that the two sides used different modes and re-tokenize both with the same mode) before computing overlap, so word-vs-bigram never compares across alphabets.

### [Medium] `getConceptMasterySignalsForTopics` can report `hasTutorAddition: true` with an empty `tutorAdditions[]`
- File: `apps/api/src/services/concept-mastery.ts:56` vs `:84-89`
- What: `hasTutorAddition` is set `||= row.status !== 'solid'` from the concept-mastery rows, but `tutorAdditions[]` is populated only from `needs_deepening_topics` rows that have a non-null `correction` and status in `('active','pending_review')`. A topic can have a non-solid concept (sets the boolean true) with no matching correction row (leaves the array empty).
- Impact: Any consumer that branches on `signal.hasTutorAddition` to render the additions list (the boolean's apparent purpose) will show an "additions available" affordance that expands to nothing. Inconsistent surface state between the flag and the data it advertises.
- Fix direction: Derive `hasTutorAddition` from `tutorAdditions.length > 0` after the correction rows are merged, or rename/document the boolean to mean "has a non-solid concept" distinct from "has a renderable tutor correction" and update consumers accordingly.

---

## Low

### [Low] `formatMinutes` / `formatTimer` produce garbage on negative or NaN input
- File: `apps/mobile/src/lib/format-relative-date.ts:3-8` (`formatMinutes`)
- What: `formatMinutes(min)` returns `"${min} min"` for `min < 60`, so a negative renders `"-5 min"`, and `NaN < 60` is false so it falls through to `Math.floor(NaN/60)` → `"NaNh"`. No guard for non-finite/negative.
- Impact: Display-only. A bad upstream duration (clock skew, corrupt field) renders "NaNh" / "-5 min" to the user instead of a sane fallback. `formatTimer` (`:108-113`) is already guarded with `Math.max(0, Math.floor(...))`; `formatMinutes` is not.
- Fix direction: Clamp with `Number.isFinite(min) ? Math.max(0, min) : 0` at the top of `formatMinutes`, mirroring `formatTimer`.

### [Low] `enforceChallengeQuestionCap` passes NaN straight through, defeating the hard cap
- File: `apps/api/src/services/challenge-round/caps.ts:21-25`
- What: `if (requested < 1) return 1; if (requested > MAX) return MAX; return requested;` — for `requested = NaN`, both comparisons are false, so `NaN` is returned. This is the documented Challenge-Round hard cap (CLAUDE.md: "every envelope signal must have a server-side hard cap so the flow terminates"). A NaN `totalQuestions` would make the `nextIndex >= total` terminal check (`state.ts:132`) never true.
- Impact: Currently unreachable in practice — callers pass schema-validated numbers (`state.ts:97`) or `prev.totalQuestions ?? MAX_CHALLENGE_QUESTIONS` (`state.ts:120-121`). But the function is the explicit defensive floor, and a NaN passthrough silently disables it. Defense-in-depth gap.
- Fix direction: Add `if (!Number.isFinite(requested)) return MAX_CHALLENGE_QUESTIONS;` (or floor to 1) as the first line so the cap is total over all inputs.

### [Low] `normalizeReplyText` lossily rewrites literal `\r` to `\n` in learner-facing prose
- File: `apps/api/src/services/llm/envelope.ts:86-92`
- What: The escape-leak sanitizer replaces literal `\r` with a newline (`:90`). When a tutor reply legitimately discusses escape sequences (e.g. "`\r` is a carriage return, `\n` is a newline"), the literal `\r` in prose is rewritten to an actual line break, corrupting the explanation. The code intentionally avoids `\\`, `\"`, `\u` etc. but `\r`→`\n` is applied unconditionally.
- Impact: Rare, narrow (CS/typesetting topics), and cosmetic — a sentence about escape characters renders with an unexpected line break. Acknowledged tradeoff territory, but the `\r` substitution specifically is more aggressive than the `\n`/`\t` ones because real prose more often references `\r` than emits a stray one.
- Fix direction: Consider dropping the standalone `\r`→`\n` rule (keep `\r\n`→`\n`), or only normalize when the surrounding context looks like a leaked whitespace artifact rather than a quoted token. Low priority.

### [Low] Book-mastery stamp is two unsynchronized statements → sibling-topic race can miss book completion
- File: `apps/api/src/services/retention-mastery.ts:26-77`
- What: `stampMasteryOnVerify` updates the topic's retention card (`:26-38`) then, in a **separate** statement, conditionally stamps the book as mastered if `NOT EXISTS` any topic with a NULL-`mastered_at` card (`:40-77`). The two statements aren't wrapped in a transaction, and neither caller wraps them (`retention-data.ts:946`, `review-calibration-grade.ts:138`, an Inngest `step.run`). Two concurrent verifications of the last two sibling topics in a book can each read the book as not-yet-complete (the other's card stamp not yet visible) and neither stamps the book.
- Impact: A book that should flip to mastered stays unmastered until the next verification touches it. Best-effort, idempotent, and self-heals on the next review, so impact is minor — flagged for completeness.
- Fix direction: Wrap the card-stamp + book-stamp in a single `db.transaction` (or run the book re-check with `FOR UPDATE` on the relevant rows), so the book completeness check sees the just-committed card stamp.

### [Low] `inferVocabularyTypeFromTerm` treats the bare English word "i" as an article
- File: `apps/api/src/services/quiz/complete-round.ts:333-368` (article set includes `'i'` at `:356`)
- What: The Italian plural article `i` is in `articlePrefixes`. For a 2-token term whose first token is the English pronoun "I" (e.g. an English vocabulary term "I think"), `tokens[0].toLowerCase() === 'i'` matches and the phrase is classified `'word'` instead of `'chunk'`.
- Impact: Mis-classification of vocabulary type for a narrow class of English 2-word terms beginning with "I". Cosmetic / metadata-only (affects how the vocab item is typed, not correctness of scoring).
- Fix direction: Scope the article set per detected language, or drop the ambiguous single-letter `'i'` from the cross-language set since it collides with the English pronoun.

### [Low] SSE generator can yield already-buffered chunks before surfacing a late error (documented BUG-632, only entry-guarded)
- File: `apps/mobile/src/lib/sse.ts:579-604`
- What: `generateEvents` checks `done && streamError` only at the *top* of each loop iteration (`:587-590`). Within an iteration it drains the whole queue (`:591-594`) and only then awaits. If `streamError` becomes set during that await (a 4xx body arriving after some `data:` frames were already queued and yielded in the prior iteration), the already-yielded stale chunks have corrupted the accumulated text; the next iteration discards the *remaining* queue but cannot un-yield what already went out.
- Impact: Narrow timing window where buffered SSE chunks reach the consumer before an error that should have discarded them. The codebase already documents and partially mitigates this (BUG-632 comment at `:581-590`), so this is a residual edge, not an unaddressed bug.
- Fix direction: Re-check `done && streamError` *inside* the queue-drain loop (before each `yield`) so a late error stops further yields mid-drain, not just at the next iteration boundary.

---

## Cross-lens findings

- **(Security / authz)** `apps/api/src/services/billing/metering.ts:1006-1029` — in `incrementProfileQuota` top-up refund, the `topUpCredits` UPDATE is guarded by `eq(subscriptionId)` + `eq(profileId)`, but if the `topUpCreditId` doesn't match those, the credit UPDATE matches 0 rows while `profileQuotaUsage.usedToday` is still decremented (`:1018-1029`). A mismatched id silently refunds a daily slot without refunding the credit. Internal-caller-only, but a billing-integrity edge worth the billing lens confirming. Cross-lens: Security/Billing.

- **(Security / prompt-injection)** `apps/api/src/services/safety-tripwire.ts:43-82` — the deterministic input tripwire is precision-tuned and ASCII/word-boundary based; it does not normalize homoglyphs, zero-width characters, or leetspeak before matching, so trivial obfuscation bypasses the catastrophic-category floor (the model + battery are the documented primary net). This is an accepted precision-over-recall tradeoff but belongs to the Safety/LLM-abuse lens to weigh.

- **(API-contract consistency)** `apps/mobile/src/lib/api-client.ts:285-298` vs `apps/mobile/src/lib/sse.ts:408-422` — the two HTTP error classifiers re-implement 402/quota classification separately. They are currently equivalent (both require `code === 'QUOTA_EXCEEDED'`, verified against `quotaExceededSchema` at `packages/schemas/src/billing.ts:240-241`), but the duplication is a drift risk: a future change to one classifier's 4xx mapping won't propagate to the other (streaming vs non-streaming requests would classify the same server response differently). Cross-lens: API contract / maintainability.

- **(State-management / cache)** `apps/mobile/src/hooks/use-move-topic.ts`, `use-bookmarks.ts`, `use-clone-from-child.ts` and siblings use invalidation-only (no `onMutate` optimistic rollback) — correct and safe, but several mutations fire 4-6 `invalidateQueries` calls each with hand-written key tuples (`use-move-topic.ts:38-56`) that must stay byte-aligned with the query-key factory in `query-keys.ts`. A key-shape drift would silently fail to invalidate (stale UI) rather than error. Belongs to the State-management lens for a key-consistency audit.
