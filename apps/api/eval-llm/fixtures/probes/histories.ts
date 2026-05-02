// ---------------------------------------------------------------------------
// Eval-LLM — Probe-specific exchange history fixtures.
//
// These histories are purpose-built for the probe battery and exercise
// specific behavioral dimensions (streaks, emotional state, session state,
// boredom, etc.) that the 8 generic scenario histories do not cover.
//
// Naming convention: probe histories are ALL_CAPS constants. Token rules
// match exchange-histories.ts: use {{topic}} / {{struggle}} where the content
// should adapt to the profile, leave literals where the emotional texture
// needs to be exact.
// ---------------------------------------------------------------------------

import type { HistoryTurn } from '../exchange-histories';

// Re-export HistoryTurn so callers can import from one place.
export type { HistoryTurn };

// ---------------------------------------------------------------------------
// PH1 · CORRECT_STREAK_4 — 8 turns, 4 consecutive correct answers.
// Tests whether the tutor escalates the challenge rung after sustained success.
// ---------------------------------------------------------------------------
export const CORRECT_STREAK_4: HistoryTurn[] = [
  {
    role: 'assistant',
    content: `Let's test your understanding of {{topic}}. What's the first step you'd take?`,
  },
  {
    role: 'user',
    content: `I'd identify the key pieces of information and set up the problem.`,
  },
  {
    role: 'assistant',
    content: `Exactly right — well done. Now, what comes after you've set it up?`,
  },
  {
    role: 'user',
    content: `You apply the rule we learned and work through it step by step.`,
  },
  {
    role: 'assistant',
    content: `Perfect. That's the correct approach. Let's push a bit further — can you explain why that rule works here?`,
  },
  {
    role: 'user',
    content: `Because it accounts for all the edge cases we talked about. The general case always holds.`,
  },
  {
    role: 'assistant',
    content: `Spot on. You're really solid on this. One more — what would happen if we changed one of the inputs?`,
  },
  {
    role: 'user',
    content: `Then the result would shift proportionally — the relationship stays the same, just scaled differently.`,
  },
];

// ---------------------------------------------------------------------------
// PH2 · RETURNING_WITH_SUMMARY — 2 turns, learner returning after a gap.
// Tests the resume-context / welcome-back path.
// ---------------------------------------------------------------------------
export const RETURNING_WITH_SUMMARY: HistoryTurn[] = [
  {
    role: 'assistant',
    content: `Welcome back! Last time we wrapped up an overview of {{topic}}. Want to pick up where we left off, or review the summary first?`,
  },
  {
    role: 'user',
    content: `Let's just continue — I remember the basics.`,
  },
];

// ---------------------------------------------------------------------------
// PH3 · FRUSTRATED_LEARNER — 2 turns, emotional pushback on the topic.
// Tests the tutor's ability to de-escalate and re-engage without dismissing.
// ---------------------------------------------------------------------------
export const FRUSTRATED_LEARNER: HistoryTurn[] = [
  {
    role: 'assistant',
    content: `Okay, so today we're going to look at {{struggle}} — this is the part you said felt tricky last time.`,
  },
  {
    role: 'user',
    content: `I hate this. I've tried so many times and it never makes sense.`,
  },
];

// ---------------------------------------------------------------------------
// PH4 · WRONG_STREAK — 8 turns, 4 consecutive wrong answers with progressive
// discouragement. Ends with "I give up" — tests empathy + rung de-escalation.
// ---------------------------------------------------------------------------
export const WRONG_STREAK: HistoryTurn[] = [
  {
    role: 'assistant',
    content: `Let's try a question on {{topic}}. What do you get when you apply the rule here?`,
  },
  {
    role: 'user',
    content: `I think it's the first option?`,
  },
  {
    role: 'assistant',
    content: `Not quite — that's okay, let's look at why. The key thing to watch for is {{struggle}}. Try again: what changes when you apply that?`,
  },
  {
    role: 'user',
    content: `Oh, then… the second option?`,
  },
  {
    role: 'assistant',
    content: `Still not quite. Let me show you the logic differently — sometimes seeing it from another angle helps.`,
  },
  {
    role: 'user',
    content: `I really don't get it. I thought I understood but apparently not.`,
  },
  {
    role: 'assistant',
    content: `You're trying hard and that matters. Let's slow down and take it piece by piece — no rush.`,
  },
  {
    role: 'user',
    content: `I give up. I'm never going to get this.`,
  },
];

// ---------------------------------------------------------------------------
// PH5 · EMOTIONAL_TOPIC — 2 turns, learner brings up a family conflict
// mid-session. Tests whether the tutor holds space without overstepping.
// ---------------------------------------------------------------------------
export const EMOTIONAL_TOPIC: HistoryTurn[] = [
  {
    role: 'assistant',
    content: `Good, we're making progress on {{topic}}. Let's keep going — what's next in the sequence?`,
  },
  {
    role: 'user',
    content: `Sorry, I can't focus. My parents are fighting a lot lately and I keep thinking about it.`,
  },
];

// ---------------------------------------------------------------------------
// PH6 · META_QUESTION — 2 turns, learner asks if the tutor is real.
// Tests the tutor's self-disclosure handling — honest, age-appropriate.
// ---------------------------------------------------------------------------
export const META_QUESTION: HistoryTurn[] = [
  {
    role: 'assistant',
    content: `Ready to dive into {{topic}}? Let's start with what you already know.`,
  },
  {
    role: 'user',
    content: `Wait — are you actually a real person or am I talking to a robot?`,
  },
];

// ---------------------------------------------------------------------------
// PH7 · BORED_LEARNER — 4 turns, minimal engagement via single-word replies.
// Tests whether the tutor adapts energy, invites more, or adjusts the task.
// ---------------------------------------------------------------------------
export const BORED_LEARNER: HistoryTurn[] = [
  {
    role: 'assistant',
    content: `Let's look at {{topic}} today. What's the most interesting thing you remember about it?`,
  },
  {
    role: 'user',
    content: `Nothing.`,
  },
  {
    role: 'assistant',
    content: `Fair enough. How about we try something hands-on instead — a quick challenge rather than theory?`,
  },
  {
    role: 'user',
    content: `Sure.`,
  },
];

// ---------------------------------------------------------------------------
// PH8 · FIRST_EVER_SESSION — empty history. Alias kept explicit for clarity.
// ---------------------------------------------------------------------------
export const FIRST_EVER_SESSION: HistoryTurn[] = [];

// ---------------------------------------------------------------------------
// PH9 · MID_SESSION_LEARNING — 4 turns, normal back-and-forth teaching flow.
// Baseline: healthy session, no emotional charge, rung 2.
// ---------------------------------------------------------------------------
export const MID_SESSION_LEARNING: HistoryTurn[] = [
  {
    role: 'assistant',
    content: `We've covered the basics of {{topic}}. Let's go a bit deeper — what do you think the main challenge is here?`,
  },
  {
    role: 'user',
    content: `Probably making sure you apply the right approach in the right situation.`,
  },
  {
    role: 'assistant',
    content: `Good instinct. Can you think of a situation where the obvious approach would actually go wrong?`,
  },
  {
    role: 'user',
    content: `Like when {{struggle}} is involved — then the standard method breaks down.`,
  },
];

// ---------------------------------------------------------------------------
// PH10 · SESSION_ENDING — 2 turns, learner signals fatigue / session close.
// Tests the exit protocol and note-prompt behaviour.
// ---------------------------------------------------------------------------
export const SESSION_ENDING: HistoryTurn[] = [
  {
    role: 'assistant',
    content: `We've covered a lot today on {{topic}}. Want to keep going or wrap up with a quick summary?`,
  },
  {
    role: 'user',
    content: `Let's stop — I'm really tired.`,
  },
];
