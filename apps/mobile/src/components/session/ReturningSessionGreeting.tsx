import { View, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

export interface ReturningSessionGreetingProps {
  name?: string;
  subject?: string;
}

/**
 * Warm returning-session greeting rendered as an assistant-style message bubble
 * in the chat empty state (sibling of FirstSessionGreeting, shown when the
 * learner has at least one prior session). UI affordance only — never persisted
 * as a real chat message. Tier selection is by available data
 * (name+subject → name → generic).
 *
 * Honesty rule: this is a neutral continuity nudge anchored on the in-scope
 * subject of THIS session — it never claims a win or mastery, because no
 * verified-mastery signal is available here. Three explicit literal t() calls
 * so the i18n AST orphan checker sees all keys as statically referenced.
 */
export function ReturningSessionGreeting({
  name,
  subject,
}: ReturningSessionGreetingProps): React.ReactElement {
  const { t } = useTranslation();

  const trimmedName = name?.trim() || undefined;
  const trimmedSubject = subject?.trim() || undefined;

  let text: string;
  if (trimmedName && trimmedSubject) {
    text = t('session.chatShell.returningSessionGreeting.withNameSubject', {
      name: trimmedName,
      subject: trimmedSubject,
    });
  } else if (trimmedName) {
    text = t('session.chatShell.returningSessionGreeting.withName', {
      name: trimmedName,
    });
  } else {
    text = t('session.chatShell.returningSessionGreeting.generic');
  }

  return (
    <View
      testID="returning-session-greeting"
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
