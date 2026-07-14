# Quote-rematch report — contested-row provenance verification

> Generated 2026-06-09 from run `wf_875e3fa8-4bf`. Deterministic re-verification of every contested row flagged `quote-not-found` by the haiku provenance checker. Tiers: 0=exact · 1=whitespace-norm · 2=unicode-norm · 3=markdown-stripped (all deterministic, CLEAR) · 4=anchored-fuzzy (present-with-edits) · −1=NOT FOUND.

## Summary

| Outcome | Rows | Meaning |
|---|---|---|
| **CLEARED (deterministic, tier 0-3)** | 5 | Quote provably present; the haiku flag was a formatting false-positive. Auto-resolve. |
| **CLEARED-fuzzy (tier 4 only)** | 53 | Quote present but with minor edits/truncation. Provenance holds; lower confidence. |
| **RESIDUAL (tier −1)** | 17 | Quote text not contiguously present — agent spliced/compressed non-contiguous source spans. **Manually confirmed 2026-06-09: all 17 are real, correctly-attributed findings** (see Confirmation pass). |
| Total flagged | 75 | |

## Residual rows (manually confirmed — all real, see Confirmation pass below)

| ID | WS | Scope | Also scope-disputed? | Unmatched quote (snippet) | Cited source_path |
|---|---|---|---|---|---|
| F-015 | errors-api | in-other-workstream | yes | recordSystemPrompt, recordSessionEvent, and flagContent throw a raw new Error('Session not… | `.deepsec/findings/BUG/eduagent-build-other-error-handling-72f9b181bc.md` (-1) |
| F-023 | security-pii-api | in-other-workstream | yes | evaluateQuickCheckAnswer (lines 425-453) calls the LLM unconditionally via routeAndCall(me… | `.deepsec/findings/MEDIUM/eduagent-build-expensive-api-abuse-7ebe479378.md` (-1) |
| F-025 | errors-api | in-other-workstream | yes | privateFactualConfidenceSchema is z.preprocess(fn, z.number().min(0).max(1).optional()) wi… | `.deepsec/findings/BUG/eduagent-build-other-envelope-hardfail-on-noncritical-field-93c9f9a13b.md` (-1) |
| F-025 | errors-api | in-other-workstream | yes | `privateFactualConfidenceSchema` (L32-39) is `z.preprocess(fn, z.number().min(0).max(1).op… | `.deepsec/findings/BUG/eduagent-build-other-envelope-hardfail-on-noncritical-field-93c9f9a13b.md` (-1) |
| F-027 | security-pii-api | in-other-workstream | yes | ThemedMarkdown renders LLM-generated content using react-native-markdown-display@7.0.2. It… | `.deepsec/findings/MEDIUM/eduagent-build-other-unvalidated-link-navigation-4335e6910a.md` (-1) |
| F-064 | l10n-a11y-mobile | in-other-workstream | no | `platformAlert(...)` native dialogs \| **25** \| Native confirm/error dialogs — each leaks 2… | `docs/audit/2026-05-29-full-audit/deep-review/2026-05-30-l10n-a11y-mobile/localization-scanner.md` (-1) |
| F-132 | security-pii-api | in-other-workstream | no | The 'Evaluate review verdict' step determines whether the PR's review check passes by fetc… | `.deepsec/findings/MEDIUM/eduagent-build-other-ci-gate-bypass-b391d49e68.md` (-1) |
| F-134 | security-pii-api | in-other-workstream | yes | useRevenueCatIdentity() syncs Clerk identity to RevenueCat via Purchases.logIn(userId)/log… | `.deepsec/findings/MEDIUM/eduagent-build-other-cross-account-entitlement-race-520de4c9fa.md` (-1) |
| F-142 | security-pii-api | in-other-workstream | no | checkQuizAnswerWithCorrect() appends to the round's results JSONB on every call. Three com… | `.deepsec/findings/MEDIUM/eduagent-build-other-resource-exhaustion-836fcc397f.md` (-1) |
| F-145 | security-pii-api | in-other-workstream | yes | The age computation fails open: learnerAge is null whenever activeProfile.birthYear is fal… | `.deepsec/findings/BUG/eduagent-build-other-age-gate-fail-open-9802a84a7b.md` (-1) |
| F-152 | security-pii-api | in-other-workstream | yes | tellMentorInputSchema declares childProfileId: z.string().uuid().optional(), but the consu… | `.deepsec/findings/BUG/eduagent-build-other-dead-field-latent-idor-7c0b8c2fc1.md` (-1) |
| F-154 | security-pii-api | in-other-workstream | no | The mobile-maestro job checks out github.event.workflow_run.head_sha and then executes cod… | `.deepsec/findings/BUG/eduagent-build-other-fragile-single-layer-gate-8a3944ff24.md` (-1) |
| F-157 | security-pii-api | in-other-workstream | yes | The changes job short-circuits should-run=false for ALL pull_request events at lines 45-49… | `.deepsec/findings/BUG/eduagent-build-other-ineffective-required-check-86b5df2474.md` (-1) |
| F-159 | security-pii-api | in-other-workstream | no | L76 computes const staleMsNum = parseInt(staleMs ?? '0', 10) and passes it straight to see… | `.deepsec/findings/BUG/eduagent-build-other-input-validation-ee84a692f4.md` (-1) |
| F-161 | l10n-a11y-mobile | in-other-workstream | no | matchesNonAnswerPhrase uses normalized.includes(token) for any non-answer token longer tha… | `.deepsec/findings/BUG/eduagent-build-other-logic-bug-2b8ccbc2c4.md` (-1) |
| F-162 | security-pii-inngest | in-other-workstream | yes | The function paginates with a composite (createdAt, profileId) cursor. Each run sets the n… | `.deepsec/findings/BUG/eduagent-build-other-logic-bug-6b1e72d468.md` (-1) |
| F-167 | security-pii-api | in-other-workstream | no | regenerateLanguageCurriculum verifies subject ownership (line 358), then deletes ALL curri… | `.deepsec/findings/BUG/eduagent-build-other-non-atomic-write-0b7526a752.md` (-1) |
| F-173 | security-pii-api | in-other-workstream | no | downgradeQuotaPool() is called by the trial-expiry cron for rows from findExpiredTrialsByD… | `.deepsec/findings/BUG/eduagent-build-other-race-condition-d9af95b461.md` (-1) |

## Full per-row detail

- **F-004** (architecture, deferred) → **FUZZY** — quotes: [0]=tier 1, [1]=tier 4(2/3)
- **F-006** (architecture, in-other-workstream) → **FUZZY** — quotes: [0]=tier 1, [1]=tier 4(2/3)
- **F-014** (architecture, in-other-workstream) → **CLEAN** — quotes: [0]=tier 1, [1]=tier 0
- **F-015** (errors-api, in-other-workstream) → **RESIDUAL** — quotes: [0]=tier 4(2/3), [1]=tier -1(1/3)
- **F-016** (errors-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3), [1]=tier 4(2/3)
- **F-017** (errors-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3), [1]=tier 4(2/3)
- **F-018** (security-pii-inngest, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3), [1]=tier 4(2/3)
- **F-019** (security-pii-inngest, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3), [1]=tier 4(3/3)
- **F-022** (errors-api, in-other-workstream) → **CLEAN** — quotes: [0]=tier 3, [1]=tier 3, [2]=tier 3, [3]=tier 3, [4]=tier 3
- **F-023** (security-pii-api, in-other-workstream) → **RESIDUAL** — quotes: [0]=tier 4(2/3), [1]=tier -1(1/3)
- **F-024** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3), [1]=tier 4(2/3)
- **F-025** (errors-api, in-other-workstream) → **RESIDUAL** — quotes: [0]=tier -1(0/3), [1]=tier -1(1/3)
- **F-026** (l10n-a11y-mobile, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3), [1]=tier 4(2/3)
- **F-027** (security-pii-api, in-other-workstream) → **RESIDUAL** — quotes: [0]=tier 4(2/3), [1]=tier -1(1/3), [2]=tier 4(2/3)
- **F-038** (agent-instructions, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-039** (agent-instructions, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-053** (l10n-a11y-mobile, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3)
- **F-056** (l10n-a11y-mobile, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-062** (l10n-a11y-mobile, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3)
- **F-063** (l10n-a11y-mobile, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-064** (l10n-a11y-mobile, in-other-workstream) → **RESIDUAL** — quotes: [0]=tier -1(1/3)
- **F-066** (l10n-a11y-mobile, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-078** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-081** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3)
- **F-082** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-102** (architecture, deferred) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-107** (architecture, in-other-workstream) → **CLEAN** — quotes: [0]=tier 3
- **F-108** (architecture, in-other-workstream) → **CLEAN** — quotes: [0]=tier 3
- **F-112** (architecture, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3)
- **F-117** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3)
- **F-118** (security-pii-api, in-IF-scope) → **FUZZY** — quotes: [0]=tier 4(3/3)
- **F-120** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3)
- **F-121** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-123** (l10n-a11y-mobile, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3)
- **F-125** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3)
- **F-126** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3)
- **F-129** (security-pii-api, in-other-workstream) → **CLEAN** — quotes: [0]=tier 3
- **F-132** (security-pii-api, in-other-workstream) → **RESIDUAL** — quotes: [0]=tier -1(0/3)
- **F-133** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-134** (security-pii-api, in-other-workstream) → **RESIDUAL** — quotes: [0]=tier -1(0/3)
- **F-136** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-138** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-139** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-142** (security-pii-api, in-other-workstream) → **RESIDUAL** — quotes: [0]=tier -1(1/3)
- **F-144** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-145** (security-pii-api, in-other-workstream) → **RESIDUAL** — quotes: [0]=tier -1(1/3)
- **F-146** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3)
- **F-147** (architecture, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-148** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-149** (architecture, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-151** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-152** (security-pii-api, in-other-workstream) → **RESIDUAL** — quotes: [0]=tier -1(0/3)
- **F-153** (architecture, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-154** (security-pii-api, in-other-workstream) → **RESIDUAL** — quotes: [0]=tier -1(0/3)
- **F-155** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-157** (security-pii-api, in-other-workstream) → **RESIDUAL** — quotes: [0]=tier -1(1/3)
- **F-159** (security-pii-api, in-other-workstream) → **RESIDUAL** — quotes: [0]=tier -1(1/3)
- **F-160** (l10n-a11y-mobile, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-161** (l10n-a11y-mobile, in-other-workstream) → **RESIDUAL** — quotes: [0]=tier -1(1/3)
- **F-162** (security-pii-inngest, in-other-workstream) → **RESIDUAL** — quotes: [0]=tier -1(1/3)
- **F-165** (l10n-a11y-mobile, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-166** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-167** (security-pii-api, in-other-workstream) → **RESIDUAL** — quotes: [0]=tier -1(0/3)
- **F-168** (l10n-a11y-mobile, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-169** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3)
- **F-170** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3)
- **F-171** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3)
- **F-172** (l10n-a11y-mobile, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-173** (security-pii-api, in-other-workstream) → **RESIDUAL** — quotes: [0]=tier -1(1/3)
- **F-174** (security-pii-inngest, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3)
- **F-176** (security-pii-api, in-IF-scope) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-178** (l10n-a11y-mobile, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-179** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(2/3)
- **F-180** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3)
- **F-181** (security-pii-api, in-other-workstream) → **FUZZY** — quotes: [0]=tier 4(3/3)

---

## Confirmation pass — 2026-06-09 (manual read of all 17 residuals)

Each of the 17 residual rows was read against its cited source file. **Verdict: 17/17 are genuine, correctly-attributed findings.** The deterministic matcher flagged them only because the extract agent **compressed or spliced non-contiguous spans** of the source `## Finding` section into the stored quote (e.g. F-064 collapsed the localization-scanner H2 table row into inline pipe-form; F-015 stitched two sentences). In every case:

- the cited file is topically exact (filenames literally name the defect), and
- the finding's specific claims (file:line, mechanism) appear in the source, and
- each .deepsec finding carries its own `## Revalidation: true-positive` against live code.

**No fabrications. No wrong-source attributions.** The `verbatim_quote` anti-hallucination contract was violated cosmetically (paraphrase, not literal copy) — a workflow extraction-quality defect, not a data-integrity one.

### Net provenance verdict for all 75 quote-flagged rows

| Tier | Rows | Provenance status |
|---|---|---|
| Verbatim-clean (0-3) | 5 | Sound — literal quote present |
| Anchored (4) | 53 | Sound — real text, light edits/truncation |
| Residual (−1), manually confirmed | 17 | Sound — real finding, paraphrased quote |
| **Total** | **75** | **All real and correctly sourced** |

### Carry-forward
- This pass resolved **provenance only**, not scope. The 9 of 17 residuals that were also scope-disputed were ruled at **Gate 1 (closed 2026-06-09)** — see `gate1-closure.md` for their in/out disposition; none remain contested.
- Workflow fix for future runs: enforce literal copying in the extract prompt + re-extract loop when the provenance check fails (today it only flags).
