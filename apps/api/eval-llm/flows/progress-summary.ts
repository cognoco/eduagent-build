import { z } from 'zod';
import type { KnowledgeInventory } from '@eduagent/schemas';

import type { EvalProfile } from '../fixtures/profiles';
import type { FlowDefinition, PromptMessages } from '../runner/types';
import { callLlm } from '../runner/llm-bootstrap';
import { buildProgressSummaryPrompt } from '../../src/services/progress-summary';

interface ProgressSummaryInput {
  childName: string;
  inventory: KnowledgeInventory;
  latestSessionAt: Date;
}

const unsafeLanguage = /\b(lazy|failed|behind|worrying|alarming|bad)\b/i;

function makeInventory(profile: EvalProfile): KnowledgeInventory {
  const firstSubject = profile.strengths[0]?.subject ?? 'Math';
  const secondSubject = profile.struggles[0]?.subject ?? 'Science';
  return {
    profileId: '33333333-3333-7333-8333-333333333333',
    snapshotDate: '2026-05-13',
    currentlyWorkingOn: profile.libraryTopics.slice(0, 3),
    thisWeekMini: {
      sessions: 3,
      wordsLearned: profile.targetLanguage ? 12 : 0,
      topicsTouched: 4,
    },
    global: {
      topicsAttempted: 8,
      topicsMastered: 4,
      vocabularyTotal: profile.targetLanguage ? 42 : 0,
      vocabularyMastered: profile.targetLanguage ? 18 : 0,
      weeklyDeltaTopicsMastered: 2,
      weeklyDeltaVocabularyTotal: profile.targetLanguage ? 12 : null,
      weeklyDeltaTopicsExplored: 3,
      totalSessions: 6,
      totalActiveMinutes: 140,
      totalWallClockMinutes: 165,
      currentStreak: 3,
      longestStreak: 5,
    },
    subjects: [
      {
        subjectId: '11111111-1111-7111-8111-111111111111',
        subjectName: firstSubject,
        pedagogyMode: profile.targetLanguage ? 'four_strands' : 'socratic',
        topics: {
          total: 7,
          explored: 5,
          mastered: 3,
          inProgress: 2,
          notStarted: 2,
        },
        vocabulary: {
          total: profile.targetLanguage ? 42 : 0,
          mastered: profile.targetLanguage ? 18 : 0,
          learning: profile.targetLanguage ? 16 : 0,
          new: profile.targetLanguage ? 8 : 0,
          byCefrLevel: {},
        },
        estimatedProficiency: null,
        estimatedProficiencyLabel: null,
        lastSessionAt: '2026-05-13T09:00:00Z',
        activeMinutes: 95,
        wallClockMinutes: 110,
        sessionsCount: 4,
      },
      {
        subjectId: '22222222-2222-7222-8222-222222222222',
        subjectName: secondSubject,
        pedagogyMode: 'socratic',
        topics: {
          total: 4,
          explored: 3,
          mastered: 1,
          inProgress: 2,
          notStarted: 1,
        },
        vocabulary: {
          total: 0,
          mastered: 0,
          learning: 0,
          new: 0,
          byCefrLevel: {},
        },
        estimatedProficiency: null,
        estimatedProficiencyLabel: null,
        lastSessionAt: '2026-05-12T09:00:00Z',
        activeMinutes: 45,
        wallClockMinutes: 55,
        sessionsCount: 2,
      },
    ],
  };
}

function cloneInventory(input: KnowledgeInventory): KnowledgeInventory {
  return JSON.parse(JSON.stringify(input)) as KnowledgeInventory;
}

export const progressSummaryFlow: FlowDefinition<ProgressSummaryInput> = {
  id: 'progress-summary',
  name: 'Progress Summary (parent current-state header)',
  sourceFile:
    'apps/api/src/services/progress-summary.ts:buildProgressSummaryPrompt',

  buildPromptInput(profile: EvalProfile): ProgressSummaryInput {
    return {
      childName: 'Emma',
      inventory: makeInventory(profile),
      latestSessionAt: new Date('2026-05-13T09:00:00Z'),
    };
  },

  enumerateScenarios(profile: EvalProfile) {
    const active = makeInventory(profile);
    const inactive = cloneInventory(active);
    inactive.subjects = inactive.subjects.map((subject) => ({
      ...subject,
      lastSessionAt: '2026-05-08T09:00:00Z',
    }));
    const newer = cloneInventory(active);
    newer.global = {
      ...newer.global,
      totalSessions: 1,
      totalActiveMinutes: 18,
      totalWallClockMinutes: 22,
      topicsAttempted: 1,
      topicsMastered: 0,
    };
    newer.subjects = newer.subjects.slice(0, 1).map((subject) => ({
      ...subject,
      topics: { ...subject.topics, mastered: 0, explored: 1 },
      activeMinutes: 18,
      wallClockMinutes: 22,
      sessionsCount: 1,
    }));
    const empty = cloneInventory(active);
    empty.subjects = [];
    empty.currentlyWorkingOn = [];

    return [
      {
        scenarioId: 'active-child',
        input: {
          childName: 'Emma',
          inventory: active,
          latestSessionAt: new Date('2026-05-13T09:00:00Z'),
        },
      },
      {
        scenarioId: 'inactive-child',
        input: {
          childName: 'Emma',
          inventory: inactive,
          latestSessionAt: new Date('2026-05-08T09:00:00Z'),
        },
      },
      {
        scenarioId: 'new-child',
        input: {
          childName: 'Emma',
          inventory: newer,
          latestSessionAt: new Date('2026-05-13T09:00:00Z'),
        },
      },
      {
        scenarioId: 'empty-inventory',
        input: {
          childName: 'Emma',
          inventory: empty,
          latestSessionAt: new Date('2026-05-13T09:00:00Z'),
        },
      },
    ];
  },

  buildPrompt(input: ProgressSummaryInput): PromptMessages {
    return buildProgressSummaryPrompt(input);
  },

  expectedResponseSchema: {
    safeParse(value: unknown) {
      const parsed = z.string().max(500).safeParse(value);
      if (!parsed.success) return parsed;
      if (!parsed.data.includes('Emma')) {
        return { success: false, error: 'summary must include child name' };
      }
      if (unsafeLanguage.test(parsed.data)) {
        return { success: false, error: 'summary uses alarming language' };
      }
      return { success: true };
    },
  },

  async runLive(
    _input: ProgressSummaryInput,
    messages: PromptMessages,
  ): Promise<string> {
    return callLlm(
      [
        { role: 'system', content: messages.system },
        { role: 'user', content: messages.user ?? '' },
      ],
      { flow: 'progress-summary', rung: 2 },
    );
  },
};
