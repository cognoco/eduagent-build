import { Modal, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Subject } from '@eduagent/schemas';

interface SubjectHubManageSheetProps {
  visible: boolean;
  subjectName: string;
  status: Subject['status'];
  /** True while a status mutation is in flight — disables all actions. */
  isSaving: boolean;
  onClose: () => void;
  onChangeStatus: (status: Subject['status']) => void;
}

interface ManageActionProps {
  testID: string;
  label: string;
  onPress: () => void;
  disabled: boolean;
  primary?: boolean;
}

function ManageAction({
  testID,
  label,
  onPress,
  disabled,
  primary = false,
}: ManageActionProps): React.ReactElement {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`flex-1 rounded-button py-2.5 items-center ${
        primary ? 'bg-primary' : 'bg-surface-elevated'
      }`}
    >
      <Text
        className={`text-body-sm font-semibold ${
          primary ? 'text-text-inverse' : 'text-text-primary'
        }`}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/**
 * In-context subject management for the SubjectHub (WI-1119). Mirrors Library's
 * archive-first action set for a SINGLE subject: pause/archive an active subject,
 * resume/archive a paused one, restore an archived one. Delete is intentionally
 * NOT offered here — it stays behind Library's scope-confirm flow so the
 * irreversible step is never one tap from an in-use subject (archive-first).
 *
 * Proxy gating lives at the route (the manage entry is not rendered for a
 * supporter-proxy scope), so this sheet is only ever mounted for a scope that
 * may write.
 */
export function SubjectHubManageSheet({
  visible,
  subjectName,
  status,
  isSaving,
  onClose,
  onChangeStatus,
}: SubjectHubManageSheetProps): React.ReactElement {
  const { t } = useTranslation();
  const saving = t('library.manage.saving');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
    >
      <Pressable
        testID="subject-hub-manage-backdrop"
        className="flex-1 justify-end bg-black/40"
        onPress={onClose}
      >
        <Pressable
          testID="subject-hub-manage-sheet"
          className="rounded-t-card bg-surface px-5 pt-3 pb-8"
          onPress={(e) => e.stopPropagation()}
        >
          <View className="items-center mb-4">
            <View className="w-10 h-1 rounded-full bg-text-secondary/30" />
          </View>
          <Text className="text-h3 font-semibold text-text-primary mb-2">
            {t('subjectHub.manage.title')}
          </Text>
          <Text className="text-body-sm text-text-secondary mb-4">
            {t('subjectHub.manage.description')}
          </Text>
          <Text className="text-body font-semibold text-text-primary mb-3">
            {subjectName}
          </Text>

          <View className="flex-row gap-2">
            {status === 'active' ? (
              <>
                <ManageAction
                  testID="subject-hub-pause"
                  label={isSaving ? saving : t('library.manage.pause')}
                  onPress={() => onChangeStatus('paused')}
                  disabled={isSaving}
                />
                <ManageAction
                  testID="subject-hub-archive"
                  label={isSaving ? saving : t('library.manage.archive')}
                  onPress={() => onChangeStatus('archived')}
                  disabled={isSaving}
                />
              </>
            ) : status === 'paused' ? (
              <>
                <ManageAction
                  primary
                  testID="subject-hub-resume"
                  label={isSaving ? saving : t('library.manage.resume')}
                  onPress={() => onChangeStatus('active')}
                  disabled={isSaving}
                />
                <ManageAction
                  testID="subject-hub-archive"
                  label={isSaving ? saving : t('library.manage.archive')}
                  onPress={() => onChangeStatus('archived')}
                  disabled={isSaving}
                />
              </>
            ) : (
              <ManageAction
                primary
                testID="subject-hub-restore"
                label={isSaving ? saving : t('library.manage.restore')}
                onPress={() => onChangeStatus('active')}
                disabled={isSaving}
              />
            )}
          </View>

          <Pressable
            testID="subject-hub-manage-close"
            accessibilityRole="button"
            accessibilityLabel={t('subjectHub.manage.close')}
            onPress={onClose}
            className="mt-4 min-h-[44px] items-center justify-center"
          >
            <Text className="text-body-sm font-semibold text-text-secondary">
              {t('subjectHub.manage.close')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
