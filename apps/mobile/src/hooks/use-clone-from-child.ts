import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import * as Crypto from 'expo-crypto';
import {
  cloneFromChildResponseSchema,
  undoCloneFromChildResponseSchema,
  type CloneCreatedIds,
  type CloneFromChildResponse,
} from '@eduagent/schemas';

import { assertOk } from '../lib/assert-ok';
import { useApiClient, NotFoundError } from '../lib/api-client';
import { formatApiError } from '../lib/format-api-error';
import {
  FAMILY_CHILDREN_RETURN_TO,
  FAMILY_PROGRESS_RETURN_TO,
  FAMILY_RECAPS_RETURN_TO,
} from '../lib/navigation';
import { queryKeys } from '../lib/query-keys';
import { hashProfileId, track } from '../lib/analytics';
import { useProfile } from '../lib/profile';

type BridgeReturnTarget = {
  returnTo: string;
  returnId?: string;
};

export type CloneFromChildArgs = {
  childProfileId: string;
  topicId: string;
  topicTitle?: string | null;
  subjectName?: string | null;
  childDisplayName?: string | null;
  forceCopy?: boolean;
  triggerPath: string;
};

type OpenTarget = {
  topicId: string;
  subjectId: string;
  topicTitle?: string | null;
  subjectName?: string | null;
  returnTarget: BridgeReturnTarget;
};

export type CloneToastAction = {
  label: string;
  onPress: () => void;
  testID: string;
};

export type CloneToast = {
  kind: 'success' | 'error';
  message: string;
  detail?: string;
  primaryAction?: CloneToastAction;
  secondaryAction?: CloneToastAction;
};

function triggerSurface(triggerPath: string): string {
  if (triggerPath.startsWith('/recaps/')) return 'recaps_detail';
  if (triggerPath.includes('/session/')) return 'child_session_detail';
  if (
    triggerPath.includes('/curriculum/') ||
    triggerPath.endsWith('/curriculum')
  ) {
    return 'child_curriculum_detail';
  }
  if (triggerPath.startsWith('/progress')) return 'family_progress';
  return 'family_child';
}

function returnTargetForTriggerPath(triggerPath: string): BridgeReturnTarget {
  const recapMatch = /^\/recaps\/([^/?#]+)/.exec(triggerPath);
  if (recapMatch?.[1]) {
    return { returnTo: FAMILY_RECAPS_RETURN_TO, returnId: recapMatch[1] };
  }

  const childMatch = /^\/child\/([^/?#]+)/.exec(triggerPath);
  if (childMatch?.[1]) {
    return { returnTo: FAMILY_CHILDREN_RETURN_TO, returnId: childMatch[1] };
  }

  if (triggerPath.startsWith('/progress')) {
    return { returnTo: FAMILY_PROGRESS_RETURN_TO };
  }

  return { returnTo: FAMILY_CHILDREN_RETURN_TO };
}

function invalidateAdultLearningCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  profileId: string | undefined,
  subjectId: string | undefined,
): void {
  if (!profileId) return;

  void queryClient.invalidateQueries({
    queryKey: ['library', 'books', profileId],
  });
  void queryClient.invalidateQueries({
    queryKey: queryKeys.library.retention(profileId),
  });
  void queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === 'subjects' && query.queryKey[1] === profileId,
  });
  void queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === 'curriculum' &&
      query.queryKey[2] === profileId &&
      (!subjectId || query.queryKey[1] === subjectId),
  });
  void queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === 'books' && query.queryKey[2] === profileId,
  });
  void queryClient.invalidateQueries({
    predicate: (query) =>
      query.queryKey[0] === 'book' && query.queryKey[3] === profileId,
  });
}

function subjectLabel(subjectName: string | null | undefined): string {
  return subjectName ? `your ${subjectName}` : 'your learning';
}

function topicLabel(topicTitle: string | null | undefined): string {
  return topicTitle ? `"${topicTitle}"` : 'This topic';
}

export function useCloneFromChild(): {
  cloneFromChild: (args: CloneFromChildArgs) => void;
  undoLastClone: (createdIds: CloneCreatedIds) => void;
  dismissToast: () => void;
  isCloning: boolean;
  isCloningFor: (topicId: string) => boolean;
  toast: CloneToast | null;
} {
  const client = useApiClient();
  const queryClient = useQueryClient();
  const router = useRouter();
  const { activeProfile } = useProfile();
  const [toast, setToast] = useState<CloneToast | null>(null);
  const lastOpenTargetRef = useRef<OpenTarget | null>(null);
  const lastCloneArgsRef = useRef<CloneFromChildArgs | null>(null);
  const cloneFromChildRef = useRef<((args: CloneFromChildArgs) => void) | null>(
    null,
  );

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const openTarget = useCallback(
    (target: OpenTarget): void => {
      router.push({
        pathname: '/(app)/topic/relearn',
        params: {
          topicId: target.topicId,
          subjectId: target.subjectId,
          ...(target.topicTitle ? { topicName: target.topicTitle } : {}),
          ...(target.subjectName ? { subjectName: target.subjectName } : {}),
          returnTo: target.returnTarget.returnTo,
          ...(target.returnTarget.returnId
            ? { returnId: target.returnTarget.returnId }
            : {}),
          source: 'parent_bridge',
        },
      } as Href);
    },
    [router],
  );

  const undoMutation = useMutation({
    mutationFn: async (createdIds: CloneCreatedIds) => {
      const res = await client.curriculum['clone-from-child'].undo.$delete({
        json: { createdIds },
      });
      await assertOk(res);
      return undoCloneFromChildResponseSchema.parse(await res.json());
    },
    onSuccess: (result) => {
      if (result.reason === 'session_started') {
        const target = lastOpenTargetRef.current;
        setToast({
          kind: 'error',
          message: "Couldn't undo - you've already opened this topic.",
          detail: 'You can remove it from Library later.',
          primaryAction: target
            ? {
                label: 'Open',
                onPress: () => openTarget(target),
                testID: 'clone-toast-open-after-undo-failed',
              }
            : undefined,
        });
        return;
      }

      setToast(null);
    },
    onError: () => {
      setToast(null);
    },
  });

  const cloneMutation = useMutation({
    mutationFn: async (
      args: CloneFromChildArgs & { requestId: string },
    ): Promise<CloneFromChildResponse> => {
      const res = await client.curriculum['clone-from-child'].$post({
        json: {
          childProfileId: args.childProfileId,
          topicId: args.topicId,
          forceCopy: args.forceCopy,
          requestId: args.requestId,
        },
      });
      await assertOk(res);
      return cloneFromChildResponseSchema.parse(await res.json());
    },
    onSuccess: (result, args) => {
      invalidateAdultLearningCaches(
        queryClient,
        activeProfile?.id,
        result.subjectId,
      );

      if (activeProfile?.id) {
        track('add_to_my_learning.bridge', {
          adultProfileHash: hashProfileId(activeProfile.id),
          childProfileHash: hashProfileId(args.childProfileId),
          triggerSurface: triggerSurface(args.triggerPath),
          alreadyExisted: result.alreadyExisted,
          descriptionDivergent: result.descriptionDivergent,
          descriptionRefreshed: result.descriptionRefreshed,
          topicState: result.topicState,
          forceCopy: args.forceCopy === true,
        });
      }

      const target: OpenTarget = {
        topicId: result.topicId,
        subjectId: result.subjectId,
        topicTitle: args.topicTitle,
        subjectName: args.subjectName,
        returnTarget: returnTargetForTriggerPath(args.triggerPath),
      };
      lastOpenTargetRef.current = target;
      lastCloneArgsRef.current = args;

      const openLabel =
        result.topicState === 'completed'
          ? 'Review'
          : result.topicState === 'in_progress'
            ? 'Resume'
            : result.descriptionDivergent
              ? 'Open my copy'
              : 'Open';

      const openAction: CloneToastAction = {
        label: openLabel,
        onPress: () => openTarget(target),
        testID: 'clone-toast-open',
      };

      if (result.descriptionDivergent) {
        setToast({
          kind: 'success',
          message: `${topicLabel(args.topicTitle)} is already in ${subjectLabel(
            args.subjectName,
          )} - but their version reads differently.`,
          primaryAction: openAction,
          secondaryAction: {
            label: 'Add separate copy',
            onPress: () => {
              const previous = lastCloneArgsRef.current;
              if (previous) {
                cloneFromChildRef.current?.({
                  ...previous,
                  forceCopy: true,
                });
              }
            },
            testID: 'clone-toast-force-copy',
          },
        });
        return;
      }

      if (result.topicState === 'in_progress') {
        setToast({
          kind: 'success',
          message: `${topicLabel(args.topicTitle)} is in ${subjectLabel(
            args.subjectName,
          )} - you're working on it.`,
          primaryAction: openAction,
        });
        return;
      }

      if (result.topicState === 'completed') {
        setToast({
          kind: 'success',
          message: `You've already learned ${topicLabel(args.topicTitle)}.`,
          primaryAction: openAction,
        });
        return;
      }

      if (result.descriptionRefreshed) {
        setToast({
          kind: 'success',
          message: `Updated ${topicLabel(args.topicTitle)} in ${subjectLabel(
            args.subjectName,
          )} with their latest version.`,
          primaryAction: openAction,
        });
        return;
      }

      if (result.alreadyExisted) {
        setToast({
          kind: 'success',
          message: `${topicLabel(args.topicTitle)} is already in ${subjectLabel(
            args.subjectName,
          )}.`,
          primaryAction: openAction,
        });
        return;
      }

      setToast({
        kind: 'success',
        message: `Added ${topicLabel(args.topicTitle)} to ${subjectLabel(
          args.subjectName,
        )}.`,
        detail: 'Private to your learning.',
        primaryAction: openAction,
        secondaryAction:
          result.createdIds.topicId != null
            ? {
                label: undoMutation.isPending ? 'Undoing...' : 'Undo',
                onPress: () => undoMutation.mutate(result.createdIds),
                testID: 'clone-toast-undo',
              }
            : undefined,
      });
    },
    onError: (error) => {
      setToast({
        kind: 'error',
        message:
          error instanceof NotFoundError
            ? 'This topic is no longer available.'
            : formatApiError(error),
      });
    },
  });

  const cloneFromChild = useCallback(
    (args: CloneFromChildArgs): void => {
      lastCloneArgsRef.current = args;
      cloneMutation.mutate({
        ...args,
        requestId: Crypto.randomUUID(),
      });
    },
    [cloneMutation],
  );

  useEffect(() => {
    cloneFromChildRef.current = cloneFromChild;
  }, [cloneFromChild]);

  const undoLastClone = useCallback(
    (createdIds: CloneCreatedIds): void => {
      undoMutation.mutate(createdIds);
    },
    [undoMutation],
  );

  const isCloningFor = useCallback(
    (topicId: string): boolean =>
      cloneMutation.isPending && cloneMutation.variables?.topicId === topicId,
    [cloneMutation.isPending, cloneMutation.variables],
  );

  return {
    cloneFromChild,
    undoLastClone,
    dismissToast,
    isCloning: cloneMutation.isPending,
    isCloningFor,
    toast,
  };
}
