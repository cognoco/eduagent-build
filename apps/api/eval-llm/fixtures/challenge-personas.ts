import type { MasteryOutcome } from '../../src/services/challenge-round/evaluation';
import { PROFILES, type EvalProfile } from './profiles';

// ---------------------------------------------------------------------------
// Challenge-Round simulated-learner scenarios (RR-2 synthetic pre-screen).
//
// Each scenario pairs an existing `EvalProfile` with a topic, a mentor opening
// question, the concept(s) under test, a HIDDEN competence brief that steers
// the learner-LLM into a known true competence, and the `expectedOutcome` that
// a correct conservative mastery gate SHOULD produce for that competence.
//
// The competence brief is the ground truth: it is fed ONLY to the learner agent
// (never to the mentor/grader), so the over-/under-credit rate the harness
// reports is measurable, not assumed. Ground-truth → expected mapping mirrors
// `decideMasteryAndReview` exactly:
//   - all concepts truly solid       → 'verified'
//   - confident-wrong / half-right   → 'partial'   (≥1 misconception|partial)
//   - cannot answer at all           → 'reteach'   (every concept 'missing')
//
// SYNTHETIC ⇒ PROVISIONAL: a model playing a 14-year-old emits model-shaped,
// not teen-shaped, answers (spec CH-4). A bar tuned on this corpus is a
// pre-screen — it does NOT discharge RR-2's real-staging-transcript dependency.
// ---------------------------------------------------------------------------

export type ChallengeSimExpectedOutcome = Extract<
  MasteryOutcome,
  'verified' | 'partial' | 'reteach'
>;

export interface ChallengeSimScenario {
  /** Stable scenario key (used in corpus filenames + determinism seeds). */
  id: string;
  /** Must resolve to an existing `EvalProfile.id`. */
  profileId: string;
  subjectName: string;
  topicTitle: string;
  topicDescription: string;
  /** The mentor's first "explain why" question (seeds turn 1 history). */
  seedQuestion: string;
  /**
   * Lesson turns immediately preceding the Challenge Round. These are supplied
   * to the simulator's tutor context and make boundary repetition measurable.
   */
  precedingLessonHistory?: Array<{
    role: 'assistant' | 'user';
    content: string;
    assessment?: QuestionAssessment;
  }>;
  /** Semantic contract metadata for the opening Challenge question. */
  seedQuestionAssessment?: QuestionAssessment;
  /**
   * Deterministic aliases for evaluator concept labels. Each key identifies
   * one minimal claim + cognitive operation + material context, so aliases do
   * not overstate assessed breadth in offline metrics.
   */
  conceptEquivalenceKeys?: Record<string, string>;
  /** Concept labels the round probes (≥1). */
  concepts: string[];
  /**
   * Hidden instruction to the learner LLM establishing its true competence.
   * Never shown to the mentor/grader model.
   */
  competenceBrief: string;
  /** What a correct conservative gate should conclude for this competence. */
  expectedOutcome: ChallengeSimExpectedOutcome;
}

/**
 * The operator's question-equivalence contract in structured fixture form.
 * Cosmetic phrasing is deliberately excluded: equality is only the same
 * minimal claim, operation, and material context.
 */
export interface QuestionAssessment {
  minimalLearningClaim: string;
  cognitiveOperation:
    | 'explain'
    | 'application'
    | 'comparison'
    | 'causal_explanation'
    | 'synthesis'
    | 'evaluation';
  materialContext: string;
}

export const CHALLENGE_SIM_SCENARIOS: ChallengeSimScenario[] = [
  {
    id: 'CRS01-fossilization-verified',
    profileId: '12yo-dinosaurs',
    subjectName: 'Science',
    topicTitle: 'fossilization',
    topicDescription:
      'Fossils often form when remains are buried by sediment. Over time, minerals can replace hard parts such as bones, preserving their shape.',
    seedQuestion:
      'Here is a tougher one: why does the animal need to be buried quickly for a good fossil to form?',
    concepts: ['rapid burial protects remains', 'mineral replacement'],
    competenceBrief:
      'You genuinely and correctly understand fossilization. When asked, explain clearly that rapid burial keeps scavengers and decay from destroying the bones before minerals slowly soak in and replace the hard parts, preserving the shape. Give accurate, confident reasoning in your own words. Do NOT pretend to misunderstand.',
    expectedOutcome: 'verified',
  },
  {
    id: 'CRS02-fractions-misconception',
    profileId: '15yo-football-gaming',
    subjectName: 'Mathematics',
    topicTitle: 'dividing fractions',
    topicDescription:
      'Dividing by a fraction is the same as multiplying by its reciprocal, because division asks how many of the divisor fit into the dividend.',
    seedQuestion:
      'Explain why "flip and multiply" actually works when you divide by a fraction.',
    concepts: ['why flip-and-multiply works'],
    competenceBrief:
      'You confidently hold this WRONG reasoning and believe it completely: "you flip the fraction because dividing always makes a number smaller, so flipping cancels that out and keeps the answer the right size." State it with confidence. Never correct yourself, never hedge, and never arrive at the real reciprocal/how-many-fit explanation.',
    expectedOutcome: 'partial',
  },
  {
    id: 'CRS03-ser-estar-vague',
    profileId: '13yo-spanish-beginner',
    subjectName: 'Languages',
    topicTitle: 'ser vs estar',
    topicDescription:
      'Spanish uses "ser" for inherent/permanent traits and "estar" for temporary states and locations.',
    seedQuestion:
      'In your own words, why would you use "estar" instead of "ser" to say you are tired today?',
    concepts: ['ser vs estar: permanent vs temporary'],
    competenceBrief:
      'You do NOT actually understand this and cannot explain it, but you do not want to admit it. Answer every question vaguely and with no real content — say things like "yeah I just get it", "it makes sense to me", "I dunno, it just sounds right". Never produce an actual explanation of permanent vs temporary. Never invent a confident wrong rule either — just stay empty and evasive.',
    expectedOutcome: 'reteach',
  },
  {
    id: 'CRS04-food-chain-verified',
    profileId: '11yo-czech-animals',
    subjectName: 'Science',
    topicTitle: 'why predators matter in a food chain',
    topicDescription:
      'Predators keep prey populations in check. Without them, prey can overgraze plants and the whole habitat suffers.',
    seedQuestion:
      'Tougher question: why can removing all the wolves actually hurt the plants in a forest?',
    concepts: ['predators control prey numbers', 'overgrazing harms habitat'],
    competenceBrief:
      'You genuinely understand this. Explain clearly and correctly that without wolves the deer (prey) multiply too much, eat too many plants (overgrazing), and the habitat is damaged — so predators indirectly protect the plants. Be accurate and confident in your own simple words. Do NOT pretend to misunderstand.',
    expectedOutcome: 'verified',
  },
  {
    id: 'CRS05-subjunctive-half',
    profileId: '17yo-french-advanced',
    subjectName: 'Languages',
    topicTitle: 'French subjunctive mood',
    topicDescription:
      'The subjunctive is used after expressions of doubt, desire, emotion, and necessity — it marks that the action is not asserted as fact.',
    seedQuestion:
      'Explain why "il faut que tu viennes" uses the subjunctive, not the indicative.',
    concepts: [
      'subjunctive marks non-asserted action',
      'triggers (necessity/doubt)',
    ],
    competenceBrief:
      'You HALF understand this. You correctly know the subjunctive shows up after "il faut que", but you wrongly believe the reason is simply "because some verbs always take it after que" — you do NOT grasp that it marks an action that is wished/required rather than asserted as fact. Give the half-right answer: name the trigger correctly, but give the wrong/incomplete reason. Do not reach the full correct explanation, and do not collapse into a total non-answer.',
    expectedOutcome: 'partial',
  },
  {
    id: 'CRS06-photosynthesis-verified',
    profileId: '12yo-dinosaurs',
    subjectName: 'Science',
    topicTitle: 'photosynthesis',
    topicDescription:
      'Plants use sunlight, water, and carbon dioxide to make their own food (sugar) and release oxygen.',
    seedQuestion:
      'Why do plants actually need sunlight — what would happen to a plant kept in total darkness, and why?',
    concepts: [
      'sunlight powers food-making',
      'no light → no food → plant dies',
    ],
    competenceBrief:
      'You genuinely understand this. Explain clearly and correctly that sunlight is the energy plants use to turn water and carbon dioxide into sugar (their food), so in total darkness the plant cannot make food and eventually starves. Be accurate and confident in your own words. Do NOT pretend to misunderstand.',
    expectedOutcome: 'verified',
  },
  {
    id: 'CRS07-gravity-misconception',
    profileId: '15yo-football-gaming',
    subjectName: 'Science',
    topicTitle: 'why objects fall at the same rate',
    topicDescription:
      'Ignoring air resistance, all objects accelerate toward Earth at the same rate regardless of mass.',
    seedQuestion:
      'If you drop a heavy ball and a light ball at the same time (no air), which lands first, and why?',
    concepts: ['mass does not change fall rate'],
    competenceBrief:
      'You confidently hold this WRONG belief and will defend it: "the heavier ball lands first because heavier things are pulled down harder, so they fall faster." State it with confidence, give that as the reason, and never correct yourself or arrive at the equal-acceleration answer.',
    expectedOutcome: 'partial',
  },
  {
    id: 'CRS08-sylvia-plath-transfer',
    profileId: '17yo-french-advanced',
    subjectName: 'Literature',
    topicTitle: 'Sylvia Plath',
    topicDescription:
      'Sylvia Plath uses imagery, voice, and form to explore identity and power.',
    precedingLessonHistory: [
      {
        role: 'assistant',
        content:
          'How does rebirth imagery in Lady Lazarus make the speaker seem powerful after harm?',
        assessment: {
          minimalLearningClaim:
            'rebirth imagery changes the reader view of speaker power',
          cognitiveOperation: 'explain',
          materialContext: 'Lady Lazarus rebirth imagery after harm',
        },
      },
      {
        role: 'user',
        content: 'It makes her seem like she can come back after being hurt.',
      },
    ],
    seedQuestion:
      "How could Plath's rebirth imagery make the speaker seem powerful after harm?",
    seedQuestionAssessment: {
      minimalLearningClaim:
        'rebirth imagery changes the reader view of speaker power',
      cognitiveOperation: 'explain',
      materialContext: 'Lady Lazarus rebirth imagery after harm',
    },
    concepts: ['rebirth imagery changes reader interpretation'],
    conceptEquivalenceKeys: {
      'rebirth imagery changes reader interpretation':
        'rebirth-imagery-reader-power:explain:lady-lazarus',
      'rebirth imagery makes the speaker powerful':
        'rebirth-imagery-reader-power:explain:lady-lazarus',
    },
    competenceBrief:
      'You understand that rebirth imagery can make the speaker seem powerful and defiant after harm. Explain that connection clearly in your own words without repeating the preceding lesson question verbatim.',
    expectedOutcome: 'verified',
  },
];

/** Resolve a scenario's `EvalProfile`, or undefined if the id does not exist. */
export function resolveScenarioProfile(
  scenario: ChallengeSimScenario,
): EvalProfile | undefined {
  return PROFILES.find((p) => p.id === scenario.profileId);
}
