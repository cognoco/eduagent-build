import {
  averageLetterRunLength,
  hasAcceptableShape,
} from '../components/homework/problem-cards';

// Clean printed homework usually has word-sized letter runs. ML Kit handwriting
// garble often becomes short pseudo-words; when in doubt, prefer the server LLM.
export const CLEAN_PRINT_MIN_AVG_RUN = 3.5;

export function stripListMarkers(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/^\s*(?:\d+|[A-Z])[.)]?\s+/, ''))
    .join('\n');
}

// Real homework math has digits/operators in standalone tokens (e.g., "5",
// "+", "x²", "12.5"). ML Kit garble like "Shob608rgg" has a digit run buried
// inside a letter run and should not count as a math cue.
export function hasMathExpression(text: string): boolean {
  const tokens = text.split(/\s+/).filter(Boolean);
  let mathCount = 0;
  let hasOperatorOrAlgebra = false;
  for (const rawToken of tokens) {
    const token = rawToken.replace(/[.,;]+$/, '');
    if (!token) continue;
    if (/^\d+(?:\.\d+)?$/.test(token)) {
      mathCount++;
      continue;
    }
    if (/^[+\-−×*·÷/=<>≤≥±²³]+$/.test(token)) {
      mathCount++;
      hasOperatorOrAlgebra = true;
      continue;
    }
    if (
      /^[\p{L}\d+\-−×*·÷/=<>≤≥±²³.()]+$/u.test(token) &&
      /\d/.test(token) &&
      !/\p{L}{3,}/u.test(token)
    ) {
      mathCount++;
      hasOperatorOrAlgebra = true;
    }
  }
  return mathCount >= 2 && hasOperatorOrAlgebra;
}

export function hasStrongHomeworkCue(text: string): boolean {
  const contentText = stripListMarkers(text);

  if (hasMathExpression(contentText)) {
    return true;
  }

  if (/[?!:]/.test(contentText)) {
    return true;
  }

  return /\b(?:answer|calculate|choose|circle|compare|complete|conjugate|contrast|correct|define|describe|draw|evaluate|explain|factor|fill|find|graph|how|identify|label|prove|read|select|show|simplify|solve|translate|underline|what|when|where|which|who|why|write)\b/iu.test(
    contentText,
  );
}

export function looksLikeOcrGarble(text: string): boolean {
  const contentText = stripListMarkers(text);
  const letterRuns = contentText.match(/\p{L}+/gu) ?? [];
  if (letterRuns.length === 0) return false;
  const avgLetterRunLength =
    letterRuns.reduce((sum, run) => sum + run.length, 0) / letterRuns.length;
  return avgLetterRunLength < 2;
}

export function isCleanPrintedLocalRead(text: string): boolean {
  if (!text.trim()) return false;
  if (!hasAcceptableShape(text)) return false;
  if (looksLikeOcrGarble(text)) return false;
  if (!hasStrongHomeworkCue(text)) return false;
  if (hasMathExpression(stripListMarkers(text))) return true;
  if (averageLetterRunLength(text) < CLEAN_PRINT_MIN_AVG_RUN) return false;
  return true;
}
