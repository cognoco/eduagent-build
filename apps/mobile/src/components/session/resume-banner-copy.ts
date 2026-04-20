/**
 * Returns the resume-banner subtitle copy for the session screen.
 *
 * Introduced by the proactivity copy sweep (docs/specs/2026-04-19-proactivity-copy-sweep-design.md, C5).
 *
 * When the session has a known topic, the banner references it so the kid
 * doesn't have to scroll up to remember what they were doing. When the topic
 * is missing (null, undefined, or empty/whitespace-only — the partial-hydration
 * case from the spec's Failure Modes table), the banner falls back to a
 * generic invitation that makes no promise the LLM can't keep.
 *
 * @param topicName - Topic title from the active session route params, if any.
 */
export function getResumeBannerCopy(
  topicName: string | null | undefined
): string {
  if (topicName && topicName.trim().length > 0) {
    return `Welcome back — you were exploring ${topicName}. Keep going?`;
  }
  return 'Welcome back! Ready to keep going?';
}
