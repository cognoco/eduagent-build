import {
  View,
  Text,
  Pressable,
  Modal,
  ScrollView,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import type {
  useParkingLot,
  useAddParkingLotItem,
} from '../../hooks/use-sessions';
import type { useCurriculum } from '../../hooks/use-curriculum';

// ─── ParkingLotModal ─────────────────────────────────────────────────────────

export interface ParkingLotModalProps {
  visible: boolean;
  onClose: () => void;
  parkingLotDraft: string;
  setParkingLotDraft: React.Dispatch<React.SetStateAction<string>>;
  handleSaveParkingLot: () => Promise<void>;
  parkingLot: ReturnType<typeof useParkingLot>;
  addParkingLotItem: ReturnType<typeof useAddParkingLotItem>;
  insetsBottom: number;
}

export function ParkingLotModal({
  visible,
  onClose,
  parkingLotDraft,
  setParkingLotDraft,
  handleSaveParkingLot,
  parkingLot,
  addParkingLotItem,
  insetsBottom,
}: ParkingLotModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/40 justify-end">
        <View
          className="bg-background rounded-t-3xl px-5 pt-5"
          style={{ paddingBottom: Math.max(insetsBottom, 24) }}
        >
          <View className="items-center mb-4">
            <View className="w-10 h-1 rounded-full bg-text-secondary/30" />
          </View>
          <Text className="text-h3 font-semibold text-text-primary mb-2">
            Parking lot
          </Text>
          <Text className="text-body-sm text-text-secondary mb-4">
            Save side questions for later so you can stay focused on this
            session.
          </Text>

          <TextInput
            value={parkingLotDraft}
            onChangeText={setParkingLotDraft}
            placeholder="What do you want to come back to later?"
            className="bg-surface rounded-input px-4 py-3 text-body text-text-primary"
            multiline
            testID="parking-lot-input"
          />

          <Pressable
            onPress={() => void handleSaveParkingLot()}
            disabled={!parkingLotDraft.trim() || addParkingLotItem.isPending}
            className={
              parkingLotDraft.trim()
                ? 'bg-primary rounded-button py-3 mt-4 items-center'
                : 'bg-surface-elevated rounded-button py-3 mt-4 items-center'
            }
            testID="parking-lot-save"
          >
            {addParkingLotItem.isPending ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text
                className={
                  parkingLotDraft.trim()
                    ? 'text-body font-semibold text-text-inverse'
                    : 'text-body font-semibold text-text-secondary'
                }
              >
                Save question
              </Text>
            )}
          </Pressable>

          <ScrollView className="mt-4" style={{ maxHeight: 220 }}>
            {/* Parking lot is best-effort — empty on error is acceptable [SQ-5] */}
            {(parkingLot.data ?? []).map((item) => (
              <View
                key={item.id}
                className="bg-surface rounded-card px-4 py-3 mb-2"
                testID={`parking-lot-item-${item.id}`}
              >
                <Text className="text-body text-text-primary">
                  {item.question}
                </Text>
                <Text className="text-caption text-text-secondary mt-1">
                  Saved for later
                </Text>
              </View>
            ))}
            {parkingLot.isLoading ? (
              <View className="py-4 items-center">
                <ActivityIndicator />
              </View>
            ) : parkingLot.data?.length ? null : (
              <Text className="text-body-sm text-text-secondary mt-3">
                Nothing parked yet.
              </Text>
            )}
          </ScrollView>

          <Pressable onPress={onClose} className="items-center py-3 mt-3">
            <Text className="text-body font-semibold text-text-secondary">
              Close
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ─── TopicSwitcherModal ──────────────────────────────────────────────────────

export interface TopicSwitcherModalProps {
  visible: boolean;
  onClose: () => void;
  availableSubjects: Array<{ id: string; name: string }>;
  switcherSubjectId: string | null | undefined;
  setTopicSwitcherSubjectId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  switcherCurriculum: ReturnType<typeof useCurriculum>;
  handleTopicSwitch: (
    topicId: string,
    subjectId: string,
    subjectName: string
  ) => Promise<void>;
  insetsBottom: number;
  isSwitching?: boolean;
}

export function TopicSwitcherModal({
  visible,
  onClose,
  availableSubjects,
  switcherSubjectId,
  setTopicSwitcherSubjectId,
  switcherCurriculum,
  handleTopicSwitch,
  insetsBottom,
  isSwitching = false,
}: TopicSwitcherModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-black/40 justify-end">
        <View
          className="bg-background rounded-t-3xl px-5 pt-5"
          style={{ paddingBottom: Math.max(insetsBottom, 24) }}
        >
          <View className="items-center mb-4">
            <View className="w-10 h-1 rounded-full bg-text-secondary/30" />
          </View>
          <Text className="text-h3 font-semibold text-text-primary mb-2">
            Switch topic
          </Text>
          <Text className="text-body-sm text-text-secondary mb-4">
            Start a new learning thread in another topic without losing this
            conversation.
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8 }}
            className="mb-4"
          >
            {availableSubjects.map((subject) => (
              <Pressable
                key={subject.id}
                onPress={() => setTopicSwitcherSubjectId(subject.id)}
                className={
                  switcherSubjectId === subject.id
                    ? 'rounded-full bg-primary px-4 py-2'
                    : 'rounded-full bg-surface-elevated px-4 py-2'
                }
                testID={`switch-subject-${subject.id}`}
              >
                <Text
                  className={
                    switcherSubjectId === subject.id
                      ? 'text-body-sm font-semibold text-text-inverse'
                      : 'text-body-sm font-semibold text-text-secondary'
                  }
                >
                  {subject.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <ScrollView style={{ maxHeight: 280 }}>
            {switcherCurriculum.isLoading ? (
              <View className="py-6 items-center">
                <ActivityIndicator />
              </View>
            ) : (
              (switcherCurriculum.data?.topics ?? [])
                .filter((topic) => !topic.skipped)
                .map((topic) => {
                  const subjectForTopic = availableSubjects.find(
                    (subject) => subject.id === switcherSubjectId
                  );
                  if (!subjectForTopic) return null;
                  return (
                    <Pressable
                      key={topic.id}
                      onPress={() =>
                        handleTopicSwitch(
                          topic.id,
                          subjectForTopic.id,
                          subjectForTopic.name
                        )
                      }
                      disabled={isSwitching}
                      style={{ opacity: isSwitching ? 0.5 : 1 }}
                      className="bg-surface rounded-card px-4 py-3 mb-2"
                      testID={`switch-topic-${topic.id}`}
                    >
                      <Text className="text-body font-semibold text-text-primary">
                        {topic.title}
                      </Text>
                      <Text className="text-body-sm text-text-secondary mt-1">
                        {topic.description}
                      </Text>
                    </Pressable>
                  );
                })
            )}
          </ScrollView>

          <Pressable onPress={onClose} className="items-center py-3 mt-3">
            <Text className="text-body font-semibold text-text-secondary">
              Close
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
