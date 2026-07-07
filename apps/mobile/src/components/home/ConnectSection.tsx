import { Platform, Pressable, Share, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useThemeColors } from '../../lib/theme';

type ConnectSectionVariant = 'prominent' | 'compact';

interface ConnectSectionProps {
  onCreateChild: () => void;
  variant?: ConnectSectionVariant;
  testID?: string;
}

interface ConnectActionProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle: string;
  testID: string;
  onPress?: () => void;
  disabled?: boolean;
  secondary?: boolean;
  badge?: string;
}

function ConnectAction({
  icon,
  title,
  subtitle,
  testID,
  onPress,
  disabled = false,
  secondary = false,
  badge,
}: ConnectActionProps): React.ReactElement {
  const colors = useThemeColors();
  const iconColor = disabled ? colors.textSecondary : colors.primary;

  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      disabled={disabled}
      className={`rounded-card border px-4 py-3 flex-row items-center min-h-[72px] ${
        secondary
          ? 'bg-background border-border'
          : disabled
            ? 'bg-surface border-border'
            : 'bg-surface-elevated border-primary/30'
      }`}
      style={{
        gap: 10,
        opacity: disabled ? 0.72 : 1,
        ...(Platform.OS === 'web' && !disabled ? { cursor: 'pointer' } : {}),
      }}
      accessibilityRole="button"
      accessibilityLabel={
        badge ? `${title}. ${badge}. ${subtitle}` : `${title}. ${subtitle}`
      }
      accessibilityState={disabled ? { disabled: true } : undefined}
      testID={testID}
    >
      <View className="w-10 h-10 rounded-2xl bg-primary-soft items-center justify-center">
        <Ionicons name={icon} size={21} color={iconColor} />
      </View>
      <View className="flex-1">
        <View className="flex-row flex-wrap items-center" style={{ gap: 6 }}>
          <Text className="text-body font-bold text-text-primary">{title}</Text>
          {badge ? (
            <Text
              className="text-caption font-bold text-text-secondary bg-surface px-2 py-0.5 rounded-full"
              testID={`${testID}-badge`}
            >
              {badge}
            </Text>
          ) : null}
        </View>
        <Text
          className="text-body-sm text-text-secondary mt-0.5"
          numberOfLines={2}
        >
          {subtitle}
        </Text>
      </View>
      {disabled ? null : (
        <Ionicons
          name="chevron-forward"
          size={20}
          color={colors.textSecondary}
        />
      )}
    </Pressable>
  );
}

export function ConnectSection({
  onCreateChild,
  variant = 'prominent',
  testID = 'connect-create-child-action',
}: ConnectSectionProps): React.ReactElement {
  const { t } = useTranslation();
  const isCompact = variant === 'compact';

  const inviteSomeone = (): void => {
    void Share.share({ message: t('home.connect.inviteMessage') }).catch(
      () => undefined,
    );
  };

  return (
    <View
      className={`rounded-card border ${
        isCompact
          ? 'bg-surface border-border px-4 py-4'
          : 'bg-primary-soft border-primary/40 px-4 py-5'
      }`}
      style={{
        gap: 12,
      }}
      testID="home-connect-section"
    >
      {isCompact ? <View testID="home-connect-section-compact" /> : null}
      <View>
        <Text className="text-h3 font-bold text-text-primary">
          {t('home.connect.title')}
        </Text>
        <Text className="text-body-sm text-text-secondary mt-1">
          {t(
            isCompact
              ? 'home.connect.subtitleCompact'
              : 'home.connect.subtitleProminent',
          )}
        </Text>
      </View>

      <ConnectAction
        icon="person-add-outline"
        title={t('home.connect.createChild.title')}
        subtitle={t('home.connect.createChild.subtitle')}
        onPress={onCreateChild}
        testID={testID}
      />
      <ConnectAction
        icon="link-outline"
        title={t('home.connect.linkExisting.title')}
        subtitle={t('home.connect.linkExisting.subtitle')}
        badge={t('home.connect.linkExisting.badge')}
        disabled
        testID="connect-link-existing-action"
      />
      <ConnectAction
        icon="share-social-outline"
        title={t('home.connect.invite.title')}
        subtitle={t('home.connect.invite.subtitle')}
        onPress={inviteSomeone}
        secondary
        testID="connect-invite-action"
      />
    </View>
  );
}
