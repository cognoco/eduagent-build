import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
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
import {
  ForbiddenError,
  NetworkError,
  NotFoundError,
  QuotaExceededError,
  UpstreamError,
  useApiClient,
} from '../lib/api-client';
import { formatApiError } from '../lib/format-api-error';
import { combinedSignal } from '../lib/query-timeout';
import { useEnsureStudyMode } from '../lib/use-mode-switch';
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
  childProfileId: string;
  topicId: string;
  subjectId: string;
  topicTitle?: string | null;
  subjectName?: string | null;
  returnTarget: BridgeReturnTarget;
  triggerPath: string;
};

type BrowserHistoryWindow = {
  history?: {
    state: unknown;
    pushState: (
      data: unknown,
      unused: string,
      url?: string | URL | null,
    ) => void;
  };
  location?: {
    assign: (url: string) => void;
  };
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

// Local union — the analytics event consumer (Mixpanel / warehouse) groups
// bridge taps by this dimension. Promoting to a typed union means a new entry
// surface that forgets to extend this union becomes a TypeScript error at
// the function return, not a silent drift to `string` that ships to prod
// looking like a new value. Spec audit-trail line in
// docs/specs/2026-05-23-learn-this-too-bridge.md §Authorization point 6 is
// derived from this union (it is the source of truth, not the spec).
export type BridgeTriggerSurface =
  | 'recaps_detail'
  | 'child_curriculum_detail'
  | 'child_session_detail'
  | 'family_progress'
  | 'family_child';

export function triggerSurface(triggerPath: string): BridgeTriggerSurface {
  if (triggerPath.startsWith('/recaps/')) return 'recaps_detail';
  if (triggerPath.includes('/child/') && triggerPath.includes('/session/')) {
    return 'child_session_detail';
  }
  if (
    triggerPath.includes('/curriculum/') ||
    triggerPath.endsWith('/curriculum') ||
    (triggerPath.includes('/child/') && triggerPath.includes('/topic/'))
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

function appHrefForTriggerPath(triggerPath: string): Href {
  const normalizedPath = triggerPath.startsWith('/')
    ? triggerPath
    : `/${triggerPath}`;

  if (normalizedPath.startsWith('/(app)/')) {
    return normalizedPath as Href;
  }

  if (
    normalizedPath.startsWith('/child/') ||
    normalizedPath.startsWith('/recaps/') ||
    normalizedPath === '/progress' ||
    normalizedPath.startsWith('/progress/')
  ) {
    return `/(app)${normalizedPath}` as Href;
  }

  return '/(app)/home' as Href;
}

function publicPathForTriggerPath(triggerPath: string): string {
  const normalizedPath = triggerPath.startsWith('/')
    ? triggerPath
    : `/${triggerPath}`;

  if (normalizedPath.startsWith('/(app)/')) {
    return normalizedPath.slice('/(app)'.length) || '/home';
  }

  return normalizedPath;
}

function publicRelearnPathForTarget(target: OpenTarget): string {
  const params = new URLSearchParams({
    childProfileId: target.childProfileId,
    topicId: target.topicId,
    subjectId: target.subjectId,
    returnTo: target.returnTarget.returnTo,
    source: 'parent_bridge',
  });

  if (target.topicTitle) {
    params.set('topicName', target.topicTitle);
  }
  if (target.subjectName) {
    params.set('subjectName', target.subjectName);
  }
  if (target.returnTarget.returnId) {
    params.set('returnId', target.returnTarget.returnId);
  }

  return `/topic/relearn?${params.toString()}`;
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
  const ensureStudyMode = useEnsureStudyMode();

  // Library is a study-only tab (not in FAMILY_TABS / not in V1 guardian
  // visible tabs). A bare router.push('/(app)/library') from family chrome
  // navigates to a tab the contract considers hidden. ensureStudyMode pairs
  // the navigation with the necessary mode switch so chrome and route stay
  // consistent.
  const goToLibrary = useCallback((): void => {
    ensureStudyMode(() => router.push('/(app)/library' as Href));
  }, [ensureStudyMode, router]);
  const [toast, setToast] = useState<CloneToast | null>(null);
  const lastOpenTargetRef = useRef<OpenTarget | null>(null);
  const lastCloneArgsRef = useRef<CloneFromChildArgs | null>(null);
  const cloneFromChildRef = useRef<((args: CloneFromChildArgs) => void) | null>(
    null,
  );

  const dismissToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    // Error toasts carry recovery actions (Try again, Upgrade, See linked
    // children) — they must persist until the user takes an action or
    // dismisses, otherwise the recovery affordance is invisible to anyone
    // not staring at the screen. Success toasts (Undo / Open) still
    // auto-dismiss after 5s.
    if (!toast || toast.kind === 'error') return undefined;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  const openTarget = useCallback(
    (target: OpenTarget): void => {
      // Cross-stack pushes on web can otherwise synthesize Home as the browser
      // back target. Seed the exact family origin first, then push relearn.
      if (Platform.OS === 'web') {
        const browserWindow = (globalThis as { window?: BrowserHistoryWindow })
          .window;
        browserWindow?.history?.pushState(
          browserWindow.history.state,
          '',
          publicPathForTriggerPath(target.triggerPath),
        );
        browserWindow?.location?.assign(publicRelearnPathForTarget(target));
        return;
      } else {
        router.push(appHrefForTriggerPath(target.triggerPath));
      }
      router.push({
        pathname: '/(app)/topic/relearn',
        params: {
          childProfileId: target.childProfileId,
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
      // BUG-775: Mutation must carry an abort/timeout signal. Without one, a
      // hung network request leaves the spinner spinning forever and the
      // press handler never resolves. combinedSignal applies the default
      // 12s timeout from query-timeout.ts.
      const { signal, cleanup } = combinedSignal(undefined);
      try {
        const res = await client.curriculum['clone-from-child'].undo.$delete(
          { json: { createdIds } },
          { init: { signal } },
        );
        await assertOk(res);
        return undoCloneFromChildResponseSchema.parse(await res.json());
      } finally {
        cleanup();
      }
    },
    onSuccess: (result) => {
      if (result.reason === 'session_started') {
        const target = lastOpenTargetRef.current;
        setToast({
          kind: 'error',
          message: "Couldn't undo - you've already opened this topic.",
          detail: 'You can remove it from Library.',
          primaryAction: target
            ? {
                label: 'Open',
                onPress: () => openTarget(target),
                testID: 'clone-toast-open-after-undo-failed',
              }
            : undefined,
          secondaryAction: {
            label: 'Go to Library',
            onPress: goToLibrary,
            testID: 'clone-toast-library-after-undo-failed',
          },
        });
        return;
      }

      setToast(null);
    },
    onError: (_error, createdIds) => {
      // Undo failed (network blip, race with another mutation). Don't silently
      // clear the toast — that makes the user believe the undo succeeded when
      // the clone is still in their library. Offer a retry and a path to
      // Library so they can remove it manually.
      setToast({
        kind: 'error',
        message: "Couldn't undo. Try again, or remove it from Library.",
        primaryAction: {
          label: 'Try again',
          onPress: () => undoMutation.mutate(createdIds),
          testID: 'clone-toast-undo-retry',
        },
        secondaryAction: {
          label: 'Go to Library',
          onPress: goToLibrary,
          testID: 'clone-toast-library-after-undo-error',
        },
      });
    },
  });

  const cloneMutation = useMutation({
    mutationFn: async (
      args: CloneFromChildArgs & { requestId: string },
    ): Promise<CloneFromChildResponse> => {
      // BUG-775: Mutation must carry an abort/timeout signal. Without one, a
      // hung clone-from-child POST leaves the AddToMyLearningButton spinner
      // spinning forever (Playwright observes a 45s timeout and the press
      // never resolves). combinedSignal applies the default 12s timeout from
      // query-timeout.ts; on timeout the request aborts and the mutation
      // rejects, routing to the onError handler which surfaces a "Try again"
      // toast.
      const { signal, cleanup } = combinedSignal(undefined);
      try {
        const res = await client.curriculum['clone-from-child'].$post(
          {
            json: {
              childProfileId: args.childProfileId,
              topicId: args.topicId,
              forceCopy: args.forceCopy,
              requestId: args.requestId,
            },
          },
          { init: { signal } },
        );
        await assertOk(res);
        return cloneFromChildResponseSchema.parse(await res.json());
      } finally {
        cleanup();
      }
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
        childProfileId: args.childProfileId,
        topicId: result.topicId,
        subjectId: result.subjectId,
        topicTitle: args.topicTitle,
        subjectName: args.subjectName,
        returnTarget: returnTargetForTriggerPath(args.triggerPath),
        triggerPath: args.triggerPath,
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
      // Classify typed errors before falling back to the generic formatter so
      // quota / unlinked / not-found cases each surface an actionable recovery
      // path instead of a dismissing toast.
      if (error instanceof NotFoundError) {
        setToast({
          kind: 'error',
          message: 'This topic is no longer available.',
          primaryAction: {
            label: 'Back',
            onPress: () => router.back(),
            testID: 'clone-toast-back-not-found',
          },
        });
        return;
      }
      if (error instanceof QuotaExceededError) {
        setToast({
          kind: 'error',
          message: "You've reached your monthly learning limit.",
          detail: 'Upgrade to keep adding topics this month.',
          primaryAction: {
            label: 'Upgrade',
            onPress: () => router.push('/(app)/subscription' as Href),
            testID: 'clone-toast-upgrade',
          },
        });
        return;
      }
      if (error instanceof ForbiddenError) {
        setToast({
          kind: 'error',
          message: "We can't add this topic right now.",
          detail: 'Check that this child is still linked to your account.',
          primaryAction: {
            // Route to Progress (which surfaces linked children) instead of
            // the generic home hub — gives the user a place to verify the
            // family link state.
            label: 'See linked children',
            onPress: () => router.push('/(app)/progress' as Href),
            testID: 'clone-toast-open-family',
          },
        });
        return;
      }
      // Classify NetworkError and UpstreamError before falling through to the
      // generic formatter — distinct error classes deserve distinct copy and
      // distinct retry semantics. formatApiError is a presentation helper, not
      // a classifier; never string-match its output.
      const retryArgs = lastCloneArgsRef.current;
      const retryAction = retryArgs
        ? {
            label: 'Try again',
            onPress: () => cloneFromChildRef.current?.(retryArgs),
            testID: 'clone-toast-retry',
          }
        : undefined;
      if (error instanceof NetworkError) {
        setToast({
          kind: 'error',
          message: 'No connection. Check your network and try again.',
          primaryAction: retryAction,
        });
        return;
      }
      if (error instanceof UpstreamError) {
        setToast({
          kind: 'error',
          message: 'Something went wrong on our side. Try again in a moment.',
          primaryAction: retryAction,
        });
        return;
      }
      setToast({
        kind: 'error',
        message: formatApiError(error),
        primaryAction: retryAction,
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
