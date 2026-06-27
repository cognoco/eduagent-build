// ---------------------------------------------------------------------------
// Eval-LLM — Teaching-Session Scenario Fixtures
//
// Five scenarios spanning the pre-teen/teen profile set (11–17yo). Each pins
// a real EvalProfile.id so the harness can build an age-aware ExchangeContext.
//
// SCOPE LABEL — must appear on every artifact that uses these scenarios:
// PRE-TEEN/TEEN-BAND PRE-SCREEN ONLY (11–17yo) — says nothing about under-10
// or adult teaching quality. Authoring under-10 + adult scenarios is T13.
// ---------------------------------------------------------------------------

import type { EvalProfile } from './profiles';

// ---------------------------------------------------------------------------
// TeachingScenario interface (spec "Concrete shapes")
// ---------------------------------------------------------------------------

export interface TeachingScenario {
  /** Stable kebab-case id, e.g. 'TS01-moon-phases'. */
  id: string;
  /** Must exactly equal an existing EvalProfile.id — verified by assertScenarioProfilesResolve. */
  profileId: string;
  subjectName: string;
  topicTitle: string;
  /** Correct source material the mentor may draw on (source-grounding). */
  topicDescription: string;
  /** Hidden competence brief: what the learner does NOT yet grasp. Also controls
   *  the learner's resistance profile — include explicit "resist" instructions
   *  here when the scenario exercises scaffolding / coherence dimensions. */
  startingGap: string;
  /** First in-character line the learner says to open the session. */
  learnerOpening: string;
  /** Novel question answered unaided after the teaching loop (mentor does NOT
   *  answer it — learner answers from what was taught in THIS conversation). */
  transferProbe: string;
  /** What a correct transfer answer must contain (used by the LLM judge). */
  transferRubric: string;
}

// ---------------------------------------------------------------------------
// Audience-scope band label (required on all artifacts — F1/M7)
// ---------------------------------------------------------------------------

export const SCENARIO_BAND_LABEL =
  'PRE-TEEN/TEEN-BAND PRE-SCREEN ONLY (11–17yo) — says nothing about under-10 or adult teaching';

// ---------------------------------------------------------------------------
// Scenario fixtures — five, one per subject family + one non-English band
// ---------------------------------------------------------------------------

const TEACHING_SCENARIOS: TeachingScenario[] = [
  // TS01 — Science (12yo, English, US)
  {
    id: 'TS01-moon-phases',
    profileId: '12yo-dinosaurs',
    subjectName: 'Science',
    topicTitle: 'Why the Moon Has Phases',
    topicDescription:
      "The Moon's phases are caused by its orbit around Earth. As the Moon moves around Earth, sunlight illuminates different portions of its near side that are visible from Earth. The Moon reflects sunlight — it does not produce its own light. A new moon occurs when the Moon is between Earth and the Sun (the dark side faces us). A full moon occurs when Earth is between the Moon and the Sun (the fully lit side faces us). A waxing crescent appears shortly after a new moon — a thin sliver lit on the right side, visible low in the western sky shortly after sunset. The Moon's phases have nothing to do with Earth's shadow; lunar eclipses are a separate, much rarer event.",
    startingGap:
      "You believe the Moon's phases are caused by Earth's shadow slowly covering and uncovering the Moon, like a gradual eclipse. You do not yet understand that phases come from the Moon's changing position in its orbit around Earth (how much of the sunlit side faces us). You are fairly confident in your eclipse explanation.",
    learnerOpening:
      "The Moon changes shape because Earth's shadow covers part of it — like a slow eclipse that goes from full to crescent and back. That's what causes phases, right?",
    transferProbe:
      'Without looking it up — about three days after a new moon, roughly what does the Moon look like when you see it in the evening sky? Which side is lit and how much?',
    transferRubric:
      "Correct answer: a waxing crescent is visible — a thin sliver lit on the right side (viewer's right in the northern hemisphere), occupying roughly 10–15% of the Moon's face. The key elements are: crescent shape, right side lit, visible low in the western sky shortly after sunset. The answer should NOT attribute this to Earth's shadow.",
  },

  // TS02 — Mathematics (15yo, English, US) — RESIST SCENARIO
  // This scenario instructs the learner to misunderstand the concept at least
  // twice before any explanation can land, exercising scaffolding and coherence.
  {
    id: 'TS02-fractions-of-fractions',
    profileId: '15yo-football-gaming',
    subjectName: 'Mathematics',
    topicTitle: 'Multiplying Fractions (Fractions of Fractions)',
    topicDescription:
      'To multiply two fractions, multiply the numerators together and multiply the denominators together. Example: ½ × ⅓ = (1×1)/(2×3) = 1/6. In everyday English, "of" used with fractions means multiply: ½ of ⅓ = ½ × ⅓ = 1/6. Multiplying by a proper fraction (between 0 and 1) always makes the result smaller than either factor — because you are taking a part of something that is already a part. This is the reverse of multiplying by whole numbers greater than 1.',
    startingGap:
      "You believe that 'of' in a math problem means to add (like 'a slice of pie' sounds additive to you), and that multiplication always makes numbers bigger — 'times means more.' You are stubborn about this. The first time the tutor explains the correct rule, you don't buy it — you think they might be confused or oversimplifying. Push back once or twice with your original belief or a related misunderstanding before you accept the explanation. Only accept if the tutor gives a clear, concrete example you can picture (e.g. taking half of a chocolate bar that is already one-third of a full bar).",
    learnerOpening:
      "Wait — ½ of ⅓... doesn't 'of' mean you add them together? Or like, shouldn't it get bigger since you're taking something 'of' something else? Times always makes things bigger.",
    transferProbe:
      'Using only what was just explained to you in this conversation — not anything else you know — what is ½ of ⅓? Show how you would work it out, step by step.',
    transferRubric:
      "Correct answer: ½ × ⅓ = 1/6 (or equivalently 2/6 simplified to 1/6). The working must show multiplying numerators (1×1=1) and denominators (2×3=6). The student should state that 'of' means multiply, or that the result is smaller because they are taking a part of a part.",
  },

  // TS03 — Languages (13yo, English, EU)
  {
    id: 'TS03-past-tense-trigger',
    profileId: '13yo-spanish-beginner',
    subjectName: 'Languages',
    topicTitle: 'Choosing Between Preterite and Imperfect in Spanish',
    topicDescription:
      "Spanish has two main past tenses. The preterite (pretérito indefinido) describes completed, one-time actions with a clear endpoint: 'Ayer comí pasta' (Yesterday I ate pasta — done). The imperfect (pretérito imperfecto) describes habits, ongoing background states, or repeated actions in the past: 'Comía pasta' (I used to eat pasta / I was eating pasta). The key question is: does the action have a defined endpoint (preterite) or is it a state / background / habit (imperfect)? Signal words: ayer/una vez/de repente → preterite; siempre/cada día/de niño/cuando era pequeño → imperfect.",
    startingGap:
      "You pick Spanish past tenses based purely on how finished the sentence feels to you, rather than applying a rule. You often confuse the two: you reach for the imperfect for finished actions because it sounds 'more past-y' to you, and you use preterite for habitual things. You don't yet know the completed-action vs. habit/state rule.",
    learnerOpening:
      "I never know which past tense to use. I just kind of feel which one sounds more past? Like 'comía' sounds really in-the-past to me so I use that a lot. Is that the right way to think about it?",
    transferProbe:
      "Using only what was explained in this conversation: which past tense would you use for 'Every morning I walked to school as a child'? Give the Spanish verb form and explain why you chose it.",
    transferRubric:
      "Correct answer: imperfect — 'caminaba' (or 'iba' if walking generally). The explanation must reference that the action was habitual or repeated in the past (not a one-time completed event), and should use the completed-vs-habit/state rule taught in the session. Preterite ('caminé') is incorrect here.",
  },

  // TS04 — Humanities / Economics (17yo, French conversation, EU)
  {
    id: 'TS04-supply-demand',
    profileId: '17yo-french-advanced',
    subjectName: 'Humanities',
    topicTitle: 'Supply, Demand, and Price Determination',
    topicDescription:
      "In a competitive market, price is determined by the interaction of supply and demand, not by production cost alone. Demand: when price rises, buyers want less (law of demand). Supply: when price rises, sellers want to produce more (law of supply). Equilibrium price is where quantity demanded equals quantity supplied. A supply shock is a sudden reduction in supply: if supply falls while demand stays constant, buyers compete for scarcer goods, bidding the price up. Example: a drought reduces wheat supply by half while demand is unchanged — wheat prices rise sharply, far above production cost, because buyers are competing for scarce stock. Sellers don't 'set' prices arbitrarily; they respond to what buyers are willing to pay.",
    startingGap:
      "You believe a product's price is set by its production cost plus a profit margin the seller decides. You think sellers control price independently, and that external events like a drought only change the price if they change production costs. You don't yet grasp that prices emerge from supply meeting demand.",
    learnerOpening:
      "I thought prices were basically cost to produce plus whatever margin the seller wants. So a drought wouldn't change the price of wheat unless it made it more expensive to grow, right? The farmer just adjusts their margin.",
    transferProbe:
      "Using only what was explained to you in this conversation: a factory fire destroys half of a country's coffee supply overnight. Demand for coffee stays exactly the same. What happens to coffee prices, and why?",
    transferRubric:
      'Correct answer: coffee prices rise (sharply). The explanation must state that supply decreased while demand stayed constant, so buyers compete for fewer goods, driving prices up. The answer must NOT frame the price change as caused by higher production costs — the factory fire destroys finished supply, not production cost. Must reference supply/demand interaction.',
  },

  // TS05 — Science (11yo, Czech conversation, EU) — non-English tutor-prose coverage
  {
    id: 'TS05-water-cycle',
    profileId: '11yo-czech-animals',
    subjectName: 'Science',
    topicTitle: 'The Water Cycle (Koloběh Vody)',
    topicDescription:
      "The water cycle describes how water continuously moves through Earth's systems. Solar energy heats water in oceans, lakes, and rivers, causing evaporation: liquid water turns into water vapor (an invisible gas) that rises into the atmosphere. As water vapor rises and cools at higher altitudes, it condenses into tiny liquid water droplets — these form clouds. Clouds are NOT made of water vapor or steam; they are made of tiny liquid water droplets (or ice crystals at high altitude). When droplets combine and grow heavy enough, they fall as precipitation (rain, snow, hail). Water flows back into rivers, lakes, and oceans, and the cycle repeats. The key stages: evaporation → condensation → precipitation → runoff → back to evaporation.",
    startingGap:
      "You know that 'water goes up and comes back down as rain' but you are fuzzy on the details. You think clouds might be made of water vapor (a gas you can't see) floating up from rivers — not liquid water droplets. You are not sure what evaporation really is and confuse water vapor with visible steam or mist.",
    learnerOpening:
      "I know water goes up into the sky and then falls back as rain, but I don't really get how. Does the water float up as a mist that you can sort of see? And are clouds just lots of that misty water vapor?",
    transferProbe:
      'Using only what was explained to you in this conversation: what are clouds actually made of, and how did the water get up there to form them?',
    transferRubric:
      'Correct answer must state: (1) clouds are made of tiny liquid water droplets — NOT water vapor or mist; (2) liquid water from oceans/lakes/rivers evaporated (turned to vapor) when heated by the Sun, rose into the atmosphere, and cooled — which caused condensation into droplets that form clouds. Must distinguish evaporation (liquid → invisible gas) from the visible cloud (liquid droplets).',
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getTeachingScenario(id: string): TeachingScenario | undefined {
  return TEACHING_SCENARIOS.find((s) => s.id === id);
}

/**
 * Throws a descriptive error if any scenario's profileId has no matching
 * EvalProfile in the provided list. Call at harness startup to detect typos
 * before any scenario silently disappears (MEDIUM-2 silent-skip guard).
 */
export function assertScenarioProfilesResolve(profiles: EvalProfile[]): void {
  const profileIds = new Set(profiles.map((p) => p.id));
  for (const scenario of TEACHING_SCENARIOS) {
    if (!profileIds.has(scenario.profileId)) {
      throw new Error(
        `Teaching scenario "${scenario.id}" references profileId "${scenario.profileId}" ` +
          `which has no matching EvalProfile. ` +
          `Available ids: ${[...profileIds].join(', ')}. ` +
          `Check apps/api/eval-llm/fixtures/profiles.ts.`,
      );
    }
  }
}

// Export the full array so the flow and tests can import it.
export { TEACHING_SCENARIOS };
