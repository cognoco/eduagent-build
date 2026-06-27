import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

export interface FirstSessionGreetingProps {
  name?: string;
  subject?: string;
  interest?: string;
}

/**
 * Warm first-session greeting rendered as an assistant-style message bubble.
 * UI affordance only — never persisted as a real chat message. Tier selection
 * is by available data (name+subject+interest → name+subject → name → generic).
 * Uses four explicit literal t() calls so the i18n AST orphan checker sees all
 * four keys as statically referenced.
 */
export function FirstSessionGreeting({
  name,
  subject,
  interest,
}: FirstSessionGreetingProps): React.ReactElement {
  const { t } = useTranslation();

  const trimmedName = name?.trim() || undefined;
  const trimmedSubject = subject?.trim() || undefined;
  const trimmedInterest = interest?.trim() || undefined;

  let text: string;
  if (trimmedName && trimmedSubject && trimmedInterest) {
    text = t('session.chatShell.firstSessionGreeting.withNameSubjectInterest', {
      name: trimmedName,
      subject: trimmedSubject,
      interest: trimmedInterest,
    });
  } else if (trimmedName && trimmedSubject) {
    text = t('session.chatShell.firstSessionGreeting.withNameSubject', {
      name: trimmedName,
      subject: trimmedSubject,
    });
  } else if (trimmedName) {
    text = t('session.chatShell.firstSessionGreeting.withName', {
      name: trimmedName,
    });
  } else {
    text = t('session.chatShell.firstSessionGreeting.generic');
  }

  return (
    <View
      testID="first-session-greeting"
      className="self-start max-w-[85%] mb-3"
    >
      <View className="rounded-2xl px-4 py-3 bg-coach-bubble">
        <Text className="text-body leading-relaxed text-text-primary">
          {text}
        </Text>
      </View>
    </View>
  );
}
