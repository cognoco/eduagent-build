import type { ChatMessage } from './llm';
import { extractVolunteeredPiiMatches } from './minor-pii-echo-gate';

const PERSONAL_INFORMATION_PLACEHOLDER = '[personal information removed]';
const SPECIAL_CATEGORY_PLACEHOLDER = '[sensitive personal information removed]';
const SERVER_NOTE_RE = /<\/?server_note[^>]*>/gi;
const MAX_SERVER_NOTE_PASSES = 8;

const SPECIAL_CATEGORY_DISCLOSURE_CUE_RE =
  /\b(?:i\s+(?:have|have been diagnosed|was diagnosed|suffer from|identify as|am|support|vote for|belong to)|my\s+(?:health|diagnosis|medical condition|religion|faith|ethnicity|race|sexual orientation|political (?:beliefs?|views?)|genetic (?:data|test)|dna|fingerprint|faceprint))\b/i;

const SPECIAL_CATEGORY_TERM_RE =
  /\b(?:diagnos(?:is|ed)|diabetes|cancer|adhd|autis(?:m|tic)|disab(?:ility|led)|medical condition|health condition|religion|faith|muslim|christian|jewish|hindu|buddhist|gay|lesbian|bisexual|transgender|sexual orientation|ethnicity|race|sami|black|white|asian|political|labour party|conservative party|democratic party|republican party|trade union|genetic|hereditary|dna|fingerprint|faceprint|biometric)\b/i;

const EDUCATIONAL_CONTEXT_RE =
  /\b(?:studying|learning about|lesson about|homework about|researching|writing about|question about|explain|translate|example sentence)\b/i;

const LEARNER_DATA_BLOCK_RE =
  /<((?:learner|user|transcript|session_transcript|homework|ocr|candidate|last_message|preceding_learner|input|resume_context|subject_text|book_title|book_description|topic_list|completed_topic)[a-z0-9_-]*)(\s[^>]*)?>([\s\S]*?)<\/\1>/gi;
const LEARNER_ROLE_LINE_RE = /^(\s*(?:LEARNER|USER|STUDENT)\s*:\s*)(.*)$/gim;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripServerNotes(text: string): string {
  let current = text;
  for (let i = 0; i < MAX_SERVER_NOTE_PASSES; i += 1) {
    const next = current.replace(SERVER_NOTE_RE, '');
    if (next === current) return next;
    current = next;
  }
  return current.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function redactDirectIdentifiers(text: string): string {
  let filtered = text;
  const matches = extractVolunteeredPiiMatches(text).sort(
    (left, right) => right.value.length - left.value.length,
  );

  for (const match of matches) {
    filtered = filtered.replace(
      new RegExp(
        `(?<![A-Za-z0-9])${escapeRegExp(match.value)}(?![A-Za-z0-9])`,
        match.kind === 'name' ? 'g' : 'gi',
      ),
      PERSONAL_INFORMATION_PLACEHOLDER,
    );
  }
  return filtered;
}

function redactSpecialCategoryDisclosures(text: string): string {
  return text.replace(/[^.!?\n]+[.!?]?/g, (rawSegment) => {
    const segment = rawSegment.trim();
    if (
      !SPECIAL_CATEGORY_DISCLOSURE_CUE_RE.test(segment) ||
      !SPECIAL_CATEGORY_TERM_RE.test(segment) ||
      EDUCATIONAL_CONTEXT_RE.test(segment)
    ) {
      return rawSegment;
    }

    const leadingWhitespace = rawSegment.match(/^\s*/)?.[0] ?? '';
    return `${leadingWhitespace}${SPECIAL_CATEGORY_PLACEHOLDER}`;
  });
}

/**
 * Last-hop deterministic filter for learner-authored text leaving the
 * first-party boundary. It scans every textual message part because several
 * async/internal flows embed learner transcripts inside a system prompt rather
 * than a user-role message. The detector is cue-scoped, so trusted standalone
 * display names and ordinary policy text remain unchanged.
 */
export function filterLearnerAuthoredTextForEgress(text: string): string {
  return redactSpecialCategoryDisclosures(
    redactDirectIdentifiers(stripServerNotes(text)),
  );
}

function filterLearnerRegionsInTrustedPrompt(text: string): string {
  return text
    .replace(
      LEARNER_DATA_BLOCK_RE,
      (_match, tag: string, attributes: string | undefined, content: string) =>
        `<${tag}${attributes ?? ''}>${filterLearnerAuthoredTextForEgress(
          content,
        )}</${tag}>`,
    )
    .replace(
      LEARNER_ROLE_LINE_RE,
      (_match, prefix: string, content: string) =>
        `${prefix}${filterLearnerAuthoredTextForEgress(content)}`,
    );
}

export function filterLearnerAuthoredMessagesForEgress(
  messages: ChatMessage[],
): ChatMessage[] {
  return messages.map((message) => {
    // Assistant turns are provider-authored context, not learner-authored
    // input. The normalized ChatMessage contract has no tool-result role, so
    // preserving assistant messages also avoids reclassifying any tool-mediated
    // context that a caller has already normalized into an assistant turn.
    if (message.role === 'assistant') return message;

    const filterText =
      message.role === 'system'
        ? filterLearnerRegionsInTrustedPrompt
        : filterLearnerAuthoredTextForEgress;

    if (typeof message.content === 'string') {
      return {
        ...message,
        content: filterText(message.content),
      };
    }
    return {
      ...message,
      content: message.content.map((part) =>
        part.type === 'text'
          ? {
              ...part,
              text: filterText(part.text),
            }
          : part,
      ),
    };
  });
}
