/**
 * Library-surface context hooks.
 *
 * These hooks own the `/library/retention` query and derived data. Other
 * surfaces must not call `/library/retention` directly — they read derived
 * state via the hooks exposed here.
 *
 * PAYLOAD-NARROW: Library no longer fetches overall-progress data for
 * retention. Retention is derived exclusively from the library-owned
 * `/library/retention` endpoint. See the surface-ownership plan at
 * docs/superpowers/plans/2026-05-13-surface-ownership-boundaries.md PR 4.
 *
 * IMPORT-BOUNDARY FACADE: `useSubjectRetentionMap` is the public API for
 * downstream components. Do not bypass it with direct `useLibraryRetention`
 * calls from non-library surfaces.
 */

import { useMemo } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useApiClient } from '../lib/api-client';
import { useProfile } from '../lib/profile';
import { combinedSignal } from '../lib/query-timeout';
import { assertOk } from '../lib/assert-ok';
import { deriveRetentionStatus, RETENTION_ORDER } from '../lib/retention-utils';
import type { RetentionStatus } from '@eduagent/schemas';

// ---------------------------------------------------------------------------
// Retention API shape
// ---------------------------------------------------------------------------

/**
 * Per-topic SRS card data returned by `/library/retention` for each subject.
 * The response shape is topic-level (not subject-level); a subject-level
 * retention status is derived via `useSubjectRetentionMap` by taking the
 * worst status across all topics.
 */
export interface LibraryRetentionTopic {
  topicId: string;
  topicTitle?: string;
  bookId?: string | null;
  easeFactor: number;
  repetitions: number;
  nextReviewAt?: string | null;
  lastReviewedAt: string | null;
  daysSinceLastReview?: number | null;
  xpStatus: 'pending' | 'verified' | 'decayed';
  failureCount: number;
}

export interface LibraryRetentionSubject {
  subjectId: string;
  topics: LibraryRetentionTopic[];
  reviewDueCount: number;
}

export interface LibraryRetentionResponse {
  subjects: LibraryRetentionSubject[];
}

// ---------------------------------------------------------------------------
// Query hook
// ---------------------------------------------------------------------------

/**
 * Library-owned retention query.
 *
 * Encapsulates the `/library/retention` aggregate call. This is the single
 * place in the mobile codebase that fetches library retention data. The query
 * key is `['library', 'retention', activeProfile?.id]` — the same key used by
 * `setLibraryRetention` in tests.
 */
export function useLibraryRetention(): UseQueryResult<LibraryRetentionResponse> {
  const apiClient = useApiClient();
  const { activeProfile } = useProfile();

  return useQuery<LibraryRetentionResponse>({
    queryKey: ['library', 'retention', activeProfile?.id],
    queryFn: async ({ signal: querySignal }: { signal?: AbortSignal }) => {
      const { signal, cleanup } = combinedSignal(querySignal);
      try {
        const res = await apiClient.library.retention.$get(
          {},
          { init: { signal } },
        );
        await assertOk(res);
        return (await res.json()) as LibraryRetentionResponse;
      } finally {
        cleanup();
      }
    },
    enabled: !!activeProfile,
    retry: false,
  });
}

// ---------------------------------------------------------------------------
// Derived: subject-level retention map
// ---------------------------------------------------------------------------

/**
 * Derives the worst retention status across all topics for each subject.
 *
 * PAYLOAD-NARROW: does NOT touch overall-progress. Library was over-fetching
 * `useOverallProgress` to populate a per-subject retention summary; retention
 * is now derived exclusively from the library-owned `/library/retention`
 * payload.
 *
 * Returns `Map<subjectId, RetentionStatus>`. Subjects with no topics are
 * omitted from the map (callers should default to `null` / no pill).
 */
export function useSubjectRetentionMap(): Map<string, RetentionStatus> {
  const { data } = useLibraryRetention();

  return useMemo(() => {
    const map = new Map<string, RetentionStatus>();
    for (const subject of data?.subjects ?? []) {
      const topics = Array.isArray(subject.topics) ? subject.topics : [];
      if (topics.length === 0) continue;

      let worst: RetentionStatus = 'strong';
      for (const topic of topics) {
        const status = deriveRetentionStatus(topic);
        if (RETENTION_ORDER[status] < RETENTION_ORDER[worst]) {
          worst = status;
        }
      }
      map.set(subject.subjectId, worst);
    }
    return map;
  }, [data?.subjects]);
}
