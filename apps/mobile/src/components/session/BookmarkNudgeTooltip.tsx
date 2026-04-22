import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as SecureStore from '../../lib/secure-storage';

const KEY_PREFIX = 'bookmark-nudge-shown';

function getBookmarkNudgeKey(profileId: string | undefined): string {
  return profileId ? `${KEY_PREFIX}:${profileId}` : KEY_PREFIX;
}

interface BookmarkNudgeTooltipProps {
  aiResponseCount: number;
  isFirstSession: boolean;
  profileId: string | undefined;
}

export function BookmarkNudgeTooltip({
  aiResponseCount,
  isFirstSession,
  profileId,
}: BookmarkNudgeTooltipProps) {
  const [visible, setVisible] = useState(false);
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    if (!profileId || !isFirstSession || aiResponseCount < 3) return;

    checkedRef.current = true;
    void SecureStore.getItemAsync(getBookmarkNudgeKey(profileId))
      .then((value) => {
        if (!value) {
          setVisible(true);
        }
      })
      .catch(() => undefined);
  }, [aiResponseCount, isFirstSession, profileId]);

  const dismiss = useCallback(() => {
    setVisible(false);
    if (!profileId) return;
    void SecureStore.setItemAsync(getBookmarkNudgeKey(profileId), 'true').catch(
      () => undefined
    );
  }, [profileId]);

  if (!visible) {
    return null;
  }

  return (
    <View
      className="bg-primary/10 rounded-card px-4 py-3 mb-3"
      testID="bookmark-nudge-tooltip"
    >
      <Text className="text-body-sm text-text-primary">
        Tap the bookmark icon to save explanations you want to revisit.
      </Text>
      <Pressable
        onPress={dismiss}
        className="self-start mt-2"
        accessibilityRole="button"
        accessibilityLabel="Dismiss bookmark tip"
        testID="bookmark-nudge-dismiss"
      >
        <Text className="text-body-sm font-semibold text-primary">Got it</Text>
      </Pressable>
    </View>
  );
}
