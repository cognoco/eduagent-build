/** Minimum confidence for silent background classification. */
export const SILENT_CLASSIFY_CONFIDENCE_THRESHOLD = 0.8;

/**
 * English-language intent pre-classifier used to fast-path four-strands
 * pedagogy for obvious translation / "how do you say" asks.
 */
export const LANGUAGE_REGEX =
  /\b(how do (you|i) say|translate|in (french|spanish|german|czech|italian|portuguese|japanese|chinese|korean|arabic|russian|hindi|dutch|polish|swedish|norwegian|danish|finnish|greek|turkish|hungarian|romanian|thai|vietnamese|indonesian|malay|tagalog|swahili|hebrew|ukrainian|croatian|serbian|slovak|slovenian|bulgarian|latvian|lithuanian|estonian)|what('s| is) .+ in \w+)\b/i;
