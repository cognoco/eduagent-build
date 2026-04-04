import { routeAndCall, type ChatMessage } from './llm';
import {
  detectLanguageHint,
  getLanguageByCode,
  type LanguageEntry,
} from '../data/languages';
import type { LanguageDetection } from '@eduagent/schemas';

const LANGUAGE_DETECTION_PROMPT = `You decide whether a learner's subject text means they want to study a language.
Return ONLY JSON:
{"isLanguageLearning": true|false, "languageCode": "es"|null}

Rules:
- true only when the user is actually learning that language
- false for history/culture topics like "French Revolution" or "Spanish Civil War"
- If a specific language is present, use its ISO 639-1 code
- If unsure, return false`;

function entryToDetection(entry: LanguageEntry): LanguageDetection {
  return {
    code: entry.code,
    matchedName: entry.names[0] ?? entry.code,
    pedagogyMode: 'four_strands',
    sttLocale: entry.sttLocale,
    ttsVoice: entry.ttsVoice,
  };
}

export async function detectLanguageSubject(
  rawInput: string
): Promise<LanguageDetection | null> {
  const hint = detectLanguageHint(rawInput);
  if (!hint) {
    return null;
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: LANGUAGE_DETECTION_PROMPT },
    { role: 'user', content: rawInput },
  ];

  try {
    const result = await routeAndCall(messages, 1);
    const jsonMatch = result.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return entryToDetection(hint);
    }

    const parsed = JSON.parse(jsonMatch[0]) as {
      isLanguageLearning?: unknown;
      languageCode?: unknown;
    };

    if (parsed.isLanguageLearning !== true) {
      return null;
    }

    if (typeof parsed.languageCode === 'string') {
      const detected = getLanguageByCode(parsed.languageCode);
      if (detected) {
        return entryToDetection(detected);
      }
    }

    return entryToDetection(hint);
  } catch {
    return entryToDetection(hint);
  }
}
