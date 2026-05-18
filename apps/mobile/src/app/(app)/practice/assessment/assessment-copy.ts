import type { Translate } from '../../../../i18n';

interface AssessmentCopyInput {
  t: Translate;
  topicTitle: string | null;
  topicDescription: string | null;
  pedagogyMode: string | null;
  languageCode?: string | null;
}

const LANGUAGE_CONTEXT_PATTERN =
  /\b(language|vocab(?:ulary)?|word|words|phrase|phrases|greeting|greetings|say hello|saying hello|introduc(?:e yourself|ing yourself|tions?)|personal details|cefr|italian|spanish|french|german|norwegian|polish|portuguese|japanese|czech)\b/i;
const CEFR_LEVEL_PATTERN = /\b[ABC][12]\b/i;
const GREETING_CONTEXT_PATTERN =
  /\b(greeting|greetings|hello|say hello|saying hello|introduc(?:e yourself|ing yourself|tions?)|meet people)\b/i;

const LANGUAGE_NAME_BY_CODE: Record<string, string> = {
  cs: 'Czech',
  de: 'German',
  es: 'Spanish',
  fr: 'French',
  it: 'Italian',
  ja: 'Japanese',
  nb: 'Norwegian',
  no: 'Norwegian',
  pl: 'Polish',
  pt: 'Portuguese',
};

const LANGUAGE_NAME_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bitalian\b/i, label: 'Italian' },
  { pattern: /\bspanish\b/i, label: 'Spanish' },
  { pattern: /\bfrench\b/i, label: 'French' },
  { pattern: /\bgerman\b/i, label: 'German' },
  { pattern: /\bnorwegian\b/i, label: 'Norwegian' },
  { pattern: /\bpolish\b/i, label: 'Polish' },
  { pattern: /\bportuguese\b/i, label: 'Portuguese' },
  { pattern: /\bjapanese\b/i, label: 'Japanese' },
  { pattern: /\bczech\b/i, label: 'Czech' },
];

function getTopicText({
  topicTitle,
  topicDescription,
}: Pick<AssessmentCopyInput, 'topicTitle' | 'topicDescription'>): string {
  return [topicTitle, topicDescription].filter(Boolean).join(' ');
}

function isLanguageAssessment({
  topicTitle,
  topicDescription,
  pedagogyMode,
}: Omit<AssessmentCopyInput, 't'>): boolean {
  if (pedagogyMode === 'four_strands') return true;
  const topicText = getTopicText({ topicTitle, topicDescription });
  return (
    LANGUAGE_CONTEXT_PATTERN.test(topicText) ||
    CEFR_LEVEL_PATTERN.test(topicText)
  );
}

function isGreetingAssessment(input: Omit<AssessmentCopyInput, 't'>): boolean {
  return (
    isLanguageAssessment(input) &&
    GREETING_CONTEXT_PATTERN.test(
      getTopicText({
        topicTitle: input.topicTitle,
        topicDescription: input.topicDescription,
      }),
    )
  );
}

function getLanguageLabel({
  topicTitle,
  topicDescription,
  languageCode,
}: Pick<
  AssessmentCopyInput,
  'topicTitle' | 'topicDescription' | 'languageCode'
>): string {
  const normalizedCode = languageCode?.trim().toLowerCase();
  if (normalizedCode && LANGUAGE_NAME_BY_CODE[normalizedCode]) {
    return LANGUAGE_NAME_BY_CODE[normalizedCode];
  }

  const topicText = getTopicText({ topicTitle, topicDescription });
  return (
    LANGUAGE_NAME_PATTERNS.find(({ pattern }) => pattern.test(topicText))
      ?.label ?? 'the language you practiced'
  );
}

function feedbackAlreadyAsksQuestion(feedback: string): boolean {
  return /\?\s*(?:["')\]]\s*)?$/.test(feedback.trim());
}

export function assessmentFeedbackNeedsPrompt({
  feedback,
  status,
}: {
  feedback: string;
  status: string;
}): boolean {
  return status === 'in_progress' && !feedbackAlreadyAsksQuestion(feedback);
}

export function buildAssessmentOpeningMessage({
  t,
  topicTitle,
  topicDescription,
  pedagogyMode,
  languageCode,
}: AssessmentCopyInput): string {
  const language = getLanguageLabel({
    topicTitle,
    topicDescription,
    languageCode,
  });
  if (
    isGreetingAssessment({
      topicTitle,
      topicDescription,
      pedagogyMode,
      languageCode,
    })
  ) {
    return topicTitle
      ? t('assessment.languageGreetingOpeningMessageWithTopic', {
          title: topicTitle,
          language,
        })
      : t('assessment.languageGreetingOpeningMessage', { language });
  }
  if (isLanguageAssessment({ topicTitle, topicDescription, pedagogyMode })) {
    return topicTitle
      ? t('assessment.languageOpeningMessageWithTopic', {
          title: topicTitle,
          language,
        })
      : t('assessment.languageOpeningMessage', { language });
  }

  return topicTitle
    ? t('assessment.openingMessageWithTopic', {
        title: topicTitle,
        description:
          topicDescription ?? t('assessment.topicDescriptionFallback'),
      })
    : t('assessment.openingMessage');
}

export function buildAssessmentFirstQuestion({
  t,
  topicTitle,
  topicDescription,
  pedagogyMode,
  languageCode,
}: AssessmentCopyInput): string {
  const language = getLanguageLabel({
    topicTitle,
    topicDescription,
    languageCode,
  });
  if (
    isGreetingAssessment({
      topicTitle,
      topicDescription,
      pedagogyMode,
      languageCode,
    })
  ) {
    return topicTitle
      ? t('assessment.languageGreetingFirstQuestionWithTopic', {
          title: topicTitle,
          language,
        })
      : t('assessment.languageGreetingFirstQuestion', { language });
  }
  if (isLanguageAssessment({ topicTitle, topicDescription, pedagogyMode })) {
    return topicTitle
      ? t('assessment.languageFirstQuestionWithTopic', {
          title: topicTitle,
          language,
        })
      : t('assessment.languageFirstQuestion', { language });
  }

  return topicTitle
    ? t('assessment.firstQuestionWithTopic', {
        title: topicTitle,
      })
    : t('assessment.firstQuestion');
}

export function buildAssessmentNextActionPrompt({
  t,
  topicTitle,
  topicDescription,
  pedagogyMode,
  languageCode,
}: AssessmentCopyInput): string {
  const language = getLanguageLabel({
    topicTitle,
    topicDescription,
    languageCode,
  });
  if (
    isGreetingAssessment({
      topicTitle,
      topicDescription,
      pedagogyMode,
      languageCode,
    })
  ) {
    return t('assessment.languageGreetingContinuePrompt', { language });
  }
  return isLanguageAssessment({ topicTitle, topicDescription, pedagogyMode })
    ? t('assessment.languageContinuePrompt', { language })
    : t('assessment.continuePrompt');
}

export function ensureAssessmentFeedbackHasPrompt({
  t,
  feedback,
  status,
  topicTitle,
  topicDescription,
  pedagogyMode,
  languageCode,
}: Omit<AssessmentCopyInput, 't'> & {
  t: Translate;
  feedback: string;
  status: string;
}): string {
  if (!assessmentFeedbackNeedsPrompt({ feedback, status })) {
    return feedback;
  }

  const prompt = buildAssessmentNextActionPrompt({
    t,
    topicTitle,
    topicDescription,
    pedagogyMode,
    languageCode,
  });

  return `${feedback.trim()}\n\n${prompt}`;
}
