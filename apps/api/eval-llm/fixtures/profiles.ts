// ---------------------------------------------------------------------------
// Eval-LLM — Synthetic Learner Profile Fixtures
//
// These profiles span the age × interest × level × locale matrix used by the
// eval harness. Each flow adapter maps a subset of this full profile into
// the specific inputs that flow's prompt builder expects.
//
// Keep this set small. 6–10 profiles is the working ceiling — more than that
// and snapshot review becomes impractical during tuning sessions.
// ---------------------------------------------------------------------------

export interface EvalProfile {
  /** Stable kebab-case key used as the snapshot filename and CLI filter. */
  id: string;
  /** Human-readable one-liner shown at the top of every snapshot. */
  description: string;

  // Demographics ----------------------------------------------------------
  ageYears: number;
  birthYear: number;
  nativeLanguage: string; // ISO 639-1
  location: 'EU' | 'US' | 'OTHER';

  // Interests & library -------------------------------------------------
  interests: string[]; // free-text interest labels, ordered by salience
  libraryTopics: string[]; // currently studying — raw topic titles

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
  learningMode: 'serious' | 'casual';
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
// The baseline fixture set.
//
// Spans: child/teen/adult × low/mid/high proficiency × EU/US locale ×
// stories/step-by-step/gaming styles. Interests picked to be vivid enough
// to obviously steer prompt output when they're wired in.
// ---------------------------------------------------------------------------

export const PROFILES: EvalProfile[] = [
  {
    id: '06yo-fairytales',
    description:
      '6-year-old EU child, early reader, Czech native, loves fairy tales and animals, low cognitive load preferred',
    ageYears: 6,
    birthYear: 2020,
    nativeLanguage: 'cs',
    location: 'EU',
    interests: ['fairy tales', 'horses', 'forest animals', 'drawing'],
    libraryTopics: ['alphabet', 'counting to 20', 'farm animals'],
    cefrLevel: undefined,
    targetLanguage: undefined,
    struggles: [
      { topic: 'letter b vs d', subject: null },
      { topic: 'silent letters', subject: 'reading' },
    ],
    strengths: [{ topic: 'rhyming words', subject: 'reading' }],
    recentQuizAnswers: { capitals: [], vocabulary: [], guessWho: [] },
    learningMode: 'casual',
    preferredExplanations: ['stories', 'examples'],
    pacePreference: 'thorough',
    analogyDomain: 'nature',
  },
  {
    id: '09yo-dinosaurs',
    description:
      '9-year-old US child, English native, obsessed with dinosaurs and prehistoric life, quick pace, humor works',
    ageYears: 9,
    birthYear: 2017,
    nativeLanguage: 'en',
    location: 'US',
    interests: [
      'dinosaurs',
      'fossils',
      'paleontology',
      'extinction events',
      'volcanoes',
    ],
    libraryTopics: [
      'Mesozoic era',
      'fossilization',
      'plate tectonics',
      'multiplication tables',
    ],
    cefrLevel: undefined,
    targetLanguage: undefined,
    struggles: [
      { topic: 'long multiplication', subject: 'math' },
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
    learningMode: 'casual',
    preferredExplanations: ['humor', 'examples', 'stories'],
    pacePreference: 'quick',
    analogyDomain: 'nature',
  },
  {
    id: '12yo-spanish-beginner',
    description:
      '12-year-old EU girl, English native, learning Spanish (CEFR A2), loves horses and equestrian sports',
    ageYears: 12,
    birthYear: 2014,
    nativeLanguage: 'en',
    location: 'EU',
    interests: ['horses', 'showjumping', 'eventing', 'nature photography'],
    libraryTopics: [
      'present tense verbs',
      'family vocabulary',
      'numbers 1-1000',
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
    learningMode: 'serious',
    preferredExplanations: ['step-by-step', 'examples'],
    pacePreference: 'thorough',
    analogyDomain: 'nature',
  },
  {
    id: '14yo-football-gaming',
    description:
      '14-year-old US teen, English native, into football and competitive gaming, low patience for formality',
    ageYears: 14,
    birthYear: 2012,
    nativeLanguage: 'en',
    location: 'US',
    interests: [
      'football',
      'NFL',
      'esports',
      'competitive gaming',
      'sports statistics',
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
    learningMode: 'casual',
    preferredExplanations: ['examples', 'analogies'],
    pacePreference: 'quick',
    analogyDomain: 'sports',
  },
  {
    id: '16yo-french-advanced',
    description:
      '16-year-old EU teen, Czech native, advanced French (CEFR B2), into literature and philosophy',
    ageYears: 16,
    birthYear: 2010,
    nativeLanguage: 'cs',
    location: 'EU',
    interests: [
      'French literature',
      'philosophy',
      'existentialism',
      'creative writing',
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
    learningMode: 'serious',
    preferredExplanations: ['step-by-step', 'analogies'],
    pacePreference: 'thorough',
    analogyDomain: 'music',
  },
];

export function getProfile(id: string): EvalProfile | undefined {
  return PROFILES.find((p) => p.id === id);
}
