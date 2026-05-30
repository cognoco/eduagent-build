import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import type { DashboardChild, Profile } from '@eduagent/schemas';

import { withOpacity } from '../../lib/color-opacity';
import { useThemeColors } from '../../lib/theme';
import { type SubjectTint } from '../../lib/design-tokens';
import type { Translate } from '../../i18n';

// Extracted from ParentHomeScreen.tsx so parent-card-copy.ts, LearnTogetherSheet,
// and ParentHomeScreen can all share the prompt-building helpers and the
// conversation-starter card without importing the screen component. No behavior
// change — the logic is identical to the previous in-screen definitions.

export interface TonightPrompt {
  key: string;
  childId: string;
  text: string;
}

/** Returns the first whitespace-delimited token of a display name. */
export function firstNameOf(name: string): string {
  const trimmed = name.trim();
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

function promptText(
  childName: string,
  body: string,
  includeChildName: boolean,
): string {
  return includeChildName ? `${childName}: ${body}` : body;
}

export function childHasCurrentActivity(
  dashboardChild: DashboardChild | undefined,
): boolean {
  return (
    (dashboardChild?.sessionsThisWeek ?? 0) > 0 ||
    (dashboardChild?.totalTimeThisWeek ?? 0) > 0 ||
    (dashboardChild?.exchangesThisWeek ?? 0) > 0
  );
}

export function childHasAnySignal(
  dashboardChild: DashboardChild | undefined,
): boolean {
  if (!dashboardChild) return false;

  return (
    childHasCurrentActivity(dashboardChild) ||
    dashboardChild.totalSessions > 0 ||
    dashboardChild.subjects.length > 0 ||
    dashboardChild.currentlyWorkingOn.length > 0
  );
}

// The prompt builders only need a child's id + display name, so accept the
// narrow shape. A full Profile satisfies it, and parent-card-copy.ts can pass a
// DashboardChild-derived `{ id: profileId, displayName }` without a cast.
type PromptChild = Pick<Profile, 'id' | 'displayName'>;

function addPrompt(
  prompts: TonightPrompt[],
  child: PromptChild,
  key: string,
  body: string,
  includeChildName: boolean,
): void {
  prompts.push({
    key: `${child.id}-${key}`,
    childId: child.id,
    text: promptText(firstNameOf(child.displayName), body, includeChildName),
  });
}

export function buildSingleChildPrompts(
  child: PromptChild,
  dashboardChild: DashboardChild | undefined,
  t: Translate,
  includeChildName: boolean,
  maxPrompts: number,
): TonightPrompt[] {
  const focus =
    dashboardChild?.currentlyWorkingOn[0] ?? dashboardChild?.subjects[0]?.name;
  const prompts: TonightPrompt[] = [];

  if (!childHasAnySignal(dashboardChild)) {
    return prompts;
  }

  if (focus && childHasCurrentActivity(dashboardChild)) {
    addPrompt(
      prompts,
      child,
      'active-focus',
      t('home.parent.tonight.promptWithTopic', { topic: focus }),
      includeChildName,
    );
    addPrompt(
      prompts,
      child,
      'trickiest',
      t('home.parent.tonight.promptTrickiestWithTopic', {
        topic: focus,
      }),
      includeChildName,
    );
    addPrompt(
      prompts,
      child,
      'next-goal',
      t('home.parent.tonight.promptNextGoalWithTopic', { topic: focus }),
      includeChildName,
    );
    return prompts.slice(0, maxPrompts);
  }

  if (focus) {
    addPrompt(
      prompts,
      child,
      'restart-focus',
      t('home.parent.tonight.promptRestartWithTopic', { topic: focus }),
      includeChildName,
    );
    addPrompt(
      prompts,
      child,
      'trickiest',
      t('home.parent.tonight.promptTrickiestWithTopic', {
        topic: focus,
      }),
      includeChildName,
    );
    addPrompt(
      prompts,
      child,
      'restart-easier',
      t('home.parent.tonight.promptRestartEasierWithTopic', { topic: focus }),
      includeChildName,
    );
    return prompts.slice(0, maxPrompts);
  }

  if (childHasCurrentActivity(dashboardChild)) {
    addPrompt(
      prompts,
      child,
      'weekly-easier',
      t('home.parent.tonight.promptFallback'),
      includeChildName,
    );
  } else {
    addPrompt(
      prompts,
      child,
      'restart',
      t('home.parent.tonight.promptNoActivity'),
      includeChildName,
    );
  }

  return prompts.slice(0, maxPrompts);
}

export function ConversationStarterCard({
  prompt,
  tint,
}: {
  prompt: TonightPrompt;
  tint: SubjectTint | undefined;
}): React.ReactElement {
  const colors = useThemeColors();
  const accent = tint?.solid ?? colors.primary;
  const bubbleBorderColor = withOpacity(accent, 0.26);

  return (
    <View
      testID={`parent-home-tonight-${prompt.key}`}
      style={{
        backgroundColor: withOpacity(accent, 0.06),
        borderColor: bubbleBorderColor,
        borderRadius: 16,
        borderWidth: 1,
        minHeight: 48,
      }}
    >
      <View
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          paddingHorizontal: 10,
          paddingVertical: 9,
        }}
      >
        <View
          testID={`parent-home-tonight-icon-${prompt.key}`}
          style={{
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderColor: bubbleBorderColor,
            borderWidth: 1,
            borderRadius: 999,
            height: 28,
            justifyContent: 'center',
            width: 28,
          }}
        >
          <Ionicons name="chatbubble-outline" size={16} color={accent} />
        </View>
        <Text
          testID={`parent-home-tonight-text-${prompt.key}`}
          style={{
            color: colors.textPrimary,
            flex: 1,
            fontSize: 14,
            fontWeight: '400',
            includeFontPadding: false,
            lineHeight: 20,
            marginLeft: 9,
          }}
        >
          {prompt.text}
        </Text>
      </View>
    </View>
  );
}
