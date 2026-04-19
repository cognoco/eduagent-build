import { sm2 } from '@eduagent/retention';
import type { LibraryItem } from './content-resolver';

export interface MasteryRowData {
  itemKey: string;
  itemAnswer: string;
}

export interface MasterySm2Input {
  easeFactor: string;
  interval: number;
  repetitions: number;
  lastReviewedAt: Date;
  nextReviewAt: Date;
}

export interface MasterySm2Result {
  easeFactor: string;
  interval: number;
  repetitions: number;
  nextReviewAt: Date;
}

export function buildCapitalsMasteryLibraryItem(
  row: MasteryRowData
): LibraryItem {
  return {
    id: row.itemKey,
    question: row.itemKey,
    answer: row.itemAnswer,
  };
}

export function buildGuessWhoMasteryLibraryItem(
  row: MasteryRowData
): LibraryItem {
  return {
    id: row.itemKey,
    question: row.itemKey,
    answer: row.itemAnswer,
  };
}

export function applyQuizSm2(
  current: MasterySm2Input,
  quality: number
): MasterySm2Result {
  const result = sm2({
    quality,
    card: {
      easeFactor: Number(current.easeFactor),
      interval: Math.max(1, current.interval),
      repetitions: current.repetitions,
      lastReviewedAt: current.lastReviewedAt.toISOString(),
      nextReviewAt: current.nextReviewAt.toISOString(),
    },
  });

  return {
    easeFactor: String(result.card.easeFactor),
    interval: result.card.interval,
    repetitions: result.card.repetitions,
    nextReviewAt: new Date(result.card.nextReviewAt),
  };
}
