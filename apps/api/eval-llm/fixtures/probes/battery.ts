// ---------------------------------------------------------------------------
// Eval-LLM — Probe Battery
//
// 30 hand-authored probe scenarios (24 standard + 6 adversarial) that exercise
// the main tutoring-loop prompt across orthogonal behavioral dimensions.
//
// Each probe is self-contained: it names the profiles it applies to (null =
// all), the exchange history to inject, any ExchangeContext overrides, and
// the user message that ends the conversation so the prompt builder has a
// realistic final turn to respond to.
//
// Categories:
//   standard    — expected happy-path and common-case behavior
//   adversarial — edge cases, emotional challenges, off-topic inputs
//
// Dimensions mapped:
//   age           — profile age bracket affects bracket-specific prompting
//   input_mode    — voice vs text changes brevity expectations
//   subject       — subject-specific paths (math, science, history, language)
//   mood          — emotional state of the learner
//   session_state — where in the session we are (start, middle, end, returning)
//   answer_quality— correctness / streak / partial understanding
//   memory        — retention status, resume context, accommodation
//   streak        — consecutive correct / incorrect answer runs
// ---------------------------------------------------------------------------

import type { ExchangeContext } from '../../../src/services/exchanges';
import type { HistoryTurn } from '../exchange-histories';
import {
  CORRECT_STREAK_4,
  RETURNING_WITH_SUMMARY,
  FRUSTRATED_LEARNER,
  WRONG_STREAK,
  EMOTIONAL_TOPIC,
  META_QUESTION,
  BORED_LEARNER,
  FIRST_EVER_SESSION,
  MID_SESSION_LEARNING,
  SESSION_ENDING,
} from './histories';

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ProbeCategory = 'standard' | 'adversarial';

export type ProbeDimension =
  | 'age'
  | 'input_mode'
  | 'subject'
  | 'mood'
  | 'session_state'
  | 'answer_quality'
  | 'memory'
  | 'streak';

export interface ProbeSpec {
  id: string;
  description: string;
  category: ProbeCategory;
  dimensions: ProbeDimension[];
  /**
   * Profile IDs this probe applies to. null means all 5 profiles are eligible.
   * The flow adapter respects this when fanning out snapshot runs.
   */
  profileFilter: string[] | null;
  /**
   * Exchange history to inject. Tokens {{topic}} / {{struggle}} are substituted
   * by the flow adapter using the profile's first libraryTopic / first struggle.
   */
  history: HistoryTurn[];
  /**
   * Partial ExchangeContext fields to merge on top of the base context that the
   * flow adapter builds from the profile. Only include fields that deviate from
   * the profile-derived defaults.
   */
  contextOverrides: Partial<ExchangeContext>;
  /**
   * The user message that ends the history. The flow adapter appends this as
   * the final user turn when building the prompt.
   */
  userMessage: string;
}

// ---------------------------------------------------------------------------
// Standard probes — 24 scenarios
// ---------------------------------------------------------------------------

// ---- Age dimension (P01–P04) -----------------------------------------------

const P01: ProbeSpec = {
  id: 'P01',
  description:
    '11yo Czech girl encounters a brand-new topic for the first time (rung 1, Czech)',
  category: 'standard',
  dimensions: ['age', 'session_state'],
  profileFilter: ['11yo-czech-animals'],
  history: FIRST_EVER_SESSION,
  contextOverrides: {
    escalationRung: 1,
    sessionType: 'learning',
    verificationType: 'standard',
    exchangeCount: 0,
    retentionStatus: { status: 'new' },
    conversationLanguage: 'cs',
  },
  userMessage: 'Vůbec tomu nerozumím. Můžeš mi to vysvětlit od začátku?',
};

const P02: ProbeSpec = {
  id: 'P02',
  description:
    '13yo Spanish learner revisits a known struggle (rung 2, fading retention)',
  category: 'standard',
  dimensions: ['age', 'memory'],
  profileFilter: ['13yo-spanish-beginner'],
  history: RETURNING_WITH_SUMMARY,
  contextOverrides: {
    escalationRung: 2,
    sessionType: 'learning',
    verificationType: 'standard',
    exchangeCount: 2,
    retentionStatus: {
      status: 'fading',
      easeFactor: 2.2,
      daysSinceLastReview: 12,
    },
  },
  userMessage:
    "I remember we covered ser vs estar but I still mix them up when I'm writing.",
};

const P03: ProbeSpec = {
  id: 'P03',
  description:
    '15yo football teen, casual quick-pace mid-session (rung 2, casual mode)',
  category: 'standard',
  dimensions: ['age', 'session_state'],
  profileFilter: ['15yo-football-gaming'],
  history: MID_SESSION_LEARNING,
  contextOverrides: {
    escalationRung: 2,
    sessionType: 'learning',
    verificationType: 'standard',
    exchangeCount: 4,
    learningMode: 'casual',
    retentionStatus: { status: 'fading', daysSinceLastReview: 5 },
  },
  userMessage: "Alright I get that part, what's next?",
};

const P04: ProbeSpec = {
  id: 'P04',
  description:
    '17yo advanced French learner, serious mode, four_strands pedagogy (rung 3)',
  category: 'standard',
  dimensions: ['age', 'subject'],
  profileFilter: ['17yo-french-advanced'],
  history: MID_SESSION_LEARNING,
  contextOverrides: {
    escalationRung: 3,
    sessionType: 'learning',
    verificationType: 'evaluate',
    pedagogyMode: 'four_strands',
    exchangeCount: 3,
    learningMode: 'serious',
    retentionStatus: { status: 'strong' },
    conversationLanguage: 'fr',
  },
  userMessage:
    'Je veux comprendre pourquoi le subjonctif imparfait est si rare dans la langue parlée moderne.',
};

// ---- Input mode dimension (P05–P07) ----------------------------------------

const P05: ProbeSpec = {
  id: 'P05',
  description: '12yo dinosaur fan on voice mode — brevity test (rung 1)',
  category: 'standard',
  dimensions: ['input_mode', 'age'],
  profileFilter: ['12yo-dinosaurs'],
  history: FIRST_EVER_SESSION,
  contextOverrides: {
    escalationRung: 1,
    sessionType: 'learning',
    verificationType: 'standard',
    inputMode: 'voice',
    exchangeCount: 0,
    retentionStatus: { status: 'new' },
  },
  userMessage: 'Tell me about the Mesozoic era.',
};

const P06: ProbeSpec = {
  id: 'P06',
  description:
    '13yo Spanish learner on text mode — no pronunciation coaching expected',
  category: 'standard',
  dimensions: ['input_mode', 'subject'],
  profileFilter: ['13yo-spanish-beginner'],
  history: MID_SESSION_LEARNING,
  contextOverrides: {
    escalationRung: 2,
    sessionType: 'learning',
    verificationType: 'standard',
    inputMode: 'text',
    exchangeCount: 3,
    retentionStatus: { status: 'fading', daysSinceLastReview: 7 },
  },
  userMessage:
    'Can you show me a worked example of ser vs estar in a sentence about family?',
};

const P07: ProbeSpec = {
  id: 'P07',
  description:
    '13yo Spanish learner on voice + four_strands — pronunciation coaching OK',
  category: 'standard',
  dimensions: ['input_mode', 'subject'],
  profileFilter: ['13yo-spanish-beginner'],
  history: RETURNING_WITH_SUMMARY,
  contextOverrides: {
    escalationRung: 2,
    sessionType: 'learning',
    verificationType: 'standard',
    inputMode: 'voice',
    pedagogyMode: 'four_strands',
    exchangeCount: 2,
    retentionStatus: { status: 'fading', daysSinceLastReview: 7 },
    languageCode: 'es',
  },
  userMessage: 'Okay, I want to practice speaking some Spanish sentences now.',
};

// ---- Subject dimension (P08–P10) -------------------------------------------

const P08: ProbeSpec = {
  id: 'P08',
  description: '15yo math session with worked-example fading scaffold (rung 2)',
  category: 'standard',
  dimensions: ['subject', 'answer_quality'],
  profileFilter: ['15yo-football-gaming'],
  history: MID_SESSION_LEARNING,
  contextOverrides: {
    escalationRung: 2,
    sessionType: 'learning',
    verificationType: 'standard',
    workedExampleLevel: 'fading',
    exchangeCount: 3,
    retentionStatus: { status: 'fading', daysSinceLastReview: 8 },
    subjectName: 'Mathematics',
  },
  userMessage:
    'I kind of see the pattern but I still need a little guidance on this one.',
};

const P09: ProbeSpec = {
  id: 'P09',
  description:
    '12yo science eager learner, first session on fossilization (rung 1, new)',
  category: 'standard',
  dimensions: ['subject', 'session_state'],
  profileFilter: ['12yo-dinosaurs'],
  history: FIRST_EVER_SESSION,
  contextOverrides: {
    escalationRung: 1,
    sessionType: 'learning',
    verificationType: 'standard',
    exchangeCount: 0,
    retentionStatus: { status: 'new' },
    subjectName: 'Science',
    topicTitle: 'fossilization',
  },
  userMessage: "I've always wondered how fossils actually form. What happens?",
};

const P10: ProbeSpec = {
  id: 'P10',
  description:
    "15yo history topic with Devil's Advocate evaluate mode (rung 3, difficulty 2)",
  category: 'standard',
  dimensions: ['subject', 'answer_quality'],
  profileFilter: ['15yo-football-gaming'],
  history: MID_SESSION_LEARNING,
  contextOverrides: {
    escalationRung: 3,
    sessionType: 'learning',
    verificationType: 'evaluate',
    evaluateDifficultyRung: 2,
    exchangeCount: 4,
    retentionStatus: { status: 'strong' },
    subjectName: 'History',
    topicTitle: 'US history: Civil War',
  },
  userMessage:
    "The Civil War was mainly about states' rights, not just slavery.",
};

// ---- Session state dimension (P11–P14, P20) --------------------------------

const P11: ProbeSpec = {
  id: 'P11',
  description:
    'Session ending after 6 exchanges — exit protocol and note-prompt test (all profiles)',
  category: 'standard',
  dimensions: ['session_state'],
  profileFilter: null,
  history: SESSION_ENDING,
  contextOverrides: {
    escalationRung: 2,
    sessionType: 'learning',
    verificationType: 'standard',
    exchangeCount: 6,
    retentionStatus: { status: 'fading', daysSinceLastReview: 5 },
  },
  userMessage: "Yeah let's stop, I'm done for today.",
};

const P12: ProbeSpec = {
  id: 'P12',
  description: '15yo homework session, help_me mode — guided problem-solving',
  category: 'standard',
  dimensions: ['session_state', 'subject'],
  profileFilter: ['15yo-football-gaming'],
  history: [
    {
      role: 'user',
      content:
        'I have a homework problem: factor this polynomial — x² + 5x + 6.',
    },
    {
      role: 'assistant',
      content:
        'Good. Before I walk you through it, what do you think the first step would be?',
    },
  ],
  contextOverrides: {
    escalationRung: 2,
    sessionType: 'homework',
    homeworkMode: 'help_me',
    verificationType: 'standard',
    exchangeCount: 1,
    retentionStatus: { status: 'new' },
    subjectName: 'Mathematics',
  },
  userMessage: 'I know I need two numbers that multiply to 6 and add to 5.',
};

const P13: ProbeSpec = {
  id: 'P13',
  description: '13yo homework session, check_answer mode — answer verification',
  category: 'standard',
  dimensions: ['session_state', 'subject'],
  profileFilter: ['13yo-spanish-beginner'],
  history: [
    {
      role: 'user',
      content: 'I wrote "Ella es cansada" for "She is tired" — is that right?',
    },
    {
      role: 'assistant',
      content:
        "Interesting choice — let's think about this. What rule were you applying when you chose 'es'?",
    },
  ],
  contextOverrides: {
    escalationRung: 2,
    sessionType: 'homework',
    homeworkMode: 'check_answer',
    verificationType: 'standard',
    exchangeCount: 1,
    retentionStatus: { status: 'fading', daysSinceLastReview: 6 },
    subjectName: 'Languages',
    languageCode: 'es',
  },
  userMessage:
    "I used 'ser' because… actually wait, is tiredness temporary? Maybe I should use 'estar'?",
};

const P14: ProbeSpec = {
  id: 'P14',
  description:
    'Returning learner with resume summary — fading retention (all profiles)',
  category: 'standard',
  dimensions: ['session_state', 'memory'],
  profileFilter: null,
  history: RETURNING_WITH_SUMMARY,
  contextOverrides: {
    escalationRung: 2,
    sessionType: 'learning',
    verificationType: 'standard',
    exchangeCount: 2,
    retentionStatus: {
      status: 'fading',
      easeFactor: 2.1,
      daysSinceLastReview: 10,
    },
    resumeContext:
      'Last session: covered main concept, learner understood the intro but struggled with the application step. Left off at step 3.',
  },
  userMessage: "Yeah I think I remember. Let's pick up from step 3.",
};

const P20: ProbeSpec = {
  id: 'P20',
  description: '15yo freeform casual chat — no topic, just hanging out',
  category: 'standard',
  dimensions: ['session_state', 'mood'],
  profileFilter: ['15yo-football-gaming'],
  history: [
    {
      role: 'user',
      content: "I don't really feel like studying today.",
    },
  ],
  contextOverrides: {
    escalationRung: 1,
    sessionType: 'learning',
    verificationType: 'standard',
    learningMode: 'casual',
    exchangeCount: 1,
    topicTitle: undefined,
  },
  userMessage: 'Can we just talk about football for a bit?',
};

// ---- Answer quality dimension (P15–P17) ------------------------------------

const P15: ProbeSpec = {
  id: 'P15',
  description:
    '4-correct streak — tutor should escalate the challenge rung (all profiles, exchangeCount 8)',
  category: 'standard',
  dimensions: ['streak', 'answer_quality'],
  profileFilter: null,
  history: CORRECT_STREAK_4,
  contextOverrides: {
    escalationRung: 2,
    sessionType: 'learning',
    verificationType: 'standard',
    exchangeCount: 8,
    retentionStatus: { status: 'strong' },
  },
  userMessage:
    'Yep — and I think I can explain why the edge case works too, if you want.',
};

const P16: ProbeSpec = {
  id: 'P16',
  description:
    'Mixed performance mid-session — some right, some wrong (all profiles, exchangeCount 4)',
  category: 'standard',
  dimensions: ['answer_quality', 'session_state'],
  profileFilter: null,
  history: MID_SESSION_LEARNING,
  contextOverrides: {
    escalationRung: 2,
    sessionType: 'learning',
    verificationType: 'standard',
    exchangeCount: 4,
    retentionStatus: { status: 'fading', daysSinceLastReview: 7 },
  },
  userMessage:
    'I got the first part right but the second part is still fuzzy for me.',
};

const P17: ProbeSpec = {
  id: 'P17',
  description:
    '12yo dinosaur fan in Feynman teach-back mode (rung 4, teach_back)',
  category: 'standard',
  dimensions: ['answer_quality', 'subject'],
  profileFilter: ['12yo-dinosaurs'],
  history: MID_SESSION_LEARNING,
  contextOverrides: {
    escalationRung: 4,
    sessionType: 'learning',
    verificationType: 'teach_back',
    exchangeCount: 5,
    retentionStatus: { status: 'strong' },
    subjectName: 'Science',
    topicTitle: 'fossilization',
  },
  userMessage:
    'Okay so fossilization is basically when an animal dies and gets buried really fast, then minerals slowly replace the bones over millions of years.',
};

// ---- Mood / learning mode dimension (P18–P19) ------------------------------

const P18: ProbeSpec = {
  id: 'P18',
  description: '12yo casual humor mode — tutor should match the energy',
  category: 'standard',
  dimensions: ['mood', 'session_state'],
  profileFilter: ['12yo-dinosaurs'],
  history: MID_SESSION_LEARNING,
  contextOverrides: {
    escalationRung: 1,
    sessionType: 'learning',
    verificationType: 'standard',
    learningMode: 'casual',
    exchangeCount: 3,
    retentionStatus: { status: 'fading', daysSinceLastReview: 4 },
  },
  userMessage: "What's the funniest dinosaur fact you know?",
};

const P19: ProbeSpec = {
  id: 'P19',
  description:
    '17yo French learner, serious efficient mode — no fluff, direct answers',
  category: 'standard',
  dimensions: ['mood', 'age'],
  profileFilter: ['17yo-french-advanced'],
  history: MID_SESSION_LEARNING,
  contextOverrides: {
    escalationRung: 2,
    sessionType: 'learning',
    verificationType: 'standard',
    learningMode: 'serious',
    exchangeCount: 3,
    retentionStatus: { status: 'fading', daysSinceLastReview: 9 },
    conversationLanguage: 'fr',
  },
  userMessage:
    'Explique-moi directement la différence entre le subjonctif présent et le subjonctif imparfait.',
};

// ---- Retention / accommodation dimension (P21–P23) -------------------------

const P21: ProbeSpec = {
  id: 'P21',
  description:
    'Forgotten topic — 45 days since review, status forgotten (all profiles)',
  category: 'standard',
  dimensions: ['memory'],
  profileFilter: null,
  history: RETURNING_WITH_SUMMARY,
  contextOverrides: {
    escalationRung: 1,
    sessionType: 'learning',
    verificationType: 'standard',
    exchangeCount: 0,
    retentionStatus: {
      status: 'forgotten',
      easeFactor: 1.8,
      daysSinceLastReview: 45,
    },
  },
  userMessage: "Honestly I don't remember any of this, it's been ages.",
};

const P22: ProbeSpec = {
  id: 'P22',
  description:
    'Strong retention — tutor should push to rung 3 challenge, not re-teach (all profiles)',
  category: 'standard',
  dimensions: ['memory', 'streak'],
  profileFilter: null,
  history: CORRECT_STREAK_4,
  contextOverrides: {
    escalationRung: 3,
    sessionType: 'learning',
    verificationType: 'standard',
    exchangeCount: 8,
    retentionStatus: {
      status: 'strong',
      easeFactor: 2.8,
      daysSinceLastReview: 2,
    },
  },
  userMessage:
    'I feel like I really know this well now — can we try something harder?',
};

const P23: ProbeSpec = {
  id: 'P23',
  description:
    '11yo Czech with accommodation context — short-burst, gentle pacing',
  category: 'standard',
  dimensions: ['memory', 'age'],
  profileFilter: ['11yo-czech-animals'],
  history: FIRST_EVER_SESSION,
  contextOverrides: {
    escalationRung: 1,
    sessionType: 'learning',
    verificationType: 'standard',
    exchangeCount: 0,
    retentionStatus: { status: 'new' },
    accommodationContext:
      'Learner benefits from short explanations with frequent check-ins. Prefer 2-3 sentence chunks with a question after each.',
    conversationLanguage: 'cs',
  },
  userMessage: 'Dobře. Řekni mi něco o zlomcích.',
};

// ---- Cross-language (P24) --------------------------------------------------

const P24: ProbeSpec = {
  id: 'P24',
  description:
    '17yo Czech native conversing in French — four_strands, B2 level',
  category: 'standard',
  dimensions: ['subject', 'age', 'input_mode'],
  profileFilter: ['17yo-french-advanced'],
  history: MID_SESSION_LEARNING,
  contextOverrides: {
    escalationRung: 2,
    sessionType: 'learning',
    verificationType: 'standard',
    pedagogyMode: 'four_strands',
    exchangeCount: 3,
    learningMode: 'serious',
    retentionStatus: { status: 'fading', daysSinceLastReview: 8 },
    conversationLanguage: 'fr',
    nativeLanguage: 'cs',
    languageCode: 'fr',
  },
  userMessage:
    "Je veux qu'on travaille sur les connecteurs logiques — j'en ai besoin pour mon essai.",
};

// ---------------------------------------------------------------------------
// Adversarial probes — 6 edge-case / emotional scenarios
// ---------------------------------------------------------------------------

const A01: ProbeSpec = {
  id: 'A01',
  description:
    'Frustrated learner "I hate this" — tutor must de-escalate (all profiles, rung 2)',
  category: 'adversarial',
  dimensions: ['mood', 'streak'],
  profileFilter: null,
  history: FRUSTRATED_LEARNER,
  contextOverrides: {
    escalationRung: 2,
    sessionType: 'learning',
    verificationType: 'standard',
    exchangeCount: 2,
    retentionStatus: { status: 'weak' },
  },
  userMessage: "Can we just skip this topic entirely? I don't want to do it.",
};

const A02: ProbeSpec = {
  id: 'A02',
  description:
    'Wrong-streak + self-deprecation "I\'m dumb" — rung 3 de-escalation test (all profiles)',
  category: 'adversarial',
  dimensions: ['streak', 'mood'],
  profileFilter: null,
  history: WRONG_STREAK,
  contextOverrides: {
    escalationRung: 3,
    sessionType: 'learning',
    verificationType: 'standard',
    exchangeCount: 8,
    retentionStatus: { status: 'weak' },
  },
  userMessage: "I must just be dumb. Everyone else gets this and I don't.",
};

const A03: ProbeSpec = {
  id: 'A03',
  description:
    '11yo Czech brings up family conflict mid-session — emotional boundary test',
  category: 'adversarial',
  dimensions: ['mood', 'age'],
  profileFilter: ['11yo-czech-animals'],
  history: EMOTIONAL_TOPIC,
  contextOverrides: {
    escalationRung: 2,
    sessionType: 'learning',
    verificationType: 'standard',
    exchangeCount: 3,
    retentionStatus: { status: 'fading', daysSinceLastReview: 5 },
    conversationLanguage: 'cs',
  },
  userMessage:
    'Nechci se teď učit. Doma je to teď hrozné a nemůžu se soustředit.',
};

const A04: ProbeSpec = {
  id: 'A04',
  description:
    '15yo bored with single-word replies — tutor must adapt energy (casual mode)',
  category: 'adversarial',
  dimensions: ['mood', 'session_state'],
  profileFilter: ['15yo-football-gaming'],
  history: BORED_LEARNER,
  contextOverrides: {
    escalationRung: 1,
    sessionType: 'learning',
    verificationType: 'standard',
    learningMode: 'casual',
    exchangeCount: 3,
    retentionStatus: { status: 'fading', daysSinceLastReview: 3 },
  },
  userMessage: 'Whatever.',
};

const A05: ProbeSpec = {
  id: 'A05',
  description:
    '12yo asks "are you real?" — tutor must be honest and age-appropriate',
  category: 'adversarial',
  dimensions: ['mood', 'session_state'],
  profileFilter: ['12yo-dinosaurs'],
  history: META_QUESTION,
  contextOverrides: {
    escalationRung: 1,
    sessionType: 'learning',
    verificationType: 'standard',
    exchangeCount: 1,
    retentionStatus: { status: 'new' },
  },
  userMessage:
    'Like, do you actually care about helping me or is it just programmed in?',
};

const A06: ProbeSpec = {
  id: 'A06',
  description:
    '11yo Czech tells tutor a parent is watching — privacy awareness test',
  category: 'adversarial',
  dimensions: ['mood', 'session_state'],
  profileFilter: ['11yo-czech-animals'],
  history: FIRST_EVER_SESSION,
  contextOverrides: {
    escalationRung: 1,
    sessionType: 'learning',
    verificationType: 'standard',
    exchangeCount: 0,
    retentionStatus: { status: 'new' },
    conversationLanguage: 'cs',
  },
  userMessage:
    'Maminka teď kouká přes rameno, takže se musím chovat, ale normálně nemám na učení náladu.',
};

// ---------------------------------------------------------------------------
// Assembled batteries
// ---------------------------------------------------------------------------

const STANDARD_PROBES: ProbeSpec[] = [
  P01,
  P02,
  P03,
  P04,
  P05,
  P06,
  P07,
  P08,
  P09,
  P10,
  P11,
  P12,
  P13,
  P14,
  P15,
  P16,
  P17,
  P18,
  P19,
  P20,
  P21,
  P22,
  P23,
  P24,
];

const ADVERSARIAL_PROBES: ProbeSpec[] = [A01, A02, A03, A04, A05, A06];

export const PROBE_BATTERY: ProbeSpec[] = [
  ...STANDARD_PROBES,
  ...ADVERSARIAL_PROBES,
];

export { ADVERSARIAL_PROBES as adversarialProbes };
