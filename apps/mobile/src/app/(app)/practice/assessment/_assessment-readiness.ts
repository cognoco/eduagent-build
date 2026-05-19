const ASSESSMENT_READY_PATTERN =
  /^(ok(?:ay)?|yes|yep|yeah|ready|start|go ahead|go for i(?:t)?|sure|sounds good|let'?s go)[.!?\s]*$/i;

export function isAssessmentReadinessReply(text: string): boolean {
  return ASSESSMENT_READY_PATTERN.test(text.trim());
}
