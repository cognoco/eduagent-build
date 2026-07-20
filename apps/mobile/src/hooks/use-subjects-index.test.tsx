import { createElement, type ReactElement, type ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { CurriculumBook, Subject } from '@eduagent/schemas';

import {
  createHookWrapper,
  createTestProfile,
} from '../test-utils/app-hook-test-utils';
import { AppContextProvider } from '../lib/app-context';
import { setActiveProfileId } from '../lib/api-client';
import { buildSubjectsIndex, useSubjectsIndex } from './use-subjects-index';
import type { OverallProgressResponse } from './use-progress';

const SUBJECT_A = '550e8400-e29b-41d4-a716-446655440000';
const SUBJECT_B = '660e8400-e29b-41d4-a716-446655440001';

function subject(
  id: string,
  name: string,
  status = 'active',
  urgencyBoostUntil: string | null = null,
): Subject {
  return {
    id,
    profileId: '770e8400-e29b-41d4-a716-446655440002',
    name,
    status: status as Subject['status'],
    curriculumStatus: 'ready',
    pedagogyMode: 'socratic',
    urgencyBoostUntil,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
  };
}

function book(
  subjectId: string,
  overrides: Partial<CurriculumBook> = {},
): CurriculumBook {
  return {
    id: `880e8400-e29b-41d4-a716-44665544000${subjectId === SUBJECT_A ? 3 : 4}`,
    subjectId,
    title: 'Book',
    description: null,
    emoji: null,
    sortOrder: 1,
    topicsGenerated: true,
    status: 'IN_PROGRESS',
    topicCount: 5,
    completedTopicCount: 2,
    masteredTopicCount: 1,
    createdAt: '2026-06-01T00:00:00.000Z',
    updatedAt: '2026-06-01T00:00:00.000Z',
    ...overrides,
  };
}

function progress(
  subjectId: string,
  overrides: Partial<OverallProgressResponse['subjects'][number]> = {},
): OverallProgressResponse['subjects'][number] {
  return {
    subjectId,
    name: subjectId === SUBJECT_A ? 'Spanish' : 'Algebra',
    topicsTotal: 5,
    topicsCompleted: 2,
    topicsVerified: 1,
    topicsMastered: 1,
    topicsLearning: 1,
    urgencyScore: 0,
    retentionStatus: 'strong',
    lastSessionAt: null,
    ...overrides,
  };
}

const SUBJECT_C = '990e8400-e29b-41d4-a716-446655440005';

describe('buildSubjectsIndex', () => {
  it('passes every status through (not active-only) and maps status + urgencyBoostUntil', () => {
    const result = buildSubjectsIndex({
      subjects: [
        subject(SUBJECT_A, 'Spanish', 'active', '2999-01-01T00:00:00.000Z'),
        subject(SUBJECT_B, 'Algebra', 'paused'),
        subject(SUBJECT_C, 'Archived', 'archived'),
      ],
      librarySubjects: [
        {
          subjectId: SUBJECT_A,
          subjectName: 'Spanish',
          books: [book(SUBJECT_A, { status: 'REVIEW_DUE' })],
        },
        {
          subjectId: SUBJECT_B,
          subjectName: 'Algebra',
          books: [book(SUBJECT_B)],
        },
      ],
      progressSubjects: [
        progress(SUBJECT_A, {
          topicsTotal: 6,
          topicsMastered: 2,
          topicsLearning: 3,
        }),
      ],
    });

    // All three statuses pass through — the legacy active-only filter is gone.
    expect(
      result.map((item: { subjectName: string }) => item.subjectName),
    ).toEqual(['Spanish', 'Algebra', 'Archived']);
    expect(result[0]).toEqual(
      expect.objectContaining({
        subjectId: SUBJECT_A,
        status: 'active',
        urgencyBoostUntil: '2999-01-01T00:00:00.000Z',
        mastered: 2,
        learning: 3,
        total: 6,
        dueReviews: 1,
      }),
    );
    expect(result[1]).toEqual(
      expect.objectContaining({
        subjectId: SUBJECT_B,
        status: 'paused',
        urgencyBoostUntil: null,
        mastered: 1,
        learning: 1,
        total: 5,
        dueReviews: 0,
      }),
    );
    expect(result[2]).toEqual(
      expect.objectContaining({ subjectId: SUBJECT_C, status: 'archived' }),
    );
  });
});

describe('useSubjectsIndex', () => {
  async function captureSubjectsRequest(
    callback: () => ReturnType<typeof useSubjectsIndex>,
  ): Promise<string> {
    const originalFetch = globalThis.fetch;
    const mockFetch = jest.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url.includes('/subjects')) {
        return new Response(JSON.stringify({ subjects: [] }), { status: 200 });
      }
      if (url.includes('/library/books')) {
        return new Response(
          JSON.stringify({ subjects: [], nextCursor: null }),
          { status: 200 },
        );
      }
      if (url.includes('/progress/overview')) {
        return new Response(
          JSON.stringify({
            subjects: [],
            totalTopicsCompleted: 0,
            totalTopicsVerified: 0,
            totalTopicsMastered: 0,
            totalTopicsLearning: 0,
          }),
          { status: 200 },
        );
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    const harness = createHookWrapper({
      activeProfile: createTestProfile({ id: 'subjects-index-profile' }),
    });
    function Wrapper({ children }: { children: ReactNode }): ReactElement {
      return createElement(
        harness.wrapper,
        null,
        createElement(AppContextProvider, null, children),
      );
    }

    setActiveProfileId('subjects-index-profile');
    globalThis.fetch = mockFetch as typeof fetch;

    try {
      const { result } = renderHook(callback, { wrapper: Wrapper });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      const subjectsRequest = mockFetch.mock.calls
        .map(([input]) =>
          typeof input === 'string' ? input : input.toString(),
        )
        .find((url) => url.includes('/subjects'));
      if (!subjectsRequest) {
        throw new Error('useSubjectsIndex did not request /subjects');
      }
      return subjectsRequest;
    } finally {
      harness.queryClient.clear();
      setActiveProfileId(undefined);
      globalThis.fetch = originalFetch;
    }
  }

  it('requests active subjects by default', async () => {
    const requestUrl = new URL(
      await captureSubjectsRequest(() => useSubjectsIndex()),
      'https://test.invalid',
    );

    expect(requestUrl.searchParams.has('includeInactive')).toBe(false);
  });

  it('requests inactive subjects when explicitly enabled', async () => {
    const requestUrl = new URL(
      await captureSubjectsRequest(() =>
        useSubjectsIndex({ includeInactive: true }),
      ),
      'https://test.invalid',
    );

    expect(requestUrl.searchParams.get('includeInactive')).toBe('true');
  });
});
