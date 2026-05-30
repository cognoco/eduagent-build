# [MEDIUM] Raw learner subject input forwarded to Sentry in fallback catch block

**File:** [`apps/api/src/services/language-detect.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/language-detect.ts#L87-L89) (lines 87, 88, 89)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-pii-in-traces`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

In detectLanguageSubject(), the catch block calls captureException(err, { extra: { context: 'language-detect.fallback', rawInput } }) (L87-89), shipping the verbatim learner-typed subject text (`rawInput`, e.g. 'I want to learn Spanish' — sourced from input.rawInput ?? input.name in subject.ts:240) to the Sentry sub-processor on every LLM failure. This directly contradicts the codebase's own learner-data-egress standard: session-llm-summary.ts goes to significant lengths under 'AC 337 (spec line 288)' to strip learner-narrative fragments from Sentry payloads (formatZodIssuesForAudit() sends only field paths, never received values; see L64-86, L289-303 of session-llm-summary.ts). The threat model flags this app as regulatory-sensitive (children's education, consent/privacy-critical), so routing unscrubbed learner free-text to a third-party telemetry service is a genuine data-governance inconsistency. Note the local logger.warn at L90-93 correctly logs only err.message, not rawInput — so the leak is specifically the Sentry `extra`. The XSS patterns the scanner flagged at L49/L53 are false positives: that is an LLM ChatMessage built with escapeXml(rawInput) wrapped in a <subject_text> tag, with no HTML sink. Severity is bounded because the leaked data is short subject-name text (not transcripts/credentials) and Sentry is an internal/trusted processor not directly attacker-readable; a triager treating subject names as non-sensitive could reasonably downgrade to LOW.

## Recommendation

Drop `rawInput` from the Sentry `extra` payload (keep it only in the local logger if needed), or send a scrubbed derivative (e.g. rawInput.length, detected hint code) instead of the verbatim text — mirroring the AC 337 pattern already used in session-llm-summary.ts. If the raw text is genuinely needed for debugging, gate it behind an explicit non-production flag.

## Revalidation

**Verdict:** true-positive

This matches current code exactly: language-detect.ts:87-89 calls captureException(err, { extra: { context: 'language-detect.fallback', rawInput } }) on every LLM failure, shipping the verbatim learner-typed subject text (rawInput = input.rawInput ?? input.name from subject.ts:240) to the Sentry sub-processor. The adjacent logger.warn (lines 90-93) correctly logs only err.message, so the leak is specifically the Sentry extra. I verified the codebase's own contradicting standard: session-llm-summary.ts:64-86 (formatZodIssuesForAudit) 'Returns only field paths for Sentry — strips issue.message entirely so received-value fragments (which may echo learner narrative) never leave the server process in Sentry payloads. AC 337 (spec line 288).' Routing unscrubbed learner free-text to a third-party telemetry processor in a regulatory-sensitive children's-education app is a genuine data-governance inconsistency. Severity is bounded (short subject-name text, not transcripts/credentials; Sentry is a trusted processor), so as the finding itself notes a triager could reasonably land at LOW; MEDIUM is defensible given the explicit standard being violated. Fix: drop rawInput from the Sentry extra (or send a scrubbed derivative), mirroring AC 337.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-27)
