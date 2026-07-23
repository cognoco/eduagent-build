import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import {
  curricula,
  curriculumTopics,
  learningSessions,
  sessionEvents,
  sessionSummaries,
  subjects,
  vocabulary,
  type Database,
} from '@eduagent/database';
import {
  assertBookTopicWriteAvailable,
  ensureDefaultBook,
} from './curriculum-core';
import {
  languageNextPracticePointerSchema,
  parseLanguageLearningSummary,
  type CefrLevel,
  type GeneratedTopic,
  type LanguageProgress,
  type LanguageMilestoneProgress,
} from '@eduagent/schemas';
import { getLanguageByCode } from '../data/languages';
import { getLanguageStrandCounts } from './language-session-engine';

const CEFR_LEVELS: CefrLevel[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const RECENT_LANGUAGE_SESSION_LIMIT = 20;

const MILESTONE_LIBRARY: Record<
  CefrLevel,
  Array<{ title: string; description: string }>
> = {
  A1: [
    {
      title: 'Greetings & Introductions',
      description: 'Meet people, say hello, and share simple personal details.',
    },
    {
      title: 'Numbers, Dates & Time',
      description: 'Handle counting, days, dates, and everyday scheduling.',
    },
    {
      title: 'Food & Ordering',
      description:
        'Order simple meals, drinks, and cafe basics with confidence.',
    },
    {
      title: 'Home & Family',
      description: 'Talk about family members, rooms, and daily home life.',
    },
    {
      title: 'Directions & Transport',
      description:
        'Ask for directions and move around town using key travel phrases.',
    },
    {
      title: 'Daily Routine',
      description: 'Describe common habits, routines, and simple preferences.',
    },
  ],
  A2: [
    {
      title: 'Shopping & Services',
      description:
        'Buy things, ask questions, and handle common service interactions.',
    },
    {
      title: 'Travel & Booking',
      description: 'Manage hotels, tickets, and travel-day conversations.',
    },
    {
      title: 'Health & Appointments',
      description:
        'Describe symptoms, ask for help, and handle basic appointments.',
    },
    {
      title: 'Past Experiences',
      description: 'Talk about recent events and simple stories from the past.',
    },
    {
      title: 'Plans & Invitations',
      description:
        'Make plans, accept invitations, and discuss future intentions.',
    },
    {
      title: 'Work & Study Life',
      description:
        'Describe classes, jobs, routines, and everyday responsibilities.',
    },
  ],
  B1: [
    {
      title: 'Opinions & Preferences',
      description:
        'Share opinions, comparisons, and personal reactions in more detail.',
    },
    {
      title: 'Narrating Stories',
      description:
        'Tell fuller stories with sequencing, detail, and clear structure.',
    },
    {
      title: 'Problem Solving',
      description:
        'Handle misunderstandings, requests, and practical challenges.',
    },
    {
      title: 'Media & Culture',
      description: 'Discuss films, books, music, and cultural experiences.',
    },
    {
      title: 'Goals & Motivation',
      description: 'Explain ambitions, reasons, and ongoing efforts.',
    },
    {
      title: 'Collaboration & Projects',
      description:
        'Plan tasks, divide work, and communicate in group settings.',
    },
    {
      title: 'Travel Challenges',
      description:
        'Navigate unexpected problems while traveling or living abroad.',
    },
    {
      title: 'Personal Reflection',
      description:
        'Describe changes, feelings, and lessons learned with nuance.',
    },
  ],
  B2: [
    {
      title: 'Debate & Argumentation',
      description:
        'Defend a viewpoint, weigh tradeoffs, and respond to objections.',
    },
    {
      title: 'Nuance & Tone',
      description:
        'Adjust register, tone, and emphasis for different situations.',
    },
    {
      title: 'Professional Meetings',
      description:
        'Contribute ideas, summarize positions, and clarify decisions.',
    },
    {
      title: 'Academic Discussion',
      description:
        'Explain concepts clearly and react to more complex viewpoints.',
    },
    {
      title: 'Hypothetical Scenarios',
      description:
        'Discuss possibilities, conditions, and imagined outcomes naturally.',
    },
    {
      title: 'News & Analysis',
      description:
        'Understand and discuss current events with detail and precision.',
    },
    {
      title: 'Social Issues',
      description:
        'Handle abstract discussion about society, culture, and values.',
    },
    {
      title: 'Detailed Storytelling',
      description:
        'Tell richer stories with pacing, contrast, and interpretation.',
    },
  ],
  C1: [
    {
      title: 'Advanced Interpretation',
      description:
        'Interpret subtle meaning, implication, and stance in extended language.',
    },
    {
      title: 'Specialist Discussion',
      description:
        'Discuss complex topics with precise vocabulary and flexible grammar.',
    },
    {
      title: 'Persuasion & Rhetoric',
      description:
        'Shape tone and rhetoric intentionally for persuasive effect.',
    },
    {
      title: 'Complex Narratives',
      description:
        'Build layered narratives with clarity, nuance, and stylistic control.',
    },
    {
      title: 'Cross-Cultural Register',
      description:
        'Adapt naturally across formal, informal, and culturally sensitive contexts.',
    },
    {
      title: 'Critical Analysis',
      description:
        'Analyze arguments, evidence, and assumptions with confidence.',
    },
    {
      title: 'Professional Precision',
      description:
        'Operate accurately in demanding workplace or academic settings.',
    },
    {
      title: 'Extended Fluency',
      description: 'Maintain fluid, sustained communication under pressure.',
    },
  ],
  C2: [
    {
      title: 'Near-Native Precision',
      description:
        'Operate with highly precise language and near-native flexibility.',
    },
    {
      title: 'Stylistic Control',
      description:
        'Shift style intentionally for subtle persuasive or social effect.',
    },
    {
      title: 'Dense Information Handling',
      description:
        'Process and produce complex information with ease and clarity.',
    },
    {
      title: 'High-Stakes Communication',
      description:
        'Perform in demanding social, academic, and professional situations.',
    },
    {
      title: 'Idiom & Cultural Texture',
      description: 'Handle idiom, humor, and culture-rich language naturally.',
    },
    {
      title: 'Elegant Reformulation',
      description: 'Rephrase and adapt ideas smoothly without loss of meaning.',
    },
    {
      title: 'Interpretive Mastery',
      description:
        'Catch subtle implications, ambiguity, and layered intention.',
    },
    {
      title: 'Sustained Expert Fluency',
      description:
        'Maintain expert-level fluency across unfamiliar and abstract contexts.',
    },
  ],
};

function nextLevel(level: CefrLevel): CefrLevel | null {
  const index = CEFR_LEVELS.indexOf(level);
  if (index === -1 || index === CEFR_LEVELS.length - 1) {
    return null;
  }
  return CEFR_LEVELS[index + 1] ?? null;
}

function buildTargetCounts(
  level: CefrLevel,
  index: number,
): {
  targetWordCount: number;
  targetChunkCount: number;
} {
  const wordBase: Record<CefrLevel, number> = {
    A1: 45,
    A2: 60,
    B1: 75,
    B2: 95,
    C1: 120,
    C2: 140,
  };
  const chunkBase: Record<CefrLevel, number> = {
    A1: 10,
    A2: 12,
    B1: 15,
    B2: 18,
    C1: 22,
    C2: 26,
  };

  return {
    targetWordCount: wordBase[level] + index * 3,
    targetChunkCount: chunkBase[level] + index,
  };
}

function buildMilestonesForLevel(
  level: CefrLevel,
  requestedCount: number,
  languageName: string,
): GeneratedTopic[] {
  const library = MILESTONE_LIBRARY[level];
  const total = Math.min(requestedCount, library.length);

  return library.slice(0, total).map((entry, index) => {
    const targets = buildTargetCounts(level, index);
    return {
      title: entry.title,
      description: `${entry.description} Focused ${languageName} practice for ${level}.`,
      relevance: 'core',
      estimatedMinutes: 30,
      cefrLevel: level,
      cefrSublevel: String(index + 1),
      targetWordCount: targets.targetWordCount,
      targetChunkCount: targets.targetChunkCount,
    };
  });
}

export function generateLanguageCurriculum(
  languageCode: string,
  startingLevel: CefrLevel = 'A1',
): GeneratedTopic[] {
  const language = getLanguageByCode(languageCode);
  if (!language) {
    throw new Error(`Unsupported language code: ${languageCode}`);
  }

  // [BUG-940] Topic descriptions interpolate the language name directly into
  // sentence-case prose ("Focused italian practice for A1."). The canonical
  // names live lowercase in language.names — title-case at the boundary so
  // the rendered description reads naturally without leaking the source-data
  // casing convention. Mirrors the book-label normalization at the bottom of
  // regenerateLanguageCurriculum (BUG-611).
  const languageDisplayName = (language.names[0] ?? languageCode).replace(
    /^./,
    (c) => c.toUpperCase(),
  );

  const currentLevelMilestones = buildMilestonesForLevel(
    startingLevel,
    language.cefrMilestones[startingLevel],
    languageDisplayName,
  );

  const upcomingLevel = nextLevel(startingLevel);
  if (!upcomingLevel) {
    return currentLevelMilestones;
  }

  const nextLevelMilestones = buildMilestonesForLevel(
    upcomingLevel,
    Math.max(2, Math.min(4, language.cefrMilestones[upcomingLevel])),
    languageDisplayName,
  );

  return [...currentLevelMilestones, ...nextLevelMilestones];
}

export async function regenerateLanguageCurriculum(
  db: Database,
  profileId: string,
  subjectId: string,
  languageCode: string,
  startingLevel: CefrLevel = 'A1',
  options?: {
    /**
     * Set true when `db` is ALREADY a transaction handle (a `PgTransaction`
     * cast as `Database`). The ownership-check → delete → insert → add-topics
     * swap then runs directly on that handle instead of opening its own
     * `db.transaction()`. neon-serverless throws on (or silently degrades)
     * nested transactions, so a caller that needs this work to commit
     * atomically with its OWN writes — e.g. configureLanguageSubject pairing
     * it with setNativeLanguage — passes its tx here. Same pattern as
     * mergeHomeSurfaceCacheData / writeHomeSurfacePendingCelebrations.
     */
    inTransaction?: boolean;
  },
): Promise<void> {
  // Curriculum generation is a pure synchronous build (no LLM/network), so
  // compute it before opening the transaction — nothing here can fail mid-swap.
  const topics = generateLanguageCurriculum(languageCode, startingLevel);
  // Resolve to a human-readable name for the book title — BUG-611:
  // previously passed `languageCode` (e.g. "es") which became the book title.
  const language = getLanguageByCode(languageCode);
  const languageLabel = language
    ? (language.names[0] ?? languageCode).replace(/^./, (c) => c.toUpperCase())
    : languageCode;

  // The ownership-check → delete → insert → add-topics swap. Runs on whatever
  // handle the caller holds: a fresh transaction we open here, or a
  // transaction the caller already opened (when `inTransaction` is set).
  const runSwap = async (tx: Database): Promise<void> => {
    // [BUG-655 / L3.M3.1] Verify (subjectId, profileId) ownership BEFORE the
    // delete. Without this, a leaked subjectId from another account could
    // cascade-delete the victim's curriculum, topics, vocabulary and progress.
    const ownedSubject = await tx.query.subjects.findFirst({
      where: and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)),
      columns: { id: true },
    });
    if (!ownedSubject) {
      throw new Error(
        `[BUG-655] regenerateLanguageCurriculum: subject ${subjectId} does not belong to profile ${profileId}`,
      );
    }

    // Lock the destination book before touching curricula. Expansion
    // persistence uses the same book → curriculum order; reversing it here
    // would reintroduce a deadlock window on regeneration.
    const bookId = await ensureDefaultBook(tx, subjectId, languageLabel);
    await assertBookTopicWriteAvailable(tx, profileId, subjectId, bookId);

    // Delete old curricula — topics, progress, etc. cascade-delete via FKs.
    // This prevents unique-constraint violations when the same bookId is reused.
    await tx.delete(curricula).where(eq(curricula.subjectId, subjectId));

    const [curriculum] = await tx
      .insert(curricula)
      .values({
        subjectId,
        version: 1,
      })
      .returning();

    if (topics.length === 0) {
      return;
    }

    if (!curriculum)
      throw new Error('Insert into curricula did not return a row');
    await tx.insert(curriculumTopics).values(
      topics.map((topic, index) => ({
        curriculumId: curriculum.id,
        bookId,
        title: topic.title,
        description: topic.description,
        sortOrder: index,
        relevance: topic.relevance,
        estimatedMinutes: topic.estimatedMinutes,
        cefrLevel: topic.cefrLevel ?? null,
        cefrSublevel: topic.cefrSublevel ?? null,
        targetWordCount: topic.targetWordCount ?? null,
        targetChunkCount: topic.targetChunkCount ?? null,
      })),
    );
  };

  // Caller already holds a transaction (e.g. configureLanguageSubject pairing
  // this swap with setNativeLanguage): run on the passed-in handle so we do not
  // open a nested transaction on neon-serverless.
  if (options?.inTransaction) {
    await runSwap(db);
    return;
  }

  // Transact the swap so a crash mid-sequence cannot leave the learner with a
  // deleted-but-unreplaced curriculum, and two concurrent same-user
  // regenerations cannot interleave into duplicate curricula rows or orphaned
  // topics. Mirrors the transactional swap in
  // curriculum.ts:regenerateCurriculumWithFeedback. The ownership check is
  // inside the transaction so the check → delete window is atomic.
  await db.transaction(async (tx) => {
    await runSwap(tx as unknown as Database);
  });
}

function calculateMilestoneProgress(
  wordsMastered: number,
  wordsTarget: number,
  chunksMastered: number,
  chunksTarget: number,
): number {
  const wordRatio = wordsTarget > 0 ? wordsMastered / wordsTarget : 1;
  const chunkRatio = chunksTarget > 0 ? chunksMastered / chunksTarget : 1;
  return Math.max(0, Math.min(1, (wordRatio + chunkRatio) / 2));
}

type SkillProfile = NonNullable<LanguageProgress['skillProfile']>;

interface RecentLanguageEvidence {
  sessionsSampled: number;
  strandBalance: LanguageProgress['strandBalance'];
  summarySkills: Array<
    Omit<SkillProfile[number], 'skill'> & {
      skill: Exclude<SkillProfile[number]['skill'], 'vocabulary' | 'reading'>;
    }
  >;
}

async function getRecentLanguageEvidence(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<RecentLanguageEvidence> {
  const recentSessions = await db
    .select({ sessionId: learningSessions.id })
    .from(learningSessions)
    .innerJoin(subjects, eq(learningSessions.subjectId, subjects.id))
    .where(
      and(
        eq(learningSessions.profileId, profileId),
        eq(learningSessions.subjectId, subjectId),
        eq(subjects.profileId, profileId),
        inArray(learningSessions.status, ['completed', 'auto_closed']),
      ),
    )
    .orderBy(desc(learningSessions.createdAt))
    .limit(RECENT_LANGUAGE_SESSION_LIMIT);

  const sessionIds = recentSessions.map((row) => row.sessionId);
  if (sessionIds.length === 0) {
    return { sessionsSampled: 0, strandBalance: null, summarySkills: [] };
  }

  const [summaryRows, eventRows] = await Promise.all([
    db
      .select({
        sessionId: sessionSummaries.sessionId,
        languageLearningSummary: sessionSummaries.languageLearningSummary,
      })
      .from(sessionSummaries)
      .innerJoin(
        learningSessions,
        eq(sessionSummaries.sessionId, learningSessions.id),
      )
      .innerJoin(subjects, eq(learningSessions.subjectId, subjects.id))
      .where(
        and(
          inArray(sessionSummaries.sessionId, sessionIds),
          eq(sessionSummaries.profileId, profileId),
          eq(learningSessions.profileId, profileId),
          eq(learningSessions.subjectId, subjectId),
          eq(subjects.profileId, profileId),
        ),
      ),
    db
      .select({
        sessionId: sessionEvents.sessionId,
        eventType: sessionEvents.eventType,
        metadata: sessionEvents.metadata,
      })
      .from(sessionEvents)
      .innerJoin(
        learningSessions,
        eq(sessionEvents.sessionId, learningSessions.id),
      )
      .innerJoin(subjects, eq(learningSessions.subjectId, subjects.id))
      .where(
        and(
          inArray(sessionEvents.sessionId, sessionIds),
          eq(sessionEvents.profileId, profileId),
          eq(sessionEvents.subjectId, subjectId),
          eq(sessionEvents.eventType, 'ai_response'),
          eq(learningSessions.profileId, profileId),
          eq(learningSessions.subjectId, subjectId),
          eq(subjects.profileId, profileId),
        ),
      ),
  ]);

  const counts = getLanguageStrandCounts(eventRows);
  const strandEvidenceCount = Object.values(counts).reduce(
    (total, count) => total + count,
    0,
  );

  const grammarPatterns = new Set<string>();
  let comprehensionCorrect = 0;
  let comprehensionTotal = 0;
  let speakingAttempts = 0;
  let fluencyCorrect = 0;
  let fluencyTotal = 0;
  const seenSummarySessions = new Set<string>();

  for (const row of summaryRows) {
    if (seenSummarySessions.has(row.sessionId)) continue;
    seenSummarySessions.add(row.sessionId);
    const summary = parseLanguageLearningSummary(row.languageLearningSummary);
    if (!summary) continue;
    for (const pattern of summary.grammarPatterns) {
      grammarPatterns.add(pattern);
    }
    if (summary.comprehension) {
      comprehensionCorrect += summary.comprehension.correct;
      comprehensionTotal += summary.comprehension.total;
    }
    speakingAttempts += summary.speakingAttempts;
    if (summary.fluency) {
      fluencyCorrect += summary.fluency.correct;
      fluencyTotal += summary.fluency.total;
    }
  }

  const summarySkills: RecentLanguageEvidence['summarySkills'] = [];
  if (grammarPatterns.size > 0) {
    summarySkills.push({
      skill: 'grammar',
      progress: null,
      evidenceCount: grammarPatterns.size,
    });
  }
  if (comprehensionTotal > 0) {
    summarySkills.push({
      skill: 'listening',
      progress: comprehensionCorrect / comprehensionTotal,
      evidenceCount: comprehensionTotal,
    });
  }
  if (speakingAttempts > 0) {
    summarySkills.push({
      skill: 'speaking',
      progress: null,
      evidenceCount: speakingAttempts,
    });
  }
  if (fluencyTotal > 0) {
    summarySkills.push({
      skill: 'fluency',
      progress: fluencyCorrect / fluencyTotal,
      evidenceCount: fluencyTotal,
    });
  }

  return {
    sessionsSampled: recentSessions.length,
    strandBalance:
      strandEvidenceCount > 0
        ? { counts, sessionsSampled: recentSessions.length }
        : null,
    summarySkills,
  };
}

function buildSkillProfile(
  evidence: RecentLanguageEvidence,
  currentMilestone: LanguageMilestoneProgress | null,
): LanguageProgress['skillProfile'] {
  if (evidence.sessionsSampled === 0) return null;
  const skills: SkillProfile = [];
  if (currentMilestone && currentMilestone.wordsMastered > 0) {
    skills.push({
      skill: 'vocabulary',
      progress:
        currentMilestone.wordsTarget > 0
          ? Math.min(
              1,
              currentMilestone.wordsMastered / currentMilestone.wordsTarget,
            )
          : null,
      evidenceCount: currentMilestone.wordsMastered,
    });
  }
  skills.push(...evidence.summarySkills);
  return skills.length > 0 ? skills : null;
}

export async function getCurrentLanguageProgress(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<LanguageProgress | null> {
  const subject = await db.query.subjects.findFirst({
    where: and(eq(subjects.id, subjectId), eq(subjects.profileId, profileId)),
  });
  if (
    !subject ||
    subject.pedagogyMode !== 'four_strands' ||
    !subject.languageCode
  ) {
    return null;
  }

  // WI-1552: raw jsonb — validate through the schema before trusting the
  // shape, per the repo's jsonb-read convention.
  const nextPractice = languageNextPracticePointerSchema
    .nullable()
    .catch(null)
    .parse(subject.nextLanguagePracticePointer ?? null);
  const recentEvidence = await getRecentLanguageEvidence(
    db,
    profileId,
    subjectId,
  );

  const curriculum = await db.query.curricula.findFirst({
    where: eq(curricula.subjectId, subjectId),
    orderBy: desc(curricula.version),
  });
  if (!curriculum) {
    return {
      subjectId,
      languageCode: subject.languageCode,
      pedagogyMode: 'four_strands',
      currentLevel: null,
      currentSublevel: null,
      currentMilestone: null,
      nextMilestone: null,
      nextPractice,
      strandBalance: recentEvidence.strandBalance,
      skillProfile: buildSkillProfile(recentEvidence, null),
    };
  }

  const milestones = await db.query.curriculumTopics.findMany({
    where: and(
      eq(curriculumTopics.curriculumId, curriculum.id),
      eq(curriculumTopics.skipped, false),
    ),
    orderBy: asc(curriculumTopics.sortOrder),
  });

  const vocabularyRows = await db
    .select({
      milestoneId: vocabulary.milestoneId,
      type: vocabulary.type,
      mastered: vocabulary.mastered,
    })
    .from(vocabulary)
    .where(
      and(
        eq(vocabulary.profileId, profileId),
        eq(vocabulary.subjectId, subjectId),
      ),
    );

  const countsByMilestone = new Map<
    string,
    { wordsMastered: number; chunksMastered: number }
  >();
  for (const row of vocabularyRows) {
    if (!row.milestoneId || !row.mastered) continue;
    const current = countsByMilestone.get(row.milestoneId) ?? {
      wordsMastered: 0,
      chunksMastered: 0,
    };
    if (row.type === 'chunk') {
      current.chunksMastered += 1;
    } else {
      current.wordsMastered += 1;
    }
    countsByMilestone.set(row.milestoneId, current);
  }

  const progressRows: LanguageMilestoneProgress[] = milestones
    .filter(
      (
        milestone,
      ): milestone is typeof milestone & {
        cefrLevel: CefrLevel;
        cefrSublevel: string;
      } => Boolean(milestone.cefrLevel && milestone.cefrSublevel),
    )
    .map((milestone) => {
      const counts = countsByMilestone.get(milestone.id) ?? {
        wordsMastered: 0,
        chunksMastered: 0,
      };
      const wordsTarget = milestone.targetWordCount ?? 0;
      const chunksTarget = milestone.targetChunkCount ?? 0;
      return {
        milestoneId: milestone.id,
        milestoneTitle: milestone.title,
        currentLevel: milestone.cefrLevel as CefrLevel,
        currentSublevel: milestone.cefrSublevel,
        wordsMastered: counts.wordsMastered,
        wordsTarget,
        chunksMastered: counts.chunksMastered,
        chunksTarget,
        milestoneProgress: calculateMilestoneProgress(
          counts.wordsMastered,
          wordsTarget,
          counts.chunksMastered,
          chunksTarget,
        ),
      };
    });

  if (progressRows.length === 0) {
    return {
      subjectId,
      languageCode: subject.languageCode,
      pedagogyMode: 'four_strands',
      currentLevel: null,
      currentSublevel: null,
      currentMilestone: null,
      nextMilestone: null,
      nextPractice,
      strandBalance: recentEvidence.strandBalance,
      skillProfile: buildSkillProfile(recentEvidence, null),
    };
  }

  const currentIndex = progressRows.findIndex(
    (milestone) =>
      milestone.wordsMastered < milestone.wordsTarget ||
      milestone.chunksMastered < milestone.chunksTarget,
  );
  const resolvedIndex =
    currentIndex === -1 ? progressRows.length - 1 : currentIndex;
  const currentMilestone = progressRows[resolvedIndex] ?? null;
  const nextMilestoneRow =
    resolvedIndex >= 0 && resolvedIndex < progressRows.length - 1
      ? progressRows[resolvedIndex + 1]
      : null;

  return {
    subjectId,
    languageCode: subject.languageCode,
    pedagogyMode: 'four_strands',
    currentLevel: currentMilestone?.currentLevel ?? null,
    currentSublevel: currentMilestone?.currentSublevel ?? null,
    currentMilestone,
    nextMilestone: nextMilestoneRow
      ? {
          milestoneId: nextMilestoneRow.milestoneId,
          milestoneTitle: nextMilestoneRow.milestoneTitle,
          level: nextMilestoneRow.currentLevel,
          sublevel: nextMilestoneRow.currentSublevel,
        }
      : null,
    nextPractice,
    strandBalance: recentEvidence.strandBalance,
    skillProfile: buildSkillProfile(recentEvidence, currentMilestone),
  };
}

export async function getCurrentLanguageMilestoneId(
  db: Database,
  profileId: string,
  subjectId: string,
): Promise<string | null> {
  const progress = await getCurrentLanguageProgress(db, profileId, subjectId);
  return progress?.currentMilestone?.milestoneId ?? null;
}
