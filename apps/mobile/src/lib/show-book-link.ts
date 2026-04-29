// [BUG-919] Determines whether to render the "Want to see your previous
// lessons? Go to the Library" hint inside an active /session screen. Hint is
// help text for the empty state — once the learner sends a message, the
// hint stops earning its place above the conversation feed.
//
// Inputs:
// - effectiveMode: homework sessions never show the library hint (homework
//   has its own filing flow).
// - totalTopicsCompleted: zero-completion learners get a different empty
//   state, so the hint is only useful once they have library content to
//   look back on.
// - messagesLength: counts everything in the chat list, including the
//   seeded opening assistant greeting (messages[0]). Anything beyond 1
//   means the conversation has actually started.
export function shouldShowBookLink(params: {
  effectiveMode: string;
  totalTopicsCompleted: number;
  messagesLength: number;
}): boolean {
  if (params.effectiveMode === 'homework') return false;
  if (params.totalTopicsCompleted <= 0) return false;
  if (params.messagesLength > 1) return false;
  return true;
}
