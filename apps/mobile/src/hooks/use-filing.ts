import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { DetectedTopic, FilingResult } from '@eduagent/schemas';
import { useApiClient } from '../lib/api-client';
import { assertOk } from '../lib/assert-ok';

interface FilingInput {
  rawInput?: string;
  selectedSuggestion?: string | null;
  sessionTranscript?: string;
  sessionMode?: 'freeform' | 'homework';
  sessionId?: string;
  subjectId?: string;
  pickedSuggestionId?: string;
  usedTopicSuggestionId?: string;
}

export function useFiling() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: FilingInput) => {
      const res = await client.filing.$post({ json: input });
      await assertOk(res);
      return (await res.json()) as FilingResult;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
      void queryClient.invalidateQueries({ queryKey: ['books'] });
      void queryClient.invalidateQueries({ queryKey: ['book-suggestions'] });
      void queryClient.invalidateQueries({ queryKey: ['topic-suggestions'] });
    },
  });
}

export function useMultiTopicFiling() {
  const client = useApiClient();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      sessionId: string;
      topics: DetectedTopic[];
    }) => {
      const results: FilingResult[] = [];
      for (const topic of input.topics) {
        const res = await client.filing.$post({
          json: {
            sessionId: input.sessionId,
            sessionMode: 'freeform',
            selectedSuggestion: topic.summary,
          },
        });
        await assertOk(res);
        results.push((await res.json()) as FilingResult);
      }
      return results;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['subjects'] });
      void queryClient.invalidateQueries({ queryKey: ['books'] });
      void queryClient.invalidateQueries({ queryKey: ['book-suggestions'] });
      void queryClient.invalidateQueries({ queryKey: ['topic-suggestions'] });
    },
  });
}
