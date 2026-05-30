# [MEDIUM] Streaming extractor can show a different reply than the one parsed and persisted

**File:** [`apps/api/src/services/llm/stream-envelope.ts`](https://github.com/cognoco/eduagent-build//blob/main/apps/api/src/services/llm/stream-envelope.ts#L17-L318) (lines 17, 227, 242, 299, 318)
**Project:** eduagent-build
**Severity:** MEDIUM  •  **Confidence:** medium  •  **Slug:** `other-audit-bypass`

## Owners

**Suggested assignee:** `zuzana.kopecna@zwizzly.com` _(via last-committer)_

## Finding

streamEnvelopeReply finds the first regex match for a reply key anywhere in the raw stream, not specifically the top-level envelope reply. If an LLM response includes an unknown object before the real top-level reply, the stream can emit the nested reply and then discard the rest, while completion-time parsing accepts the top-level reply and persists different text. Prompt-injected or drifted model output could therefore be displayed live to the learner without matching the transcript, export, or parent-facing persisted assistant message.

## Recommendation

Make the streaming extractor JSON-aware: track object depth and string state, and only emit the top-level reply field expected by the envelope. Consider rejecting unknown pre-reply top-level fields, making the envelope schema strict, or comparing the streamed reply with the parsed reply before marking the exchange complete.

## Revalidation

**Verdict:** true-positive

The divergence is real. streamEnvelopeReply's state machine starts in 'find_reply_key' and uses REPLY_KEY_RE = /"reply"\s*:/ via exec() over the raw buffer (line 343), matching the FIRST `"reply":` token anywhere in the stream — including one nested inside an earlier object — then emits that value and discards the remainder ('after_reply'). The persisted text takes a different route: session-exchange.ts onComplete awaits rawResponsePromise (the full raw text) and calls classifyExchangeOutcome(rawResponse) (exchanges.ts:1816) → parseEnvelope → envelope.reply (top-level), persisting sourceSafe.response derived from parsed.cleanResponse (session-exchange.ts:3142-3241). I verified the top-level llmResponseEnvelopeSchema (llm-envelope.ts:428) has NO .strict()/.passthrough(), so default Zod STRIPS unknown keys: an output like `{"x":{"reply":"AAA"},"reply":"BBB","signals":{}}` parses to reply="BBB" (signalsSchema keeps all fields optional, so {} is valid), while the live stream emits "AAA". Result: learner sees one reply live; the transcript/export/parent-facing persisted message shows another — a genuine audit-integrity gap in a parent-monitored minors app. Exploitability is bounded: direct user-text injection is largely defused because user content is JSON-string-escaped (`\"reply\":` does not match the unescaped /"reply"\s*:/ regex), so triggering it requires genuine model drift emitting a nested reply-bearing object before the top-level reply. Real correctness/integrity defect, low attacker-steerability — MEDIUM is reasonable.

## Recent committers (`git log`)

- Zuzana Kopečná <zuzana.kopecna@zwizzly.com> (2026-05-18)
