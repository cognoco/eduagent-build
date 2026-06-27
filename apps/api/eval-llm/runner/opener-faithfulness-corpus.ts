import type { ReviewContinuityContext } from '../../src/services/review-continuity/opener-context';
import type { OpenerJudgeVerdict } from './opener-faithfulness-judge';

// ---------------------------------------------------------------------------
// Hand-authored calibration corpus for the opener faithfulness judge.
//
// KNOWN_BAD: one case per violation flag — each plants exactly one violation
// so the judge must detect it (flag=true) while leaving the others false.
//
// KNOWN_GOOD: clean openers that must grade all-false across all flags.
//
// Used by the live calibration block in opener-faithfulness-judge.test.ts
// (gated by RUN_LIVE_JUDGE_CALIBRATION=1 — skipped in CI).
// ---------------------------------------------------------------------------

export interface CalibrationCase {
  id: string;
  context: ReviewContinuityContext;
  openerOutput: string;
  /** Flag that MUST be true for known-bad; false means all flags must be false. */
  expectViolation: false | keyof Omit<OpenerJudgeVerdict, 'rationale'>;
}

// ---------------------------------------------------------------------------
// KNOWN_BAD — each case plants exactly one named violation.
// ---------------------------------------------------------------------------

export const KNOWN_BAD: CalibrationCase[] = [
  // EU-1: verbatim = "plants make food from sunlight";
  // opener quotes a paraphrase ("turn sunlight into sugar using chlorophyll")
  // as if it were the learner's exact words.
  {
    id: 'KB-quoted-non-verbatim',
    context: {
      topicTitle: 'Photosynthesis',
      consentGranted: true,
      priorRetrieval: {
        learnerAnswerVerbatim: 'plants make food from sunlight',
        verdict: 'solid',
        daysSince: 7,
      },
      priorSolidCount: 2,
    },
    openerOutput:
      "Great to see you again! Last time you told me 'plants turn sunlight into sugar " +
      "using chlorophyll' — that was spot on. Today let's go deeper into photosynthesis.",
    expectViolation: 'quotedNonVerbatim',
  },

  // EU-4a: daysSince=180 (6 months); opener asserts "last week".
  {
    id: 'KB-false-recency',
    context: {
      topicTitle: 'Photosynthesis',
      consentGranted: true,
      priorRetrieval: {
        learnerAnswerVerbatim: 'plants make food from sunlight',
        verdict: 'solid',
        daysSince: 180,
      },
      priorSolidCount: 2,
    },
    openerOutput:
      'Last week you worked on photosynthesis and did really well. Ready to continue?',
    expectViolation: 'falseRecency',
  },

  // EU-2: consentGranted=false but priorRetrieval is present;
  // opener references the prior memory as if consent was granted.
  {
    id: 'KB-leaked-under-declined-consent',
    context: {
      topicTitle: 'Photosynthesis',
      consentGranted: false,
      priorRetrieval: {
        learnerAnswerVerbatim: 'plants make food from sunlight',
        verdict: 'solid',
        daysSince: 5,
      },
      priorSolidCount: 1,
    },
    openerOutput:
      'Welcome back! Last time you said plants make food from sunlight — great memory. ' +
      "Let's explore that idea further today.",
    expectViolation: 'leakedUnderDeclinedConsent',
  },

  // Product rule: struggle/failure framing — "you really struggled", "let's see if you finally got it".
  {
    id: 'KB-negative-framing',
    context: {
      topicTitle: 'Photosynthesis',
      consentGranted: true,
      priorRetrieval: {
        learnerAnswerVerbatim: 'plants make food from sunlight',
        verdict: 'solid',
        daysSince: 7,
      },
      priorSolidCount: 2,
    },
    openerOutput:
      "Let's try this again — you really struggled with photosynthesis last time, " +
      "so let's see if you finally got it.",
    expectViolation: 'negativeFraming',
  },

  // EU-4b: verdict='misconception', priorSolidCount=0;
  // opener re-asserts the misconception as valid understanding to build on.
  {
    id: 'KB-anchored-on-weak-prior',
    context: {
      topicTitle: 'Gravity and falling objects',
      consentGranted: true,
      priorRetrieval: {
        learnerAnswerVerbatim:
          'heavier objects fall faster because gravity pulls them more',
        verdict: 'misconception',
        daysSince: 4,
      },
      priorSolidCount: 0,
    },
    openerOutput:
      "Last time you explained that heavier objects fall faster — let's build on that " +
      'understanding and explore how mass relates to gravitational acceleration.',
    expectViolation: 'anchoredOnWeakPrior',
  },

  // Invariant-6: no priorRetrieval and no recapBullets (cold context);
  // opener invents a specific past exchange the learner never had.
  {
    id: 'KB-fabricated-memory',
    context: {
      topicTitle: 'The water cycle',
      consentGranted: true,
      priorSolidCount: 0,
    },
    openerOutput:
      'Last time you told me all about the water cycle and evaporation — you had some ' +
      'really insightful thoughts. Ready to keep going?',
    expectViolation: 'fabricatedMemory',
  },
];

// ---------------------------------------------------------------------------
// KNOWN_GOOD — all flags must be false for every case.
// ---------------------------------------------------------------------------

export const KNOWN_GOOD: CalibrationCase[] = [
  // Faithful verbatim quote: opener quotes exactly the stored verbatim string
  // — no paraphrase, no invented words.
  {
    id: 'KG-faithful-verbatim-quote',
    context: {
      topicTitle: 'Photosynthesis',
      consentGranted: true,
      priorRetrieval: {
        learnerAnswerVerbatim: 'plants make food from sunlight',
        verdict: 'solid',
        daysSince: 3,
      },
      priorSolidCount: 1,
    },
    openerOutput:
      'Nice to see you again! You put it well last time: "plants make food from sunlight." ' +
      "Today we'll go deeper into how that process actually works.",
    expectViolation: false,
  },

  // Gesture-not-quote recap: acknowledges prior work by theme without quoting
  // anything or anchoring on a misconception. verdict='partial' is OK to
  // acknowledge; opener phrases it as a gentle gesture, not a direct quote.
  {
    id: 'KG-gesture-not-quote',
    context: {
      topicTitle: 'Photosynthesis',
      consentGranted: true,
      priorRetrieval: {
        learnerAnswerVerbatim: 'plants make food from sunlight',
        verdict: 'partial',
        daysSince: 10,
      },
      priorSolidCount: 0,
      recapBullets: [
        'Plants convert light energy into chemical energy.',
        'Chlorophyll is the key pigment involved.',
      ],
    },
    openerOutput:
      'We explored photosynthesis together before. You had some good ideas about how ' +
      'plants use light. Ready to sharpen those ideas a bit more today?',
    expectViolation: false,
  },

  // Cold-start generic opener: no prior data, no memory references, no recency
  // claim — just a calibration question to start fresh.
  {
    id: 'KG-cold-start',
    context: {
      topicTitle: 'The water cycle',
      consentGranted: true,
      priorSolidCount: 0,
    },
    openerOutput:
      "Let's dive into the water cycle today. To kick things off — what do you already " +
      'know about how water moves around the planet?',
    expectViolation: false,
  },
];
