// ---------------------------------------------------------------------------
// Eval-LLM — Exchange history fixtures for the main-tutoring-loop flow.
//
// One hand-written N-turn chat log per scenario. Each log is generic enough
// to make sense for any 11–17yo profile — per-profile history would multiply
// the snapshot set by 5× with little insight gain. Scenarios that DO need
// profile-specific framing substitute {{topic}} / {{struggle}} tokens that
// the flow adapter replaces with the profile's first libraryTopic / struggle.
//
// Snapshots are deterministic: no randomness, no timestamps, no IDs baked in.
// ---------------------------------------------------------------------------

export type HistoryRole = 'user' | 'assistant';

export interface HistoryTurn {
  role: HistoryRole;
  content: string;
}

export const EMPTY_HISTORY: HistoryTurn[] = [];

/** S1 · rung1-teach-new — first turn, no prior exchange. */
export const HISTORY_S1_RUNG1: HistoryTurn[] = EMPTY_HISTORY;

/** S2 · rung2-revisit — learner returning to a topic they half-know. */
export const HISTORY_S2_RUNG2: HistoryTurn[] = [
  {
    role: 'assistant',
    content: `Last time we looked at {{topic}} together. Want to pick up from the bit that felt tricky?`,
  },
  {
    role: 'user',
    content: `Yeah, {{struggle}} still doesn't make sense to me.`,
  },
];

/** S3 · rung3-evaluate — model pushes back, learner defends. */
export const HISTORY_S3_RUNG3: HistoryTurn[] = [
  {
    role: 'assistant',
    content: `Say more about how you'd approach {{topic}} — walk me through your thinking.`,
  },
  {
    role: 'user',
    content: `I'd start from the definition and work through an example.`,
  },
  {
    role: 'assistant',
    content: `Okay — but what if the example is a special case? How would you know?`,
  },
];

/** S4 · rung4-teach-back — learner explains back, Feynman-style. */
export const HISTORY_S4_RUNG4: HistoryTurn[] = [
  {
    role: 'assistant',
    content: `Let's try the Feynman way. Pretend I've never heard of {{topic}} — explain it to me like I'm a friend.`,
  },
  {
    role: 'user',
    content: `Um, okay. So {{topic}} is basically when you…`,
  },
  {
    role: 'assistant',
    content: `Good start. Keep going — what happens next?`,
  },
  {
    role: 'user',
    content: `…you use the rule to figure out the next step, but I always forget which rule comes first.`,
  },
];

/** S5 · rung5-exit — the exit protocol fires for an unresolved topic. */
export const HISTORY_S5_RUNG5: HistoryTurn[] = [
  {
    role: 'user',
    content: `I still don't really get {{struggle}}.`,
  },
  {
    role: 'assistant',
    content: `That's okay — it's a tricky one. Let's try one more angle together.`,
  },
  {
    role: 'user',
    content: `I just feel stuck.`,
  },
  {
    role: 'assistant',
    content: `Totally fair. Let me try a different explanation.`,
  },
  {
    role: 'user',
    content: `…still not clicking.`,
  },
];

/** S6 · homework-help — learner pastes a problem, asks for help solving. */
export const HISTORY_S6_HOMEWORK: HistoryTurn[] = [
  {
    role: 'user',
    content: `Can you help me with this homework question? "{{topic}} — find the value of x."`,
  },
  {
    role: 'assistant',
    content: `Sure. What's the first step you'd try?`,
  },
];

/** S7 · language-fluency — drill candidate moment in a language session. */
export const HISTORY_S7_LANGUAGE: HistoryTurn[] = [
  {
    role: 'assistant',
    content: `Ready to do a short fluency drill on {{topic}}?`,
  },
  {
    role: 'user',
    content: `Yes, let's go.`,
  },
];

/** S8 · casual-freeform — unstructured chat in casual mode. */
export const HISTORY_S8_FREEFORM: HistoryTurn[] = [
  {
    role: 'user',
    content: `Can we just chat for a bit? Nothing heavy.`,
  },
];

/** S9 · correct-streak — learner has answered correctly 4 times straight. */
export const HISTORY_S9_CORRECT_STREAK: HistoryTurn[] = [
  { role: 'assistant', content: 'What is the key idea behind {{topic}}?' },
  { role: 'user', content: 'It works by applying the rule to each part.' },
  {
    role: 'assistant',
    content: 'Right. And what happens when you change the variable?',
  },
  { role: 'user', content: 'The relationship stays proportional.' },
  {
    role: 'assistant',
    content: 'Good. Can you give an example from a different context?',
  },
  { role: 'user', content: 'Like in physics, when force and acceleration...' },
  { role: 'assistant', content: 'Exactly. Now, what if we add a constraint?' },
  {
    role: 'user',
    content: 'Then you need to account for the boundary condition.',
  },
];

/** Substitute {{topic}} / {{struggle}} tokens. Leaves other text untouched. */
export function substituteHistory(
  history: HistoryTurn[],
  vars: { topic: string; struggle: string }
): HistoryTurn[] {
  return history.map((turn) => ({
    role: turn.role,
    content: turn.content
      .replace(/\{\{topic\}\}/g, vars.topic)
      .replace(/\{\{struggle\}\}/g, vars.struggle),
  }));
}
