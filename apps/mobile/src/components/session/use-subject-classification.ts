import { useCallback } from 'react';
import type { ChatMessage } from './session-types';
import type { useClassifySubject } from '../../hooks/use-classify-subject';
import type { useResolveSubject } from '../../hooks/use-resolve-subject';
import type { useCreateSubject } from '../../hooks/use-subjects';
import type {
  ContinueMessageOptions,
  SessionImageAttachment,
} from './use-session-streaming';
import { type PendingSubjectResolution, isGreeting } from './session-types';
import { useNavigationContract } from '../../hooks/use-navigation-contract';

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

  // T25: V2 "mentor-is-the-app" entry. When true (flag on + mentor entry,
  // freeform OR homework/camera), turn-1 subject resolution never opens the
  // full subject-library grid and never blocks: confident picks keep the
  // override chip visible, ambiguous picks show narrow inline disambiguation.
  // Freeform creates a classifier suggestion silently; homework (durable
  // evidence + OCR-misread risk) instead offers a tap-to-create card and only
  // falls back to enrolled quick-picks + type-to-create as a last resort.
  isV2MentorEntry: boolean;

  // Data
  availableSubjects: Array<{ id: string; name: string }>;

  // Mutation hooks
  classifySubject: ReturnType<typeof useClassifySubject>;
  resolveSubject: ReturnType<typeof useResolveSubject>;
  createSubject: ReturnType<typeof useCreateSubject>;

  // Functions from other hooks
  continueWithMessage: (
    text: string,
    options?: ContinueMessageOptions,
  ) => Promise<void>;
  createLocalMessageId: (prefix: 'user' | 'ai') => string;
  showConfirmation: (message: string) => void;

  // Greeting guard dependencies
  animateResponse: (
    response: string,
    setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
    setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>,
    onDone?: () => void,
  ) => () => void;
  userMessageCount: number;
  sessionExperience: number;
  animationCleanupRef: React.MutableRefObject<(() => void) | null>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
}

function getPendingContinueOptions(
  pendingSubjectResolution: PendingSubjectResolution,
): Pick<
  ContinueMessageOptions,
  'attachImage' | 'imageAttachment' | 'initialMentorOpener'
> {
  return {
    ...(pendingSubjectResolution.attachImage ? { attachImage: true } : {}),
    ...(pendingSubjectResolution.imageAttachment
      ? { imageAttachment: pendingSubjectResolution.imageAttachment }
      : {}),
    ...(pendingSubjectResolution.initialMentorOpener
      ? { initialMentorOpener: true }
      : {}),
  };
}

export function useSubjectClassification(
  opts: UseSubjectClassificationOptions,
) {
  const navigationContract = useNavigationContract();
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
    isV2MentorEntry,
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
      }>,
      imageOptions?: Pick<
        PendingSubjectResolution,
        'attachImage' | 'imageAttachment' | 'initialMentorOpener'
      >,
    ) => {
      const dedupedCandidates = candidates.filter(
        (candidate, index, all) =>
          all.findIndex(
            (entry) =>
              entry.subjectId === candidate.subjectId &&
              entry.subjectName === candidate.subjectName,
          ) === index,
      );

      setPendingSubjectResolution({
        originalText: text,
        prompt,
        candidates: dedupedCandidates,
        ...(imageOptions?.attachImage ? { attachImage: true } : {}),
        ...(imageOptions?.imageAttachment
          ? { imageAttachment: imageOptions.imageAttachment }
          : {}),
        ...(imageOptions?.initialMentorOpener
          ? { initialMentorOpener: true }
          : {}),
        suggestedSubjectName,
        resolveSuggestions,
      });
    },
    [setPendingSubjectResolution],
  );

  const handleResolveSubject = useCallback(
    async (candidate: { subjectId: string; subjectName: string }) => {
      if (navigationContract.isParentProxy) return;
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
        ...getPendingContinueOptions(pendingSubjectResolution),
      });
    },
    [
      continueWithMessage,
      createLocalMessageId,
      navigationContract.isParentProxy,
      isStreaming,
      pendingClassification,
      pendingSubjectResolution,
      setClassifiedSubject,
      setMessages,
      setPendingSubjectResolution,
      setShowWrongSubjectChip,
    ],
  );

  // Create a new subject from a resolve API suggestion
  const handleCreateResolveSuggestion = useCallback(
    async (suggestion: {
      name: string;
      description: string;
      focus?: string;
    }): Promise<void> => {
      if (navigationContract.isParentProxy) return;
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
          ...getPendingContinueOptions(pendingSubjectResolution),
        });
      } catch {
        showConfirmation(
          `Could not create ${suggestion.name}. Please try again or pick an existing subject.`,
        );
      }
    },
    [
      continueWithMessage,
      createLocalMessageId,
      createSubject,
      navigationContract.isParentProxy,
      isStreaming,
      pendingClassification,
      pendingSubjectResolution,
      setClassifiedSubject,
      setMessages,
      setPendingSubjectResolution,
      setShowWrongSubjectChip,
      showConfirmation,
    ],
  );

  // BUG-233: Create a new subject from the classifier's suggestion
  const handleCreateSuggestedSubject = useCallback(async (): Promise<void> => {
    if (navigationContract.isParentProxy) return;
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
        ...getPendingContinueOptions(pendingSubjectResolution),
      });
    } catch {
      showConfirmation(
        `Could not create ${suggestedName}. Please try again or pick an existing subject.`,
      );
    }
  }, [
    continueWithMessage,
    createLocalMessageId,
    createSubject,
    navigationContract.isParentProxy,
    isStreaming,
    pendingClassification,
    pendingSubjectResolution,
    setClassifiedSubject,
    setMessages,
    setPendingSubjectResolution,
    setShowWrongSubjectChip,
    showConfirmation,
  ]);

  const handleTypeSubject = useCallback(
    async (typedSubject: string): Promise<void> => {
      if (navigationContract.isParentProxy) return;
      const rawInput = typedSubject.trim();
      if (
        !rawInput ||
        !pendingSubjectResolution ||
        isStreaming ||
        pendingClassification
      ) {
        return;
      }

      try {
        const resolved = await resolveSubject.mutateAsync({ rawInput });
        const existingSubject = resolved.resolvedName
          ? availableSubjects.find(
              (subject) =>
                subject.name.toLowerCase() ===
                resolved.resolvedName?.toLowerCase(),
            )
          : undefined;

        if (existingSubject) {
          await handleResolveSubject({
            subjectId: existingSubject.id,
            subjectName: existingSubject.name,
          });
          return;
        }

        if (resolved.resolvedName) {
          const originalText = pendingSubjectResolution.originalText;
          setPendingSubjectResolution(null);
          setMessages((prev) => [
            ...prev,
            {
              id: createLocalMessageId('ai'),
              role: 'assistant',
              content: `Adding ${resolved.resolvedName} and getting started...`,
              isSystemPrompt: true,
            },
          ]);

          const result = await createSubject.mutateAsync({
            name: resolved.resolvedName,
            rawInput,
            ...(resolved.focus ? { focus: resolved.focus } : {}),
            ...(resolved.focusDescription
              ? { focusDescription: resolved.focusDescription }
              : {}),
          });
          setClassifiedSubject({
            subjectId: result.subject.id,
            subjectName: result.subject.name,
          });
          setShowWrongSubjectChip(false);
          await continueWithMessage(originalText, {
            sessionSubjectId: result.subject.id,
            sessionSubjectName: result.subject.name,
            ...getPendingContinueOptions(pendingSubjectResolution),
          });
          return;
        }

        if (resolved.suggestions.length > 0) {
          setPendingSubjectResolution((current) =>
            current
              ? {
                  ...current,
                  prompt:
                    resolved.displayMessage ||
                    'Pick the subject that fits best:',
                  resolveSuggestions: resolved.suggestions,
                }
              : current,
          );
          return;
        }

        showConfirmation(
          resolved.displayMessage ||
            "I couldn't match that subject. Try another name.",
        );
      } catch {
        showConfirmation("I couldn't match that subject. Try another name.");
      }
    },
    [
      availableSubjects,
      continueWithMessage,
      createLocalMessageId,
      createSubject,
      handleResolveSubject,
      navigationContract.isParentProxy,
      isStreaming,
      pendingClassification,
      pendingSubjectResolution,
      resolveSubject,
      setClassifiedSubject,
      setMessages,
      setPendingSubjectResolution,
      setShowWrongSubjectChip,
      showConfirmation,
    ],
  );

  const handleSend = useCallback(
    async (
      text: string,
      opts?: {
        isAutoSent?: boolean;
        imageUri?: string;
        attachImage?: boolean;
        imageAttachment?: SessionImageAttachment;
        initialMentorOpener?: boolean;
        sessionSubjectId?: string;
        sessionSubjectName?: string;
        existingEntry?: ContinueMessageOptions['existingEntry'];
      },
    ): Promise<void> => {
      if (navigationContract.isParentProxy) return;
      // CR-1: Guard on quotaError so programmatic callers (quick chips, homework
      // auto-send, queued problems) can't bypass the UI-disabled input guard.
      if (isStreaming || pendingClassification || quotaError) return;
      if (pendingSubjectResolution) {
        if (!isV2MentorEntry) {
          showConfirmation("Pick the subject first, then I'll keep going.");
          return;
        }
        // T25: V2 is non-blocking — a fresh message supersedes the pending
        // disambiguation. Clear it and let the new message re-resolve the
        // subject below instead of gating on the prior prompt.
        setPendingSubjectResolution(null);
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

      const imageResolutionOptions: Pick<
        PendingSubjectResolution,
        'attachImage' | 'imageAttachment' | 'initialMentorOpener'
      > = {
        ...(opts?.attachImage ? { attachImage: true } : {}),
        ...(opts?.imageAttachment
          ? { imageAttachment: opts.imageAttachment }
          : {}),
        ...(opts?.initialMentorOpener ? { initialMentorOpener: true } : {}),
      };
      const openSubjectResolutionForTurn = (
        originalText: string,
        prompt: string,
        candidates: Array<{ subjectId: string; subjectName: string }>,
        suggestedSubjectName?: string | null,
        resolveSuggestions?: Array<{
          name: string;
          description: string;
          focus?: string;
        }>,
      ) => {
        openSubjectResolution(
          originalText,
          prompt,
          candidates,
          suggestedSubjectName,
          resolveSuggestions,
          imageResolutionOptions,
        );
      };

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
            ? 'Hi! Ask me anything.'
            : 'Hey again — what are you curious about?';
        animationCleanupRef.current = animateResponse(
          greetingResponse,
          setMessages,
          setIsStreaming,
        );
        return;
      }

      // Classify subject from first message when none was provided.
      // Freeform sessions auto-pick the best match silently (no picker).
      let sessionSubjectId = opts?.sessionSubjectId;
      let sessionSubjectName = opts?.sessionSubjectName;

      // T25: V2 silent subject creation. Creates the subject, sets it as the
      // session subject, posts a tentative ack, and keeps the override chip
      // visible — then lets the caller fall through to continueWithMessage.
      // Returns false (and surfaces a confirmation) only if creation failed.
      const silentlyCreateSubject = async (
        name: string,
        rawInputText: string,
      ): Promise<boolean> => {
        try {
          const created = await createSubject.mutateAsync({
            name,
            rawInput: rawInputText,
          });
          setClassifiedSubject({
            subjectId: created.subject.id,
            subjectName: created.subject.name,
          });
          setShowWrongSubjectChip(true);
          setMessages((prev) => [
            ...prev,
            {
              id: createLocalMessageId('ai'),
              role: 'assistant',
              content: `Looks like ${created.subject.name}.`,
              isSystemPrompt: true,
            },
          ]);
          sessionSubjectId = created.subject.id;
          sessionSubjectName = created.subject.name;
          return true;
        } catch {
          showConfirmation(
            `Could not create ${name}. Pick a subject and we'll keep going.`,
          );
          return false;
        }
      };

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
      } else if (
        !subjectId &&
        !classifiedSubject &&
        !sessionSubjectId &&
        userMessageCount <= 2
      ) {
        setPendingClassification(true);
        setClassifyError(null);
        try {
          const result = await classifySubject.mutateAsync({ text });
          const [firstCandidate] = result.candidates;
          if (
            !result.needsConfirmation &&
            result.candidates.length === 1 &&
            firstCandidate
          ) {
            const candidate = firstCandidate;
            setClassifiedSubject({
              subjectId: candidate.subjectId,
              subjectName: candidate.subjectName,
            });
            // T25: V2 keeps the override chip visible so a confident
            // mis-commit (e.g. "analysis" -> English) is one tap to fix.
            setShowWrongSubjectChip(isV2MentorEntry);
            sessionSubjectId = candidate.subjectId;
            sessionSubjectName = candidate.subjectName;
            setMessages((prev) => [
              ...prev,
              {
                id: createLocalMessageId('ai'),
                role: 'assistant',
                content: `Looks like ${candidate.subjectName}.`,
                isSystemPrompt: true,
              },
            ]);
          } else if (effectiveMode === 'freeform') {
            // BUG-31 / F-1: When multiple candidates exist, ask the user which subject
            // they meant. Single candidate auto-picks with an override chip.
            // Zero candidates should still offer a useful subject suggestion or
            // typed fallback instead of sending the learner into a no-subject chat.
            if (result.candidates.length > 1) {
              const freeformCandidates = result.candidates.map((c) => ({
                subjectId: c.subjectId,
                subjectName: c.subjectName,
              }));
              const promptMessage = `This sounds like it could be ${freeformCandidates
                .slice(0, 3)
                .map((c) => c.subjectName)
                .join(' or ')}. Which one are we working on?`;
              openSubjectResolutionForTurn(
                text,
                promptMessage,
                freeformCandidates,
                result.suggestedSubjectName,
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
            const suggested = result.suggestedSubjectName ?? null;
            if (!best && isV2MentorEntry) {
              // T25: V2 never opens the full subject-library grid on a mentor
              // turn. Resolve a subject silently; fall back to narrow
              // new-subject suggestion cards (not the grid) only when there is
              // nothing concrete to create.
              if (suggested) {
                const created = await silentlyCreateSubject(suggested, text);
                if (!created) return;
              } else {
                try {
                  const resolveResult = await resolveSubject.mutateAsync({
                    rawInput: text,
                  });
                  if (resolveResult.resolvedName) {
                    const created = await silentlyCreateSubject(
                      resolveResult.resolvedName,
                      text,
                    );
                    if (!created) return;
                  } else if (resolveResult.suggestions.length > 0) {
                    openSubjectResolutionForTurn(
                      text,
                      resolveResult.displayMessage ||
                        'Pick a subject that fits, or create your own.',
                      [],
                      null,
                      resolveResult.suggestions,
                    );
                    return;
                  }
                  // No resolved name and no suggestions — proceed without a
                  // subject rather than gating on a grid.
                } catch {
                  // Both classifiers failed — fall through to no-subject chat.
                }
              }
            } else if (!best && suggested) {
              openSubjectResolutionForTurn(
                text,
                `This sounds like ${suggested}. Pick a subject below, or tap "+ ${suggested}" to add it.`,
                availableSubjects.map((candidate) => ({
                  subjectId: candidate.id,
                  subjectName: candidate.name,
                })),
                suggested,
              );
              return;
            } else if (!best) {
              try {
                const resolveResult = await resolveSubject.mutateAsync({
                  rawInput: text,
                });
                if (
                  resolveResult.resolvedName ||
                  resolveResult.suggestions.length > 0
                ) {
                  openSubjectResolutionForTurn(
                    text,
                    resolveResult.displayMessage ||
                      'Pick a subject that fits, or create your own.',
                    availableSubjects.map((candidate) => ({
                      subjectId: candidate.id,
                      subjectName: candidate.name,
                    })),
                    resolveResult.resolvedName,
                    resolveResult.suggestions ?? [],
                  );
                  return;
                }
              } catch {
                // Fall through to no-subject chat only when both classifiers fail.
              }
            }
          } else if (isV2MentorEntry) {
            // T25 (homework/camera): a mentor-entry homework turn never opens
            // the full subject-library grid and never blocks. Homework writes
            // durable evidence and OCR can misread, so — unlike freeform — we
            // never create a subject silently: a zero-match suggestion is a
            // tap-to-create card, and the genuine no-signal floor offers the
            // learner's own subjects plus type-to-create.
            const suggested = result.suggestedSubjectName ?? null;

            if (result.candidates.length > 1) {
              // Several subjects are an equally good bet — narrow chips.
              const narrowCandidates = result.candidates
                .slice(0, 3)
                .map((candidate) => ({
                  subjectId: candidate.subjectId,
                  subjectName: candidate.subjectName,
                }));
              setShowWrongSubjectChip(false);
              openSubjectResolutionForTurn(
                text,
                `This sounds like it could be ${narrowCandidates
                  .map((candidate) => candidate.subjectName)
                  .join(' or ')}. Which one are we working on?`,
                narrowCandidates,
              );
              return;
            }

            const best = result.candidates[0];
            if (best) {
              // A single enrolled-subject match — auto-pick, keep the override
              // chip so a mis-match is one tap to fix.
              setClassifiedSubject({
                subjectId: best.subjectId,
                subjectName: best.subjectName,
              });
              setShowWrongSubjectChip(true);
              sessionSubjectId = best.subjectId;
              sessionSubjectName = best.subjectName;
              setMessages((prev) => [
                ...prev,
                {
                  id: createLocalMessageId('ai'),
                  role: 'assistant',
                  content: `Looks like ${best.subjectName}.`,
                  isSystemPrompt: true,
                },
              ]);
              // Fall through to continueWithMessage below.
            } else {
              setShowWrongSubjectChip(false);
              if (suggested) {
                // Zero match but a concrete name — narrow tap-to-create card
                // (no grid, no silent create).
                openSubjectResolutionForTurn(
                  text,
                  `This looks like ${suggested}. Tap "+ ${suggested}" to add it, or pick one of yours.`,
                  [],
                  suggested,
                );
                return;
              }
              // Zero match and no name — ask the richer resolver for
              // new-subject cards before falling to the floor.
              try {
                const resolveResult = await resolveSubject.mutateAsync({
                  rawInput: text,
                });
                if (
                  resolveResult.resolvedName ||
                  resolveResult.suggestions.length > 0
                ) {
                  openSubjectResolutionForTurn(
                    text,
                    resolveResult.displayMessage ||
                      'Pick a subject that fits, or create your own.',
                    [],
                    resolveResult.resolvedName,
                    resolveResult.suggestions ?? [],
                  );
                  return;
                }
              } catch {
                // Fall through to the floor when the resolver also fails.
              }
              // Tier-5 floor: no signal at all. Offer the learner's own
              // subjects as quick-picks plus type-to-create — non-blocking,
              // and only as a last resort, never the turn-1 default. With no
              // enrolled subjects this collapses to type-to-create only.
              openSubjectResolutionForTurn(
                text,
                availableSubjects.length > 0
                  ? 'Which subject is this? Pick one of yours, or type a new one.'
                  : "Which subject is this? Type it and I'll set it up.",
                availableSubjects.map((candidate) => ({
                  subjectId: candidate.id,
                  subjectName: candidate.name,
                })),
              );
              return;
            }
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
                openSubjectResolutionForTurn(
                  text,
                  resolvePrompt,
                  subjectCandidates,
                  null,
                  suggestions,
                );
              } catch {
                openSubjectResolutionForTurn(
                  text,
                  "I couldn't figure out the subject. You can create a new one below.",
                  subjectCandidates,
                );
              }
              return;
            } else {
              promptMessage =
                subjectCandidates.length > 0
                  ? 'Pick the subject that fits best:'
                  : "I couldn't place that yet. Pick the closest subject and we'll get moving.";
            }

            openSubjectResolutionForTurn(
              text,
              promptMessage,
              subjectCandidates,
              suggested,
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
              openSubjectResolutionForTurn(
                text,
                "I couldn't figure out the subject. Which one fits?",
                fallbackCandidates,
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
                "Could not identify the subject automatically. Pick one below and we'll keep going.",
              );
              openSubjectResolutionForTurn(
                text,
                'Pick the subject that fits best:',
                fallbackCandidates,
              );
            } else {
              // No enrolled subjects — try resolve for suggestions
              try {
                const resolveResult = await resolveSubject.mutateAsync({
                  rawInput: text,
                });
                openSubjectResolutionForTurn(
                  text,
                  resolveResult.displayMessage ||
                    'Pick a subject that fits, or create your own.',
                  [],
                  null,
                  resolveResult.suggestions ?? [],
                );
              } catch {
                setClassifyError(
                  'Could not identify the subject. Create a new subject to get started.',
                );
                openSubjectResolutionForTurn(
                  text,
                  "I couldn't figure out the subject. You can create a new one below.",
                  [],
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
        ...(opts?.existingEntry ? { existingEntry: opts.existingEntry } : {}),
        ...(opts?.attachImage ? { attachImage: true } : {}),
        ...(opts?.imageAttachment
          ? { imageAttachment: opts.imageAttachment }
          : {}),
        ...(opts?.initialMentorOpener ? { initialMentorOpener: true } : {}),
      });
    },
    [
      navigationContract.isParentProxy,
      isStreaming,
      pendingClassification,
      // CR-1: quotaError added so the callback re-creates when quota state changes.
      quotaError,
      pendingSubjectResolution,
      setPendingSubjectResolution,
      createLocalMessageId,
      subjectId,
      classifiedSubject,
      userMessageCount,
      effectiveMode,
      isV2MentorEntry,
      classifySubject,
      resolveSubject,
      createSubject,
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
    ],
  );

  return {
    openSubjectResolution,
    handleResolveSubject,
    handleCreateResolveSuggestion,
    handleCreateSuggestedSubject,
    handleTypeSubject,
    handleSend,
  };
}
