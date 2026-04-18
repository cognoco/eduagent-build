import { useCallback } from 'react';
import type { ChatMessage } from '../../../../components/session';
import type { useClassifySubject } from '../../../../hooks/use-classify-subject';
import type { useResolveSubject } from '../../../../hooks/use-resolve-subject';
import type { useCreateSubject } from '../../../../hooks/use-subjects';
import { type PendingSubjectResolution, isGreeting } from './session-types';

export interface UseSubjectClassificationOptions {
  // State
  isStreaming: boolean;
  pendingClassification: boolean;
  setPendingClassification: React.Dispatch<React.SetStateAction<boolean>>;
  quotaError: unknown;
  pendingSubjectResolution: PendingSubjectResolution | null;
  setPendingSubjectResolution: React.Dispatch<
    React.SetStateAction<PendingSubjectResolution | null>
  >;
  classifiedSubject: { subjectId: string; subjectName: string } | null;
  setClassifiedSubject: React.Dispatch<
    React.SetStateAction<{ subjectId: string; subjectName: string } | null>
  >;
  setShowWrongSubjectChip: React.Dispatch<React.SetStateAction<boolean>>;
  setClassifyError: React.Dispatch<React.SetStateAction<string | null>>;
  setTopicSwitcherSubjectId: React.Dispatch<
    React.SetStateAction<string | null>
  >;
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  setResumedBanner: React.Dispatch<React.SetStateAction<boolean>>;

  // Route params
  subjectId: string | undefined;
  effectiveMode: string;

  // Data
  availableSubjects: Array<{ id: string; name: string }>;

  // Mutation hooks
  classifySubject: ReturnType<typeof useClassifySubject>;
  resolveSubject: ReturnType<typeof useResolveSubject>;
  createSubject: ReturnType<typeof useCreateSubject>;

  // Functions from other hooks
  continueWithMessage: (
    text: string,
    options?: { sessionSubjectId?: string; sessionSubjectName?: string }
  ) => Promise<void>;
  createLocalMessageId: (prefix: 'user' | 'ai') => string;
  showConfirmation: (message: string) => void;

  // Greeting guard dependencies
  animateResponse: (
    response: string,
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
    setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>,
    onDone?: () => void
  ) => () => void;
  userMessageCount: number;
  sessionExperience: number;
  animationCleanupRef: React.MutableRefObject<(() => void) | null>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useSubjectClassification(
  opts: UseSubjectClassificationOptions
) {
  const {
    isStreaming,
    pendingClassification,
    setPendingClassification,
    quotaError,
    pendingSubjectResolution,
    setPendingSubjectResolution,
    classifiedSubject,
    setClassifiedSubject,
    setShowWrongSubjectChip,
    setClassifyError,
    setTopicSwitcherSubjectId,
    setMessages,
    setResumedBanner,
    subjectId,
    effectiveMode,
    availableSubjects,
    classifySubject,
    resolveSubject,
    createSubject,
    continueWithMessage,
    createLocalMessageId,
    showConfirmation,
    animateResponse,
    userMessageCount,
    sessionExperience,
    animationCleanupRef,
    setIsStreaming,
  } = opts;

  const openSubjectResolution = useCallback(
    (
      text: string,
      prompt: string,
      candidates: Array<{ subjectId: string; subjectName: string }>,
      suggestedSubjectName?: string | null,
      resolveSuggestions?: Array<{
        name: string;
        description: string;
        focus?: string;
      }>
    ) => {
      const dedupedCandidates = candidates.filter(
        (candidate, index, all) =>
          all.findIndex(
            (entry) =>
              entry.subjectId === candidate.subjectId &&
              entry.subjectName === candidate.subjectName
          ) === index
      );

      setPendingSubjectResolution({
        originalText: text,
        prompt,
        candidates: dedupedCandidates,
        suggestedSubjectName,
        resolveSuggestions,
      });
    },
    [setPendingSubjectResolution]
  );

  const handleResolveSubject = useCallback(
    async (candidate: { subjectId: string; subjectName: string }) => {
      if (!pendingSubjectResolution || isStreaming || pendingClassification) {
        return;
      }

      setPendingSubjectResolution(null);
      setClassifiedSubject(candidate);
      setShowWrongSubjectChip(false);
      setMessages((prev) => [
        ...prev,
        {
          id: createLocalMessageId('ai'),
          role: 'assistant',
          content: `Got it, we're working on ${candidate.subjectName}.`,
          isSystemPrompt: true,
        },
      ]);
      await continueWithMessage(pendingSubjectResolution.originalText, {
        sessionSubjectId: candidate.subjectId,
        sessionSubjectName: candidate.subjectName,
      });
    },
    [
      continueWithMessage,
      createLocalMessageId,
      isStreaming,
      pendingClassification,
      pendingSubjectResolution,
      setClassifiedSubject,
      setMessages,
      setPendingSubjectResolution,
      setShowWrongSubjectChip,
    ]
  );

  // Create a new subject from a resolve API suggestion
  const handleCreateResolveSuggestion = useCallback(
    async (suggestion: {
      name: string;
      description: string;
      focus?: string;
    }) => {
      if (isStreaming || pendingClassification || !pendingSubjectResolution)
        return;

      const originalText = pendingSubjectResolution.originalText;
      setPendingSubjectResolution(null);
      setMessages((prev) => [
        ...prev,
        {
          id: createLocalMessageId('ai'),
          role: 'assistant',
          content: `Adding ${suggestion.name} and getting started...`,
          isSystemPrompt: true,
        },
      ]);

      try {
        const result = await createSubject.mutateAsync({
          name: suggestion.name,
          rawInput: suggestion.focus ?? originalText,
        });
        setClassifiedSubject({
          subjectId: result.subject.id,
          subjectName: result.subject.name,
        });
        setShowWrongSubjectChip(false);
        await continueWithMessage(originalText, {
          sessionSubjectId: result.subject.id,
          sessionSubjectName: result.subject.name,
        });
      } catch {
        showConfirmation(
          `Could not create ${suggestion.name}. Please try again or pick an existing subject.`
        );
      }
    },
    [
      continueWithMessage,
      createLocalMessageId,
      createSubject,
      isStreaming,
      pendingClassification,
      pendingSubjectResolution,
      setClassifiedSubject,
      setMessages,
      setPendingSubjectResolution,
      setShowWrongSubjectChip,
      showConfirmation,
    ]
  );

  // BUG-233: Create a new subject from the classifier's suggestion
  const handleCreateSuggestedSubject = useCallback(async () => {
    if (
      !pendingSubjectResolution?.suggestedSubjectName ||
      isStreaming ||
      pendingClassification
    ) {
      return;
    }

    const suggestedName = pendingSubjectResolution.suggestedSubjectName;
    const originalText = pendingSubjectResolution.originalText;

    setPendingSubjectResolution(null);
    setMessages((prev) => [
      ...prev,
      {
        id: createLocalMessageId('ai'),
        role: 'assistant',
        content: `Adding ${suggestedName} and getting started...`,
        isSystemPrompt: true,
      },
    ]);

    try {
      const result = await createSubject.mutateAsync({
        name: suggestedName,
        rawInput: originalText,
      });
      setClassifiedSubject({
        subjectId: result.subject.id,
        subjectName: result.subject.name,
      });
      setShowWrongSubjectChip(false);
      await continueWithMessage(originalText, {
        sessionSubjectId: result.subject.id,
        sessionSubjectName: result.subject.name,
      });
    } catch {
      showConfirmation(
        `Could not create ${suggestedName}. Please try again or pick an existing subject.`
      );
    }
  }, [
    continueWithMessage,
    createLocalMessageId,
    createSubject,
    isStreaming,
    pendingClassification,
    pendingSubjectResolution,
    setClassifiedSubject,
    setMessages,
    setPendingSubjectResolution,
    setShowWrongSubjectChip,
    showConfirmation,
  ]);

  const handleSend = useCallback(
    async (
      text: string,
      opts?: { isAutoSent?: boolean; imageUri?: string }
    ) => {
      // CR-1: Guard on quotaError so programmatic callers (quick chips, homework
      // auto-send, queued problems) can't bypass the UI-disabled input guard.
      if (isStreaming || pendingClassification || quotaError) return;
      if (pendingSubjectResolution) {
        showConfirmation("Pick the subject first, then I'll keep going.");
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: createLocalMessageId('user'),
          role: 'user',
          content: text,
          isAutoSent: opts?.isAutoSent,
          imageUri: opts?.imageUri,
        },
      ]);
      setResumedBanner(false);

      // Greeting guard: intercept pure greetings in freeform mode before
      // any classification or session creation. Saves quota, prevents
      // the silent auto-subject-pick bug.
      if (
        effectiveMode === 'freeform' &&
        isGreeting(text) &&
        !subjectId &&
        !classifiedSubject
      ) {
        const greetingResponse =
          sessionExperience === 0
            ? 'Hey! What would you like to learn about? You can ask me anything.'
            : "Hey! What's on your mind today?";
        animationCleanupRef.current = animateResponse(
          greetingResponse,
          setMessages,
          setIsStreaming
        );
        return;
      }

      // Classify subject from first message when none was provided.
      // Freeform sessions auto-pick the best match silently (no picker).
      let sessionSubjectId: string | undefined;
      let sessionSubjectName: string | undefined;

      // Recitation mode: silently auto-pick the first available subject.
      // No classification prompt — the child named a poem, not a subject.
      if (
        effectiveMode === 'recitation' &&
        !subjectId &&
        !classifiedSubject &&
        availableSubjects[0]
      ) {
        const first = availableSubjects[0];
        setClassifiedSubject({
          subjectId: first.id,
          subjectName: first.name,
        });
        sessionSubjectId = first.id;
        sessionSubjectName = first.name;
      } else if (!subjectId && !classifiedSubject && userMessageCount <= 2) {
        setPendingClassification(true);
        setClassifyError(null);
        try {
          const result = await classifySubject.mutateAsync({ text });
          if (!result.needsConfirmation && result.candidates.length === 1) {
            const candidate = result.candidates[0]!;
            setClassifiedSubject({
              subjectId: candidate.subjectId,
              subjectName: candidate.subjectName,
            });
            setShowWrongSubjectChip(false);
            sessionSubjectId = candidate.subjectId;
            sessionSubjectName = candidate.subjectName;
            setMessages((prev) => [
              ...prev,
              {
                id: createLocalMessageId('ai'),
                role: 'assistant',
                content: `Got it, this sounds like ${candidate.subjectName}.`,
                isSystemPrompt: true,
              },
            ]);
          } else if (effectiveMode === 'freeform') {
            // BUG-31 / F-1: When multiple candidates exist, ask the user which subject
            // they meant. Single candidate auto-picks. Zero candidates proceed without
            // subject — continueWithMessage handles the no-subject case.
            if (result.candidates.length > 1) {
              const freeformCandidates = result.candidates.map((c) => ({
                subjectId: c.subjectId,
                subjectName: c.subjectName,
              }));
              const promptMessage = `This sounds like it could be ${freeformCandidates
                .slice(0, 3)
                .map((c) => c.subjectName)
                .join(' or ')}. Which one are we working on?`;
              openSubjectResolution(
                text,
                promptMessage,
                freeformCandidates,
                result.suggestedSubjectName
              );
              return;
            }
            // Single candidate — never silently fall back to first enrolled subject
            const best = result.candidates[0];
            if (best) {
              setClassifiedSubject({
                subjectId: best.subjectId,
                subjectName: best.subjectName,
              });
              setShowWrongSubjectChip(true);
              sessionSubjectId = best.subjectId;
              sessionSubjectName = best.subjectName;
            }
            // If no candidates at all, proceed without subject —
            // continueWithMessage will show an appropriate error.
          } else {
            const subjectCandidates =
              result.candidates.length > 0
                ? result.candidates.map((candidate) => ({
                    subjectId: candidate.subjectId,
                    subjectName: candidate.subjectName,
                  }))
                : availableSubjects.map((candidate) => ({
                    subjectId: candidate.id,
                    subjectName: candidate.name,
                  }));

            if (subjectCandidates[0]) {
              setTopicSwitcherSubjectId(subjectCandidates[0].subjectId);
            }
            setShowWrongSubjectChip(false);

            // BUG-233: When the classifier suggests a new subject and no enrolled
            // subject matched, show the suggestion instead of a dead-end message
            const suggested = result.suggestedSubjectName ?? null;
            let promptMessage: string;
            if (result.candidates.length > 1) {
              promptMessage = `This sounds like it could be ${subjectCandidates
                .slice(0, 3)
                .map((candidate) => candidate.subjectName)
                .join(' or ')}. Which one are we working on?`;
            } else if (suggested && result.candidates.length === 0) {
              promptMessage =
                subjectCandidates.length > 0
                  ? `This sounds like ${suggested}. Pick a subject below, or tap "+ ${suggested}" to add it.`
                  : `This sounds like ${suggested}. Tap below to add it and start learning.`;
            } else if (
              result.candidates.length === 0 &&
              subjectCandidates.length === 0
            ) {
              // BUG-233: No enrolled subjects AND classifier failed to suggest —
              // fall back to subjects.resolve for rich LLM suggestions
              try {
                const resolveResult = await resolveSubject.mutateAsync({
                  rawInput: text,
                });
                const suggestions = resolveResult.suggestions ?? [];
                const resolvePrompt =
                  resolveResult.displayMessage ||
                  'Pick a subject that fits, or create your own.';
                openSubjectResolution(
                  text,
                  resolvePrompt,
                  subjectCandidates,
                  null,
                  suggestions
                );
              } catch {
                openSubjectResolution(
                  text,
                  "I couldn't figure out the subject. You can create a new one below.",
                  subjectCandidates
                );
              }
              return;
            } else {
              promptMessage =
                subjectCandidates.length > 0
                  ? 'Pick the subject that fits best:'
                  : "I couldn't place that yet. Pick the closest subject and we'll get moving.";
            }

            openSubjectResolution(
              text,
              promptMessage,
              subjectCandidates,
              suggested
            );
            return;
          }
        } catch {
          if (effectiveMode === 'freeform') {
            const fallbackCandidates = availableSubjects.map((candidate) => ({
              subjectId: candidate.id,
              subjectName: candidate.name,
            }));
            if (fallbackCandidates.length > 0) {
              openSubjectResolution(
                text,
                "I couldn't figure out the subject. Which one fits?",
                fallbackCandidates
              );
              return;
            }
          } else {
            const fallbackCandidates = availableSubjects.map((candidate) => ({
              subjectId: candidate.id,
              subjectName: candidate.name,
            }));
            setShowWrongSubjectChip(false);

            if (fallbackCandidates.length > 0) {
              setClassifyError(
                "Could not identify the subject automatically. Pick one below and we'll keep going."
              );
              openSubjectResolution(
                text,
                'Pick the subject that fits best:',
                fallbackCandidates
              );
            } else {
              // No enrolled subjects — try resolve for suggestions
              try {
                const resolveResult = await resolveSubject.mutateAsync({
                  rawInput: text,
                });
                openSubjectResolution(
                  text,
                  resolveResult.displayMessage ||
                    'Pick a subject that fits, or create your own.',
                  [],
                  null,
                  resolveResult.suggestions ?? []
                );
              } catch {
                setClassifyError(
                  'Could not identify the subject. Create a new subject to get started.'
                );
                openSubjectResolution(
                  text,
                  "I couldn't figure out the subject. You can create a new one below.",
                  []
                );
              }
            }
            return;
          }
        } finally {
          setPendingClassification(false);
        }
      }

      await continueWithMessage(text, {
        sessionSubjectId,
        sessionSubjectName,
      });
    },
    [
      isStreaming,
      pendingClassification,
      // CR-1: quotaError added so the callback re-creates when quota state changes.
      quotaError,
      pendingSubjectResolution,
      createLocalMessageId,
      subjectId,
      classifiedSubject,
      userMessageCount,
      effectiveMode,
      classifySubject,
      resolveSubject,
      availableSubjects,
      continueWithMessage,
      openSubjectResolution,
      setClassifiedSubject,
      setClassifyError,
      setMessages,
      setPendingClassification,
      setResumedBanner,
      setShowWrongSubjectChip,
      setTopicSwitcherSubjectId,
      showConfirmation,
      animateResponse,
      sessionExperience,
      animationCleanupRef,
      setIsStreaming,
    ]
  );

  return {
    openSubjectResolution,
    handleResolveSubject,
    handleCreateResolveSuggestion,
    handleCreateSuggestedSubject,
    handleSend,
  };
}
