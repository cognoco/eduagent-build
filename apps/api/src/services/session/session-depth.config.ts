/** Minimum exchange count before a session can be considered meaningful. */
export const MIN_EXCHANGES_FOR_MEANINGFUL = 3;

/** Minimum learner word count used for shallow-session telemetry. */
export const MIN_LEARNER_WORDS = 50;

/** Auto-pass threshold for clearly deep sessions. */
export const AUTO_MEANINGFUL_EXCHANGE_THRESHOLD = 5;

/** Hard timeout for the full depth-evaluation gate. */
export const GATE_TIMEOUT_MS = 2000;

/** Hard timeout for the topic-detection-only pass. */
export const TOPIC_DETECTION_TIMEOUT_MS = 1500;

/** Minimum confidence for silent background classification. */
export const SILENT_CLASSIFY_CONFIDENCE_THRESHOLD = 0.8;

/**
 * English-language intent pre-classifier used to fast-path four-strands
 * pedagogy for obvious translation / "how do you say" asks.
 */
export const LANGUAGE_REGEX =
  /\b(how do (you|i) say|translate|in (french|spanish|german|czech|italian|portuguese|japanese|chinese|korean|arabic|russian|hindi|dutch|polish|swedish|norwegian|danish|finnish|greek|turkish|hungarian|romanian|thai|vietnamese|indonesian|malay|tagalog|swahili|hebrew|ukrainian|croatian|serbian|slovak|slovenian|bulgarian|latvian|lithuanian|estonian)|what('s| is) .+ in \w+)\b/i;
