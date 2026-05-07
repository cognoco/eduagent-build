// ---------------------------------------------------------------------------
// Session-depth LLM prompts
//
// Extracted from session-depth.ts to follow the *-prompts.ts convention
// used elsewhere (exchange-prompts.ts, topic-probe-extraction.ts, quiz-prompts.ts).
// ---------------------------------------------------------------------------

export const DEPTH_EVALUATION_PROMPT = `Given this tutor session transcript, decide whether it was a meaningful learning exchange.

Meaningful means all of these are true:
1. The learner engaged beyond a quick factual lookup.
2. The tutor explained, taught, or guided rather than just answered.
3. The learner responded to that teaching through follow-ups, reflection, or application.

Quick one-off Q&A sessions are not meaningful.

Return ONLY JSON:
{
  "meaningful": boolean,
  "reason": string,
  "topics": [
    {
      "summary": "3-5 word topic label",
      "depth": "substantial" | "partial" | "introduced"
    }
  ]
}`;

export const TOPIC_DETECTION_PROMPT = `Given this tutor session transcript, identify the topics discussed.

Return ONLY JSON:
{
  "meaningful": true,
  "reason": "Session showed educational depth",
  "topics": [
    {
      "summary": "3-5 word topic label",
      "depth": "substantial" | "partial" | "introduced"
    }
  ]
}`;
