import { useState, useCallback } from 'react';
import { useLocalSearchParams } from 'expo-router';
import {
  ChatShell,
  animateResponse,
  type ChatMessage,
} from '../components/ChatShell';
import { useCreateAssessment, useSubmitAnswer } from '../hooks/use-assessments';

const OPENING_MESSAGE =
  "Time for a knowledge check. I'll ask you a few questions to see how well you've understood the material. Ready?";

export default function AssessmentScreen() {
  const { subjectId, topicId } = useLocalSearchParams<{
    subjectId?: string;
    topicId?: string;
  }>();

  const createAssessment = useCreateAssessment(subjectId ?? '', topicId ?? '');
  const [assessmentId, setAssessmentId] = useState<string | null>(null);
  const submitAnswer = useSubmitAnswer(assessmentId ?? '');

  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'opening', role: 'ai', content: OPENING_MESSAGE },
  ]);
  const [isStreaming, setIsStreaming] = useState(false);

  const handleSend = useCallback(
    async (text: string) => {
      if (isStreaming || !subjectId || !topicId) return;

      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: 'user', content: text },
      ]);

      try {
        let currentAssessmentId = assessmentId;
        if (!currentAssessmentId) {
          const created = await createAssessment.mutateAsync();
          currentAssessmentId = created.assessment.id;
          setAssessmentId(currentAssessmentId);
        }

        const result = await submitAnswer.mutateAsync({ answer: text });
        const feedback = result.result.feedback;
        const passed = result.result.passed;

        animateResponse(feedback, setMessages, setIsStreaming, () => {
          if (passed) {
            setMessages((prev) => [
              ...prev,
              {
                id: `assessment-done-${Date.now()}`,
                role: 'ai',
                content: `Assessment complete! Your mastery score: ${Math.round(
                  result.result.masteryScore * 100
                )}%`,
              },
            ]);
          }
        });
      } catch {
        animateResponse(
          "I'm having trouble connecting right now. Please try again.",
          setMessages,
          setIsStreaming
        );
      }
    },
    [
      isStreaming,
      subjectId,
      topicId,
      assessmentId,
      createAssessment,
      submitAnswer,
    ]
  );

  return (
    <ChatShell
      title="Knowledge Check"
      messages={messages}
      onSend={handleSend}
      isStreaming={isStreaming}
    />
  );
}
