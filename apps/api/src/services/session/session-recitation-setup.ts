import {
  recitationSetupStateSchema,
  type RecitationSetupState,
  type RecitationSetupTransition,
} from '@eduagent/schemas';
import type { ExchangeSourceAudit } from '../exchanges';

export const RECITATION_SETUP_CLAIM_METADATA_KEY =
  '__serverRecitationSetupClaim' as const;

export function stripInternalRecitationSetupClaim(metadata: unknown): unknown {
  if (
    metadata == null ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata)
  ) {
    return metadata;
  }
  const sanitized = { ...(metadata as Record<string, unknown>) };
  delete sanitized[RECITATION_SETUP_CLAIM_METADATA_KEY];
  return sanitized;
}

interface ResolveRecitationSetupInput {
  effectiveMode: string | undefined;
  exchangeCount?: number;
  message: string;
  previousState?: RecitationSetupState;
}

interface RecitationSetupHistoryEvent {
  eventType: string | null;
  metadata?: unknown;
}

const AMBIGUOUS_SELECTIONS = new Set([
  'yes',
  'yeah',
  'yep',
  'no',
  'nope',
  'ok',
  'okay',
  'sure',
  'maybe',
  'something',
  'anything',
  'help',
  'hello',
  'hi',
  "i'm not sure",
  'i am not sure',
  "i don't know",
  'i do not know',
  'still not sure',
  'begin',
  'change',
  'edit',
  'switch',
  'no sé',
  'no tengo idea',
  'ayúdame',
  'hola',
  'ich weiß nicht',
  'hilf mir',
  'hallo',
  'jeg vet ikke',
  'hjelp meg',
  'hei',
  'nie wiem',
  'pomóż mi',
  'cześć',
  'não sei',
  'ajude-me',
  'olá',
  'わからない',
  '分からない',
  '助けて',
  'こんにちは',
]);
const OFF_TOPIC_SELECTION_RE =
  /^(?:can|could|would|will|what|which|where|when|why|how)\b|\b(?:weather|account|subscription|settings)\b/iu;
const QUESTION_WORD_TITLE_RE =
  /^(?:Am|Are|Can|Could|Did|Do|Does|Had|Has|Have|How|Is|May|Might|Must|Shall|Should|Was|Were|What|When|Where|Which|Who|Whom|Whose|Why|Will|Would)\b/iu;
const MULTILINGUAL_QUESTION_PREFIX_RE =
  /^(?:(?:qué|que|cuál|cuáles|cómo|dónde|cuándo|por qué|quién|quiénes|qui|quel|quelle|quels|quelles|comment|où|pourquoi|was|welche|welcher|welches|wie|wo|wann|warum|wer|hva|hvilken|hvilket|hvordan|hvor|når|hvem|co|który|która|które|jak|gdzie|kiedy|dlaczego|kto|o que|qual|quais|como|onde|quando|por que)(?=\s|[?？]|$)|(?:何|なに|どの|どこ|いつ|なぜ|どう|誰|だれ))/iu;
const TITLE_AUTHOR_RE =
  /^(?<title>.{1,220})\s(?:by|de|von|av|przez|por)\s+\p{Lu}[\p{L}'’.-]*(?:\s+\p{Lu}[\p{L}'’.-]*){0,5}$/u;
const NON_RECITATION_TOPIC_RE =
  /\b(?:weather|account|subscription|settings)\b/iu;
const SELECTION_QUESTION_RE =
  /^(?:what|which).*(?:recite|recitation|poem|selection|title|author)\b/iu;
const EXPLICIT_SELECTION_EDIT_RE =
  /^(?:actually[\s,]+)?(?:change|switch|edit)\b|^(?:actually[\s,]+)?(?:i(?:'d| would) rather|let(?:'s| us) do)\b|^(?:cámbialo|cambiar|prefiero|ändern|wechseln|lieber|endre|bytt|heller|zmień|przełącz|wolę|mudar|trocar|prefiro|変えて|変更|代わりに)\b/iu;
const COMMAND_ONLY_EDIT_RE =
  /^(?:change|switch|edit|cambiar|ändern|wechseln|endre|bytt|zmień|przełącz|mudar|trocar|変えて|変更)$/iu;
const UNCERTAIN_SELECTION_RE =
  /^(?:i (?:do not|don't) (?:know|have (?:a )?title)|i have no (?:idea|title)|no tengo idea|todavía no tengo (?:un )?título|ich (?:habe keine ahnung|habe noch keinen titel)|jeg (?:vet ikke|har ingen tittel)|nie (?:wiem|mam tytułu)|não (?:sei|tenho (?:um )?título)|まだ(?:タイトル|題名)がない|わからない|分からない)(?:\b|$)/iu;
const SAFETY_DISCLOSURE_RE =
  /\b(?:hurt|kill|harm) (?:myself|ourselves)\b|\b(?:suicid(?:e|al)|self[- ]harm|abused|unsafe)\b|\b(?:adult|someone (?:i )?met online).*(?:photos|videos|private call|keep it secret)\b|\b(?:no food at home|left alone|caregiver (?:is )?absent)\b|\b(?:friend|sibling|classmate|i|me).*(?:being )?(?:hit|abused|touched inappropriately|hurt)\b|\bmy (?:teacher|parent|dad|father|mum|mom|mother|carer|coach).*(?:hits? me|hurts? me|abuses? me|touch(?:ed|es) me inappropriately)\b|自殺|自傷/iu;
const BEGIN_OR_ACKNOWLEDGEMENT_RE =
  /^(?:begin|start|go ahead|i(?:'m| am) ready|ok|okay|yes|sure|estoy list[oa]|ich bin bereit|jeg er klar|jestem gotow[ay]|estou pront[oa]|準備できた)$/iu;
const CONVERSATIONAL_INTENT_PREFIX_RE =
  /^(?:i|i'm|i am|we|you|my|your|please|can|could|would|should|do|does|is|are|tell|show|give|make|write|explain|help)\b/iu;
const GENERIC_REQUEST_RE =
  /^(?:tell|show|give|make|write|explain|help)(?: me)?\b/iu;
const SENTENCE_LIKE_SELECTION_RE =
  /\b(?:am|is|are|was|were|have|has|want|need|enjoy|like|help)\b/iu;
const LEAVE_SELECTIONS = new Set([
  'leave',
  'cancel',
  'stop',
  'exit',
  'back',
  'nevermind',
  'never mind',
  'salir',
  'cancelar',
  'parar',
  'atrás',
  'abbrechen',
  'verlassen',
  'zurück',
  'avbryt',
  'gå ut',
  'tilbake',
  'anuluj',
  'wyjdź',
  'wstecz',
  'sair',
  'voltar',
  'やめる',
  'キャンセル',
  '終了',
  '戻る',
]);
const NATURAL_LEAVE_RE =
  /^(?:please )?stop$|^i (?:want|need|would like) to (?:leave|stop|exit)$|^(?:puedo|quiero) salir$|^ich möchte (?:aufhören|gehen)$|^jeg vil (?:avslutte|gå ut)$|^chcę (?:wyjść|zakończyć)$|^quero (?:sair|parar)$|^(?:やめたい|終了したい)$/iu;

function normalizeIntent(message: string): string {
  return message
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[¿¡]+/u, '')
    .replace(/[.!?…。！？]+$/u, '')
    .toLocaleLowerCase();
}

function isLeaveIntent(message: string): boolean {
  const normalized = normalizeIntent(message);
  return LEAVE_SELECTIONS.has(normalized) || NATURAL_LEAVE_RE.test(normalized);
}

function isSafetyDisclosure(message: string): boolean {
  return SAFETY_DISCLOSURE_RE.test(normalizeIntent(message));
}

function isUncertainOrNonSelection(message: string): boolean {
  const normalized = normalizeIntent(message);
  return (
    AMBIGUOUS_SELECTIONS.has(normalized) ||
    BEGIN_OR_ACKNOWLEDGEMENT_RE.test(normalized) ||
    UNCERTAIN_SELECTION_RE.test(normalized) ||
    OFF_TOPIC_SELECTION_RE.test(normalized) ||
    /[?？]$/u.test(message.trim())
  );
}

function isTitleAuthorSelection(message: string): boolean {
  const title = message.match(TITLE_AUTHOR_RE)?.groups?.['title']?.trim();
  if (!title) return false;
  if (/^(?:["“][\s\S]+["”]|['‘][\s\S]+['’])$/u.test(title)) return true;
  if (
    CONVERSATIONAL_INTENT_PREFIX_RE.test(title) ||
    GENERIC_REQUEST_RE.test(title) ||
    SENTENCE_LIKE_SELECTION_RE.test(title)
  ) {
    return false;
  }
  const titleWords = title.split(' ');
  return (
    /^[\p{Lu}\p{Lt}]/u.test(title) ||
    /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(title) ||
    (titleWords.length >= 2 && titleWords.length <= 10)
  );
}

function isLikelySelection(message: string): boolean {
  const normalized = message.trim().replace(/\s+/g, ' ');
  if (normalized.length === 0 || normalized.length > 300) return false;
  if (!/[\p{L}\p{N}]/u.test(normalized)) return false;
  // Some well-known titles are themselves questions. Preserve the case signal
  // before normalizeIntent lowercases it: several title-cased words distinguish
  // a supplied work such as "Where the Sidewalk Ends" from an ordinary request
  // such as "Where should I start?". Lower-case conversational questions remain
  // ambiguous and take the single clarification path.
  const questionCandidate = normalized.replace(/^[¿¡]+/u, '');
  const titleCaseWordCount = (
    questionCandidate.match(/(?:^|\s)\p{Lu}[\p{L}'’]*/gu) ?? []
  ).filter((word) => word.trim().length > 1).length;
  const questionWordCount =
    questionCandidate.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
  const terminalQuestion = /[?？]\s*$/u.test(questionCandidate);
  const hasTitleCaseSignal =
    titleCaseWordCount >= 3 ||
    (terminalQuestion && titleCaseWordCount >= 2 && questionWordCount <= 3);
  const hasQuestionPrefix =
    QUESTION_WORD_TITLE_RE.test(questionCandidate) ||
    MULTILINGUAL_QUESTION_PREFIX_RE.test(questionCandidate);
  const titleCasedQuestion =
    hasTitleCaseSignal && (hasQuestionPrefix || terminalQuestion);
  const explicitlyQuotedTitle = /^(?:["“][\s\S]+["”]|['‘][\s\S]+['’])$/u.test(
    normalized,
  );
  if (
    ((isUncertainOrNonSelection(normalized) || hasQuestionPrefix) &&
      !titleCasedQuestion &&
      !explicitlyQuotedTitle) ||
    isLeaveIntent(normalized) ||
    isSafetyDisclosure(normalized) ||
    COMMAND_ONLY_EDIT_RE.test(normalizeIntent(normalized))
  ) {
    return false;
  }

  const words = normalized.split(' ');
  const titleLikePhrase =
    words.length === 1 ||
    explicitlyQuotedTitle ||
    titleCasedQuestion ||
    (/^[\p{Lu}\p{Lt}]/u.test(normalized) &&
      !CONVERSATIONAL_INTENT_PREFIX_RE.test(normalized) &&
      !SENTENCE_LIKE_SELECTION_RE.test(normalized)) ||
    /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(normalized);
  const hasSelectionShape =
    isTitleAuthorSelection(normalized) ||
    /^(?:the |a |an |el |la |der |die |das )?(?:poem|speech|passage|story|monologue|sonnet|poema|gedicht|dikt|wiersz|詩)(?:\s|$)/iu.test(
      normalized,
    ) ||
    (words.length <= 12 && titleLikePhrase);

  return hasSelectionShape;
}

function parseRecitationSetupState(
  value: unknown,
): RecitationSetupState | undefined {
  const parsed = recitationSetupStateSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/**
 * Reads the latest recitation setup phase from private assistant-event
 * metadata. Assistant metadata preserves the state alongside a completed
 * exchange without extending the public response shape.
 */
export function readPersistedRecitationSetupState(
  events: RecitationSetupHistoryEvent[],
): RecitationSetupState | undefined {
  for (let index = events.length - 1; index >= 0; index--) {
    const event = events[index];
    if (event?.eventType !== 'ai_response') continue;
    if (
      event.metadata == null ||
      typeof event.metadata !== 'object' ||
      Array.isArray(event.metadata)
    ) {
      continue;
    }

    const state = parseRecitationSetupState(
      (event.metadata as Record<string, unknown>)['recitationSetup'],
    );
    if (state) return state;
  }
  return undefined;
}

export function recitationOpeningForLog(
  effectiveMode: unknown,
  opening: string,
): string {
  if (effectiveMode !== 'recitation') return opening;
  return `[redacted: assistant opening ${
    opening.trim().length > 0 ? 'present' : 'absent'
  }]`;
}

/**
 * Recitation source audits retain provenance identifiers for complaint review,
 * but never persist learner wording in the assistant event's private metadata.
 */
export function sanitizeRecitationSourceAudit(
  effectiveMode: unknown,
  sourceAudit: ExchangeSourceAudit | undefined,
): ExchangeSourceAudit | undefined {
  if (effectiveMode !== 'recitation' || sourceAudit === undefined) {
    return sourceAudit;
  }
  return {
    ...sourceAudit,
    ...(sourceAudit.reason !== undefined
      ? {
          reason: `[redacted: source audit reason ${
            sourceAudit.reason.trim().length > 0 ? 'present' : 'absent'
          }]`,
        }
      : {}),
    evidence: sourceAudit.evidence.map((entry) => ({
      ...entry,
      ...(entry.excerpt !== undefined
        ? {
            excerpt: `[redacted: source evidence excerpt ${
              entry.excerpt.trim().length > 0 ? 'present' : 'absent'
            }]`,
          }
        : {}),
    })),
  };
}

/**
 * Resolves the current recitation setup turn without asking the LLM to infer
 * phase or loop count. One unclear turn may ask for a focused clarification;
 * the next turn advances regardless, which is the hard loop cap.
 */
export function resolveRecitationSetupTransition(
  input: ResolveRecitationSetupInput,
): RecitationSetupTransition | undefined {
  if (input.effectiveMode !== 'recitation') return undefined;

  const previous =
    input.previousState ??
    ((input.exchangeCount ?? 0) > 0
      ? ({ phase: 'ready', clarificationCount: 0 } as const)
      : undefined);
  if (isLeaveIntent(input.message)) {
    return {
      action: 'leave_recitation',
      state: previous ?? { phase: 'ready', clarificationCount: 0 },
    };
  }

  if (isSafetyDisclosure(input.message)) {
    return {
      action: 'handle_non_recitation',
      state: previous ?? { phase: 'awaiting_selection', clarificationCount: 0 },
    };
  }

  if (previous?.phase === 'ready') {
    const normalized = normalizeIntent(input.message);
    if (BEGIN_OR_ACKNOWLEDGEMENT_RE.test(normalized)) {
      return { action: 'invite_recitation', state: previous };
    }

    if (
      COMMAND_ONLY_EDIT_RE.test(normalized) ||
      AMBIGUOUS_SELECTIONS.has(normalized) ||
      UNCERTAIN_SELECTION_RE.test(normalized) ||
      SELECTION_QUESTION_RE.test(normalized)
    ) {
      return { action: 'clarify_edit', state: previous };
    }

    if (
      NON_RECITATION_TOPIC_RE.test(normalized) ||
      GENERIC_REQUEST_RE.test(normalized)
    ) {
      return { action: 'handle_non_recitation', state: previous };
    }

    return {
      action:
        EXPLICIT_SELECTION_EDIT_RE.test(input.message.trim()) &&
        isLikelySelection(input.message)
          ? 'invite_to_begin'
          : 'coach_recitation',
      state: previous,
    };
  }

  if (isLikelySelection(input.message)) {
    return {
      action: 'invite_to_begin',
      state: {
        phase: 'ready',
        clarificationCount: previous?.clarificationCount ?? 0,
      },
    };
  }

  if (previous?.clarificationCount === 1) {
    return {
      action: 'invite_after_cap',
      state: { phase: 'ready', clarificationCount: 1 },
    };
  }

  return {
    action: 'clarify_selection',
    state: { phase: 'awaiting_selection', clarificationCount: 1 },
  };
}
