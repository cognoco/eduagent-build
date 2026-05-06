import type { CurriculumBook, BookProgressStatus } from '@eduagent/schemas';

export interface EnrichedBook {
  book: CurriculumBook;
  subjectId: string;
  subjectName: string;
  topicCount: number;
  completedCount: number;
  status: BookProgressStatus;
}
