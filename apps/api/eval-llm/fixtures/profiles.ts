// ---------------------------------------------------------------------------
// Eval-LLM — Synthetic Learner Profile Fixtures
//
// These profiles span the age × interest × level × locale matrix used by the
// eval harness. Each flow adapter maps a subset of this full profile into
// the specific inputs that flow's prompt builder expects.
//
// Product constraint: the app targets learners 11+. Profiles below 11 are
// invalid and must never be added. Note that dictation/generate.ts and
// quiz/config.ts contain age branches for <11 which are dead in production;
// see docs/specs/2026-04-18-llm-personalization-audit.md for the finding.
//
// Keep this set small. 6–10 profiles is the working ceiling — more than that
// and snapshot review becomes impractical during tuning sessions.
// ---------------------------------------------------------------------------

export type InterestContext = 'free_time' | 'school' | 'both';

export interface InterestEntry {
  label: string;
  /**
   * Where the interest lives in the learner's life:
   * - `free_time`: hobby only, don't force into school-subject prompts
   * - `school`: curricular interest, safe to use across subject prompts
   * - `both`: passion that overlaps school & personal
   */
  context: InterestContext;
}

export interface EvalProfile {
  /** Stable kebab-case key used as the snapshot filename and CLI filter. */
  id: string;
  /** Human-readable one-liner shown at the top of every snapshot. */
  description: string;

  /**
   * WI-2462 — opt out of the global flow × profile cross-product.
   *
   * The runner fans EVERY flow across EVERY profile in PROFILES, so adding one
   * profile silently adds one sample to every flow that builds a default
   * prompt — expanding the weekly live gate's matrix and cost for flows the
   * new profile was never meant to exercise.
   *
   * When true, this profile participates ONLY where a scenario pins it by
   * profileId (a flow's `enumerateScenarios`). Flows that would otherwise
   * build one anonymous sample per profile skip it, exactly as if their
   * `buildPromptInput` had returned null for it. That is what lets a profile
   * be added for targeted scenario coverage without moving any other flow's
   * scenario or snapshot counts.
   *
   * Omit it (the default) for a profile that SHOULD appear across the whole
   * matrix — this is a narrowing flag, never a performance tweak.
   */
  scenarioOnly?: boolean;

  // Demographics ----------------------------------------------------------
  ageYears: number;
  birthYear: number;
  /** The learner's native / L1 language. ISO 639-1. */
  nativeLanguage: string;
  /**
   * The language the learner wants the tutor to speak to them in during
   * exchanges. Planned onboarding dimension — defaults to nativeLanguage
   * unless the learner prefers otherwise (e.g. bilingual learners).
   * ISO 639-1.
   */
  conversationLanguage: string;
  location: 'EU' | 'US' | 'OTHER';
  /**
   * Optional — not collected by default at onboarding. Only older learners
   * are prompted. Free-form for "other"; empty string means "not provided".
   */
  pronouns?: string;

  // Interests & library -------------------------------------------------
  /** Ordered by salience — most prominent first. */
  interests: InterestEntry[];
  /** Currently studying — raw topic titles from the learner's library. */
  libraryTopics: string[];

  // Learning level ------------------------------------------------------
  cefrLevel?: string; // A1 / A2 / B1 / B2 / C1 / C2
  targetLanguage?: string; // ISO 639-1 — for language-learning subjects

  // Struggles & strengths ----------------------------------------------
  struggles: Array<{ topic: string; subject: string | null }>;
  strengths: Array<{ topic: string; subject: string | null }>;

  // Quiz history --------------------------------------------------------
  recentQuizAnswers: {
    capitals: string[];
    vocabulary: string[];
    guessWho: string[];
  };

  // Style & pacing ------------------------------------------------------
  preferredExplanations: Array<
    'stories' | 'examples' | 'diagrams' | 'analogies' | 'step-by-step' | 'humor'
  >;
  pacePreference: 'quick' | 'thorough';
  analogyDomain?:
    | 'cooking'
    | 'sports'
    | 'building'
    | 'music'
    | 'nature'
    | 'gaming';
}

// ---------------------------------------------------------------------------
// The baseline fixture set (all profiles ≥11 per product constraint).
//
// Spans: ages 11–17 × EU/US × Czech/English native × language-learner vs not
// × serious/casual × diverse interest contexts. Pronouns sprinkled sparingly
// to exercise the optional path without making every snapshot verbose.
// ---------------------------------------------------------------------------

export const PROFILES: EvalProfile[] = [
  {
    id: '11yo-czech-animals',
    description:
      '11-year-old EU girl, Czech native, youngest in the target range, loves animals and nature, thorough pacer',
    ageYears: 11,
    birthYear: 2015,
    nativeLanguage: 'cs',
    conversationLanguage: 'cs',
    location: 'EU',
    pronouns: undefined,
    interests: [
      { label: 'horses', context: 'free_time' },
      { label: 'forest animals', context: 'free_time' },
      { label: 'nature journaling', context: 'both' },
      { label: 'drawing', context: 'free_time' },
    ],
    libraryTopics: [
      'Czech reading comprehension',
      'basic fractions',
      'human body systems',
      'water cycle',
    ],
    cefrLevel: undefined,
    targetLanguage: undefined,
    struggles: [
      { topic: 'fraction addition', subject: 'math' },
      { topic: 'long multi-clause sentences', subject: 'reading' },
    ],
    strengths: [{ topic: 'vocabulary retention', subject: 'Czech' }],
    recentQuizAnswers: { capitals: [], vocabulary: [], guessWho: [] },
    preferredExplanations: ['stories', 'examples'],
    pacePreference: 'thorough',
    analogyDomain: 'nature',
  },
  {
    id: '12yo-dinosaurs',
    description:
      '12-year-old US boy, English native, obsessed with dinosaurs and prehistoric life, quick pace, humor works',
    ageYears: 12,
    birthYear: 2014,
    nativeLanguage: 'en',
    conversationLanguage: 'en',
    location: 'US',
    pronouns: undefined,
    interests: [
      { label: 'dinosaurs', context: 'both' },
      { label: 'fossils', context: 'both' },
      { label: 'paleontology', context: 'both' },
      { label: 'extinction events', context: 'free_time' },
      { label: 'volcanoes', context: 'free_time' },
    ],
    libraryTopics: [
      'Mesozoic era',
      'fossilization',
      'plate tectonics',
      'long division',
    ],
    cefrLevel: undefined,
    targetLanguage: undefined,
    struggles: [
      { topic: 'long division', subject: 'math' },
      { topic: 'Austria vs Australia', subject: 'geography' },
    ],
    strengths: [
      { topic: 'dinosaur classification', subject: 'science' },
      { topic: 'reading comprehension', subject: 'reading' },
    ],
    recentQuizAnswers: {
      capitals: ['Tokyo', 'Paris', 'Canberra'],
      vocabulary: [],
      guessWho: ['Mary Anning'],
    },
    preferredExplanations: ['humor', 'examples', 'stories'],
    pacePreference: 'quick',
    analogyDomain: 'nature',
  },
  {
    id: '13yo-spanish-beginner',
    description:
      '13-year-old EU girl, English native, learning Spanish (CEFR A2), loves horses and equestrian sports',
    ageYears: 13,
    birthYear: 2013,
    nativeLanguage: 'en',
    conversationLanguage: 'en',
    location: 'EU',
    pronouns: 'she/her',
    interests: [
      { label: 'horses', context: 'free_time' },
      { label: 'showjumping', context: 'free_time' },
      { label: 'eventing', context: 'free_time' },
      { label: 'nature photography', context: 'free_time' },
    ],
    libraryTopics: [
      'Spanish present tense verbs',
      'Spanish family vocabulary',
      'Spanish numbers 1-1000',
      'Spain geography',
    ],
    cefrLevel: 'A2',
    targetLanguage: 'es',
    struggles: [
      { topic: 'ser vs estar', subject: 'Spanish' },
      { topic: 'irregular verbs', subject: 'Spanish' },
    ],
    strengths: [{ topic: 'Spanish pronunciation', subject: 'Spanish' }],
    recentQuizAnswers: {
      capitals: ['Madrid'],
      vocabulary: ['el caballo', 'la escuela', 'el perro'],
      guessWho: [],
    },
    preferredExplanations: ['step-by-step', 'examples'],
    pacePreference: 'thorough',
    analogyDomain: 'nature',
  },
  {
    id: '15yo-football-gaming',
    description:
      '15-year-old US teen, English native, into football and competitive gaming, low patience for formality',
    ageYears: 15,
    birthYear: 2011,
    nativeLanguage: 'en',
    conversationLanguage: 'en',
    location: 'US',
    pronouns: 'he/him',
    interests: [
      { label: 'football', context: 'free_time' },
      { label: 'NFL', context: 'free_time' },
      { label: 'esports', context: 'free_time' },
      { label: 'competitive gaming', context: 'free_time' },
      { label: 'sports statistics', context: 'both' },
    ],
    libraryTopics: [
      'algebra equations',
      'US history: Civil War',
      'physics: forces and motion',
    ],
    cefrLevel: undefined,
    targetLanguage: undefined,
    struggles: [
      { topic: 'factoring polynomials', subject: 'math' },
      { topic: 'Reconstruction era', subject: 'history' },
    ],
    strengths: [
      { topic: 'mental arithmetic', subject: 'math' },
      { topic: "Newton's laws", subject: 'physics' },
    ],
    recentQuizAnswers: {
      capitals: ['Washington D.C.', 'London'],
      vocabulary: [],
      guessWho: ['Abraham Lincoln'],
    },
    preferredExplanations: ['examples', 'analogies'],
    pacePreference: 'quick',
    analogyDomain: 'sports',
  },
  {
    id: '17yo-french-advanced',
    description:
      '17-year-old EU teen, Czech native but conversational French with tutor, advanced French (CEFR B2), literature and philosophy',
    ageYears: 17,
    birthYear: 2009,
    nativeLanguage: 'cs',
    // Advanced learner prefers the tutor speaks French — tests the split
    // between nativeLanguage and conversationLanguage.
    conversationLanguage: 'fr',
    location: 'EU',
    pronouns: 'they/them',
    interests: [
      { label: 'French literature', context: 'both' },
      { label: 'philosophy', context: 'both' },
      { label: 'existentialism', context: 'free_time' },
      { label: 'creative writing', context: 'free_time' },
    ],
    libraryTopics: [
      "Camus — L'Étranger",
      'French subjunctive',
      'essay structure',
      'Enlightenment thinkers',
    ],
    cefrLevel: 'B2',
    targetLanguage: 'fr',
    struggles: [
      { topic: 'subjonctif imparfait', subject: 'French' },
      { topic: 'nuanced connectors', subject: 'French' },
    ],
    strengths: [
      { topic: 'reading comprehension', subject: 'French' },
      { topic: 'essay argument structure', subject: 'writing' },
    ],
    recentQuizAnswers: {
      capitals: ['Paris', 'Brussels'],
      vocabulary: ["l'angoisse", 'le fardeau', 'éphémère'],
      guessWho: ['Jean-Paul Sartre', 'Albert Camus'],
    },
    preferredExplanations: ['step-by-step', 'analogies'],
    pacePreference: 'thorough',
    analogyDomain: 'music',
  },
  {
    // WI-2462 — adult (18+) teaching-quality coverage. Every other profile is
    // an adolescent (13–17 per age.ts), so before this one the suite said
    // nothing about how the mentor teaches an adult: no coverage of an adult's
    // faster pace, prior domain knowledge, or blunter pushback. Adults are a
    // real product persona — PARENT_ACCOUNT_MINIMUM_AGE is 18 and computeAge
    // Bracket's 'adult' arm is live — and sit ABOVE the PROFILE_MINIMUM_AGE
    // floor, unlike the sub-13 end of the range.
    id: '34yo-adult-statistics',
    // Scenario-only: pinned by TS06 alone. Without this the adult would join
    // every envelope flow's matrix, moving other flows' sample counts — the
    // exact side effect WI-2462's AC-3 forbids.
    scenarioOnly: true,
    description:
      '34-year-old EU adult, English native, career-switching into data analysis, brings real-world experience and pushes back on hand-waving',
    ageYears: 34,
    birthYear: 1992,
    nativeLanguage: 'en',
    conversationLanguage: 'en',
    location: 'EU',
    pronouns: 'she/her',
    interests: [
      { label: 'data analysis', context: 'both' },
      { label: 'public health reporting', context: 'both' },
      { label: 'long-distance running', context: 'free_time' },
      { label: 'cooking', context: 'free_time' },
    ],
    libraryTopics: [
      'descriptive statistics',
      'probability basics',
      'spreadsheet modelling',
      'reading medical studies',
    ],
    cefrLevel: undefined,
    targetLanguage: undefined,
    struggles: [
      { topic: 'conditional probability', subject: 'statistics' },
      { topic: 'interpreting p-values', subject: 'statistics' },
    ],
    strengths: [
      { topic: 'spreadsheet formulas', subject: 'statistics' },
      { topic: 'summarising findings in writing', subject: 'writing' },
    ],
    recentQuizAnswers: { capitals: [], vocabulary: [], guessWho: [] },
    preferredExplanations: ['examples', 'step-by-step'],
    pacePreference: 'quick',
    analogyDomain: 'cooking',
  },
];

export function getProfile(id: string): EvalProfile | undefined {
  return PROFILES.find((p) => p.id === id);
}

/**
 * True when a profile opts out of the global flow × profile cross-product
 * (see EvalProfile.scenarioOnly).
 *
 * Takes `unknown` because the budget estimator types its profile list that way
 * — and it MUST be the same predicate the runner uses. The estimator and the
 * runtime each decide independently whether a flow applies to a profile, so if
 * they disagree the preflight demand estimate and the actual run disagree, and
 * the live gate either truncates itself or reports a coverage shortfall.
 */
export function isScenarioOnlyProfile(profile: unknown): boolean {
  return (
    typeof profile === 'object' &&
    profile !== null &&
    (profile as { scenarioOnly?: unknown }).scenarioOnly === true
  );
}
