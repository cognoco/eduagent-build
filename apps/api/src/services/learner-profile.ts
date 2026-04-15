import { and, eq, sql } from 'drizzle-orm';
import { learningProfiles, subjects, type Database } from '@eduagent/database';
import {
  sessionAnalysisOutputSchema,
  type AccommodationMode,
  type ConfidenceLevel,
  type ExplanationStyle,
  type LearningProfile,
  type LearningStyle,
  type MemoryConsentStatus,
  type MemorySource,
  type SessionAnalysisOutput,
  type StrengthEntry,
  type StruggleEntry,
} from '@eduagent/schemas';
import { routeAndCall, type ChatMessage } from './llm';
import { createLogger } from './logger';

const logger = createLogger({ level: 'info', environment: 'production' });

const MAX_INTERESTS = 20;
const MAX_COMMUNICATION_NOTES = 10;
const STRUGGLE_ARCHIVAL_DAYS = 90;
const INTEREST_DEMOTION_DAYS = 60;
const MEMORY_BLOCK_TOKEN_BUDGET = 500;
const MEMORY_BLOCK_CHAR_BUDGET = MEMORY_BLOCK_TOKEN_BUDGET * 4;
const LEARNING_STYLE_CORROBORATION_THRESHOLD = 3;

const CONFIDENCE_ORDER: Record<ConfidenceLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

const SESSION_ANALYSIS_PROMPT = `You are analyzing a tutoring session transcript between an AI mentor and a young learner.

Extract the following signals from the conversation. Be conservative and only include signals with real evidence.

Return valid JSON only using this shape:
{
  "explanationEffectiveness": {
    "effective": ["stories" | "examples" | "diagrams" | "analogies" | "step-by-step" | "humor"],
    "ineffective": ["stories" | "examples" | "diagrams" | "analogies" | "step-by-step" | "humor"]
  } | null,
  "interests": ["string"] | null,
  "strengths": [{"topic": "string", "subject": "string | null"}] | null,
  "struggles": [{"topic": "string", "subject": "string | null"}] | null,
  "resolvedTopics": [{"topic": "string", "subject": "string | null"}] | null,
  "communicationNotes": ["string"] | null,
  "engagementLevel": "high" | "medium" | "low" | null,
  "confidence": "low" | "medium" | "high",
  "urgencyDeadline": {"reason": "string", "daysFromNow": 1-30} | null
}

Rules:
- "interests": only include explicit enthusiasm, repeated curiosity, or strong engagement.
- "strengths": only include clear mastery.
- "struggles": only include repeated confusion on the same concept.
- "resolvedTopics": include concepts that started shaky and ended with understanding.
- "communicationNotes": short notes like "prefers short explanations" or "responds well to examples".
- "urgencyDeadline": if the learner mentions an upcoming test, exam, quiz, or deadline, extract the reason and estimate how many days away it is (1-30). Return null if no deadline is mentioned.
- Return null for any field without signal.
- If the subject is freeform or unknown, use null for subject when needed.

Subject: {subject}
Topic: {topic}
Raw input: {rawInput}`;

type LearningProfileRow = typeof learningProfiles.$inferSelect;

type StrengthSignal = {
  topic: string;
  subject: string | null;
  source?: MemorySource;
};

type StruggleSignal = {
  topic: string;
  subject: string | null;
  source?: MemorySource;
};

export interface MemoryRetentionContext {
  status?: 'new' | 'strong' | 'fading' | 'weak' | 'forgotten';
  strongTopics?: string[];
}

export type StruggleNotificationType =
  | 'struggle_noticed'
  | 'struggle_flagged'
  | 'struggle_resolved';

export interface StruggleNotification {
  type: StruggleNotificationType;
  topic: string;
  subject: string | null;
}

export interface ApplyAnalysisResult {
  fieldsUpdated: string[];
  notifications: StruggleNotification[];
}

function nowIso(): string {
  return new Date().toISOString();
}

function normalizeMemoryValue(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function sameNormalized(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  return normalizeMemoryValue(left) === normalizeMemoryValue(right);
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

function asStrengthArray(value: unknown): StrengthEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StrengthEntry => Boolean(item));
}

function asStruggleArray(value: unknown): StruggleEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is StruggleEntry => Boolean(item));
}

function asLearningStyle(value: unknown): LearningStyle {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as LearningStyle;
}

function asInterestTimestampMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as Record<string, string>;
}

function confidenceFromAttempts(attempts: number): ConfidenceLevel {
  if (attempts >= 5) return 'high';
  if (attempts >= 3) return 'medium';
  return 'low';
}

function dedupeCaseInsensitive(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = normalizeMemoryValue(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value.trim());
  }
  return result;
}

function learningStyleSignalCount(style: LearningStyle): number {
  if (!style) return 0;
  let count = 0;
  if (style.preferredExplanations?.length)
    count += style.preferredExplanations.length;
  if (style.pacePreference) count += 1;
  if (style.responseToChallenge) count += 1;
  return count;
}

function totalProfileSignalCount(profile: MemoryBlockProfile): number {
  return (
    profile.interests.length +
    profile.strengths.length +
    profile.struggles.length +
    profile.communicationNotes.length +
    learningStyleSignalCount(profile.learningStyle)
  );
}

export function mergeInterests(
  existing: string[],
  incoming: string[],
  suppressed: string[],
  timestamps: Record<string, string> = {}
): { interests: string[]; timestamps: Record<string, string> } {
  const suppressedSet = new Set(suppressed.map(normalizeMemoryValue));
  const updatedTimestamps = { ...timestamps };
  const merged = [...existing];
  const now = nowIso();

  for (const interest of incoming) {
    const trimmed = interest.trim();
    const normalized = normalizeMemoryValue(trimmed);
    if (!normalized || suppressedSet.has(normalized)) continue;

    const existingIndex = merged.findIndex((value) =>
      sameNormalized(value, trimmed)
    );
    if (existingIndex >= 0) {
      updatedTimestamps[normalized] = now;
      continue;
    }

    merged.push(trimmed);
    updatedTimestamps[normalized] = now;
  }

  const cutoff = new Date(
    Date.now() - INTEREST_DEMOTION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  const fresh: string[] = [];
  const stale: string[] = [];

  for (const interest of merged) {
    const normalized = normalizeMemoryValue(interest);
    const timestamp = updatedTimestamps[normalized];
    if (timestamp && timestamp < cutoff) stale.push(interest);
    else fresh.push(interest);
  }

  const ordered = [...stale, ...fresh];
  while (ordered.length > MAX_INTERESTS) {
    const evicted = ordered.shift();
    if (evicted) {
      delete updatedTimestamps[normalizeMemoryValue(evicted)];
    }
  }

  return {
    interests: dedupeCaseInsensitive(ordered),
    timestamps: updatedTimestamps,
  };
}

export function mergeStrengths(
  existing: StrengthEntry[],
  incoming: StrengthSignal[],
  suppressed: string[]
): StrengthEntry[] {
  const suppressedSet = new Set(suppressed.map(normalizeMemoryValue));
  const result = [...existing];

  for (const signal of incoming) {
    if (!signal.subject) continue;
    if (suppressedSet.has(normalizeMemoryValue(signal.topic))) continue;

    const subjectIndex = result.findIndex((entry) =>
      sameNormalized(entry.subject, signal.subject)
    );

    if (subjectIndex >= 0) {
      const existingEntry = result[subjectIndex];
      if (!existingEntry)
        throw new Error(`result[${subjectIndex}] is unexpectedly undefined`);
      const hasTopic = existingEntry.topics.some((topic) =>
        sameNormalized(topic, signal.topic)
      );
      if (hasTopic) {
        if (
          signal.source &&
          !existingEntry.source &&
          signal.source !== 'inferred'
        ) {
          result[subjectIndex] = {
            ...existingEntry,
            source: signal.source,
          };
        }
        continue;
      }

      const nextTopics = [...existingEntry.topics, signal.topic.trim()];
      result[subjectIndex] = {
        ...existingEntry,
        topics: nextTopics,
        confidence: nextTopics.length >= 3 ? 'high' : existingEntry.confidence,
        source:
          signal.source && signal.source !== 'inferred'
            ? signal.source
            : existingEntry.source,
      };
      continue;
    }

    result.push({
      subject: signal.subject.trim(),
      topics: [signal.topic.trim()],
      confidence: 'medium',
      ...(signal.source ? { source: signal.source } : {}),
    });
  }

  return result;
}

export function archiveStaleStruggles(
  struggles: StruggleEntry[]
): StruggleEntry[] {
  const cutoff = new Date(
    Date.now() - STRUGGLE_ARCHIVAL_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();
  return struggles.filter((entry) => entry.lastSeen >= cutoff);
}

export function mergeStruggles(
  existing: StruggleEntry[],
  incoming: StruggleSignal[],
  suppressed: string[]
): StruggleEntry[] {
  const suppressedSet = new Set(suppressed.map(normalizeMemoryValue));
  const result = [...existing];

  for (const signal of incoming) {
    if (suppressedSet.has(normalizeMemoryValue(signal.topic))) continue;

    const existingIndex = result.findIndex(
      (entry) =>
        sameNormalized(entry.topic, signal.topic) &&
        sameNormalized(entry.subject, signal.subject)
    );

    if (existingIndex >= 0) {
      const existingEntry = result[existingIndex];
      if (!existingEntry)
        throw new Error(`result[${existingIndex}] is unexpectedly undefined`);
      const attempts = existingEntry.attempts + 1;
      result[existingIndex] = {
        ...existingEntry,
        attempts,
        lastSeen: nowIso(),
        confidence: confidenceFromAttempts(attempts),
        source:
          signal.source && signal.source !== 'inferred'
            ? signal.source
            : existingEntry.source,
      };
      continue;
    }

    result.push({
      subject: signal.subject?.trim() || null,
      topic: signal.topic.trim(),
      lastSeen: nowIso(),
      attempts: 1,
      confidence: 'low',
      ...(signal.source ? { source: signal.source } : {}),
    });
  }

  return result;
}

export function mergeCommunicationNotes(
  existing: string[],
  incoming: string[],
  suppressed: string[]
): string[] {
  const suppressedSet = new Set(suppressed.map(normalizeMemoryValue));
  const merged = [...existing];

  for (const note of incoming) {
    const trimmed = note.trim();
    const normalized = normalizeMemoryValue(trimmed);
    if (!normalized || suppressedSet.has(normalized)) continue;
    if (merged.some((value) => sameNormalized(value, trimmed))) continue;
    merged.push(trimmed);
  }

  while (merged.length > MAX_COMMUNICATION_NOTES) {
    merged.shift();
  }

  return merged;
}

export function resolveStruggle(
  struggles: StruggleEntry[],
  topic: string,
  subject?: string | null
): StruggleEntry[] {
  const result = [...struggles];
  const index = result.findIndex(
    (entry) =>
      sameNormalized(entry.topic, topic) &&
      sameNormalized(entry.subject, subject)
  );
  if (index < 0) return result;

  const existing = result[index];
  if (!existing) throw new Error(`result[${index}] is unexpectedly undefined`);
  const nextAttempts = existing.attempts - 1;
  if (nextAttempts <= 0) {
    result.splice(index, 1);
    return result;
  }

  result[index] = {
    ...existing,
    attempts: nextAttempts,
    confidence: confidenceFromAttempts(nextAttempts),
    lastSeen: nowIso(),
  };
  return result;
}

export function detectStruggleNotifications(
  beforeStruggles: StruggleEntry[],
  afterStruggles: StruggleEntry[],
  resolvedTopics: Array<{ topic: string; subject: string | null }> | null
): StruggleNotification[] {
  const notifications: StruggleNotification[] = [];

  for (const after of afterStruggles) {
    const before = beforeStruggles.find(
      (b) =>
        sameNormalized(b.topic, after.topic) &&
        sameNormalized(b.subject, after.subject)
    );

    if (
      after.confidence === 'medium' &&
      (!before || before.confidence === 'low')
    ) {
      notifications.push({
        type: 'struggle_noticed',
        topic: after.topic,
        subject: after.subject,
      });
    }

    if (after.confidence === 'high' && before?.confidence !== 'high') {
      notifications.push({
        type: 'struggle_flagged',
        topic: after.topic,
        subject: after.subject,
      });
    }
  }

  if (resolvedTopics) {
    for (const resolved of resolvedTopics) {
      const wasInBefore = beforeStruggles.some(
        (b) =>
          sameNormalized(b.topic, resolved.topic) &&
          sameNormalized(b.subject, resolved.subject)
      );
      if (wasInBefore) {
        notifications.push({
          type: 'struggle_resolved',
          topic: resolved.topic,
          subject: resolved.subject,
        });
      }
    }
  }

  return notifications;
}

export function shouldUpdateLearningStyle(
  existingConfidence: ConfidenceLevel | undefined,
  newConfidence: ConfidenceLevel,
  corroboratingSessions: number
): boolean {
  if (corroboratingSessions < LEARNING_STYLE_CORROBORATION_THRESHOLD) {
    return false;
  }
  if (!existingConfidence) return true;
  return CONFIDENCE_ORDER[newConfidence] > CONFIDENCE_ORDER[existingConfidence];
}

function mergeLearningStyle(
  existing: LearningStyle,
  analysis: SessionAnalysisOutput,
  effectivenessSessionCount: number,
  source: MemorySource
): { learningStyle: LearningStyle; effectivenessSessionCount: number } {
  if (!analysis.explanationEffectiveness) {
    return {
      learningStyle: existing,
      effectivenessSessionCount,
    };
  }

  const nextCount = effectivenessSessionCount + 1;
  const effective = analysis.explanationEffectiveness.effective.filter(
    (style) => !analysis.explanationEffectiveness?.ineffective.includes(style)
  );

  if (effective.length === 0) {
    return {
      learningStyle: existing,
      effectivenessSessionCount: nextCount,
    };
  }

  const existingConfidence = existing?.confidence;
  if (
    existing &&
    !shouldUpdateLearningStyle(
      existingConfidence,
      analysis.confidence,
      nextCount
    )
  ) {
    return {
      learningStyle: {
        ...existing,
        corroboratingSessions:
          Math.max(existing.corroboratingSessions ?? 0, nextCount) || nextCount,
      },
      effectivenessSessionCount: nextCount,
    };
  }

  const preferredExplanations = dedupeCaseInsensitive([
    ...(existing?.preferredExplanations ?? []),
    ...effective,
  ]) as ExplanationStyle[];

  return {
    learningStyle: {
      ...existing,
      preferredExplanations,
      confidence: analysis.confidence,
      corroboratingSessions: nextCount,
      source,
    },
    effectivenessSessionCount: nextCount,
  };
}

function buildAnalysisUpdates(
  profile: LearningProfileRow,
  analysis: SessionAnalysisOutput,
  source: MemorySource,
  subjectName: string | null
): {
  updates: Record<string, unknown>;
  fieldsUpdated: string[];
  notifications: StruggleNotification[];
} {
  const suppressed = asStringArray(profile.suppressedInferences);
  const updates: Record<string, unknown> = {};
  const fieldsUpdated: string[] = [];

  if (analysis.interests?.length) {
    const { interests, timestamps } = mergeInterests(
      asStringArray(profile.interests),
      analysis.interests,
      suppressed,
      asInterestTimestampMap(profile.interestTimestamps)
    );
    updates.interests = interests;
    updates.interestTimestamps = timestamps;
    fieldsUpdated.push('interests');
  }

  if (analysis.strengths?.length) {
    updates.strengths = mergeStrengths(
      asStrengthArray(profile.strengths),
      analysis.strengths.map((signal) => ({
        ...signal,
        subject: signal.subject ?? subjectName,
        source: signal.source ?? source,
      })),
      suppressed
    );
    fieldsUpdated.push('strengths');
  }

  const beforeStruggles = asStruggleArray(profile.struggles);
  let mergedStruggles = beforeStruggles;
  if (analysis.struggles?.length) {
    mergedStruggles = archiveStaleStruggles(
      mergeStruggles(
        mergedStruggles,
        analysis.struggles.map((signal) => ({
          ...signal,
          source: signal.source ?? source,
        })),
        suppressed
      )
    );
    updates.struggles = mergedStruggles;
    fieldsUpdated.push('struggles');
  }

  if (analysis.resolvedTopics?.length) {
    const base =
      (updates.struggles as StruggleEntry[] | undefined) ?? mergedStruggles;
    let resolved = base;
    for (const entry of analysis.resolvedTopics) {
      resolved = resolveStruggle(resolved, entry.topic, entry.subject);
    }
    updates.struggles = resolved;
    if (!fieldsUpdated.includes('struggles')) {
      fieldsUpdated.push('struggles');
    }
  }

  if (analysis.communicationNotes?.length) {
    updates.communicationNotes = mergeCommunicationNotes(
      asStringArray(profile.communicationNotes),
      analysis.communicationNotes,
      suppressed
    );
    fieldsUpdated.push('communicationNotes');
  }

  const learningStyleResult = mergeLearningStyle(
    asLearningStyle(profile.learningStyle),
    analysis,
    profile.effectivenessSessionCount ?? 0,
    source
  );

  if (
    learningStyleResult.effectivenessSessionCount !==
    (profile.effectivenessSessionCount ?? 0)
  ) {
    updates.effectivenessSessionCount =
      learningStyleResult.effectivenessSessionCount;
  }

  if (
    learningStyleResult.learningStyle &&
    JSON.stringify(learningStyleResult.learningStyle) !==
      JSON.stringify(asLearningStyle(profile.learningStyle))
  ) {
    updates.learningStyle = learningStyleResult.learningStyle;
    fieldsUpdated.push('learningStyle');
  }

  const afterStruggles =
    (updates.struggles as StruggleEntry[] | undefined) ?? mergedStruggles;
  const notifications = detectStruggleNotifications(
    beforeStruggles,
    afterStruggles,
    analysis.resolvedTopics ?? null
  );

  // Persist resolved topic names so the next session's buildMemoryBlock can
  // celebrate them.  Overwrites each analysis run — only the most recent
  // session's resolutions are surfaced.
  const resolvedTopicNames = notifications
    .filter((n) => n.type === 'struggle_resolved')
    .map((n) => n.topic);
  updates.recentlyResolvedTopics = resolvedTopicNames;

  return {
    updates,
    fieldsUpdated,
    notifications,
  };
}

function buildDeleteMemoryItemUpdates(
  profile: LearningProfileRow,
  category: string,
  value: string,
  suppress = false,
  subject?: string
): Record<string, unknown> | null {
  const updates: Record<string, unknown> = {};

  switch (category) {
    case 'interests': {
      const nextInterests = asStringArray(profile.interests).filter(
        (entry) => !sameNormalized(entry, value)
      );
      const timestamps = {
        ...asInterestTimestampMap(profile.interestTimestamps),
      };
      delete timestamps[normalizeMemoryValue(value)];
      updates.interests = nextInterests;
      updates.interestTimestamps = timestamps;
      break;
    }
    case 'strengths': {
      updates.strengths = asStrengthArray(profile.strengths).filter(
        (entry) => !sameNormalized(entry.subject, value)
      );
      break;
    }
    case 'struggles': {
      updates.struggles = asStruggleArray(profile.struggles).filter(
        (entry) =>
          !(
            sameNormalized(entry.topic, value) &&
            (subject === undefined || sameNormalized(entry.subject, subject))
          )
      );
      break;
    }
    case 'communicationNotes': {
      updates.communicationNotes = asStringArray(
        profile.communicationNotes
      ).filter((entry) => !sameNormalized(entry, value));
      break;
    }
    case 'learningStyle': {
      const style = asLearningStyle(profile.learningStyle);
      if (!style) return null;
      const nextStyle = { ...style } as Record<string, unknown>;
      delete nextStyle[value];
      updates.learningStyle =
        Object.keys(nextStyle).length > 0 ? nextStyle : null;
      break;
    }
    default:
      return null;
  }

  if (suppress) {
    const suppressed = asStringArray(profile.suppressedInferences);
    const normalizedValue = normalizeMemoryValue(value);
    if (!suppressed.some((entry) => sameNormalized(entry, normalizedValue))) {
      updates.suppressedInferences = [...suppressed, normalizedValue];
    }
  }

  return updates;
}

export interface MemoryBlockProfile {
  learningStyle: LearningStyle;
  interests: string[];
  strengths: StrengthEntry[];
  struggles: StruggleEntry[];
  communicationNotes: string[];
  memoryEnabled?: boolean;
  memoryInjectionEnabled?: boolean;
  effectivenessSessionCount?: number;
}

export function buildMemoryBlock(
  profile: MemoryBlockProfile | null,
  currentSubject: string | null,
  currentTopic: string | null,
  retentionContext?: MemoryRetentionContext | null,
  recentlyResolved?: string[]
): string {
  const injectionEnabled =
    profile?.memoryInjectionEnabled ?? profile?.memoryEnabled ?? true;
  if (!profile || !injectionEnabled) return '';

  const sections: string[] = [];
  const strongTopicSet = new Set(
    (retentionContext?.strongTopics ?? []).map(normalizeMemoryValue)
  );

  const relevantStruggles = profile.struggles.filter((entry) => {
    if (entry.confidence === 'low') return false;
    if (
      retentionContext?.status === 'strong' &&
      currentTopic &&
      sameNormalized(entry.topic, currentTopic)
    ) {
      return false;
    }
    if (strongTopicSet.has(normalizeMemoryValue(entry.topic))) return false;
    return (
      !currentSubject ||
      !entry.subject ||
      sameNormalized(entry.subject, currentSubject)
    );
  });

  if (relevantStruggles.length > 0) {
    const struggleTopics = relevantStruggles
      .slice(0, 4)
      .map((entry) => entry.topic)
      .join(', ');
    sections.push(
      `- They've been working hard on: ${struggleTopics}. Be patient and try a different angle before escalating.`
    );
  }

  if (recentlyResolved && recentlyResolved.length > 0) {
    const resolvedList = recentlyResolved.join(', ');
    sections.push(
      `- They recently overcame difficulties with: ${resolvedList}. Celebrate their growth!`
    );
  }

  if (profile.learningStyle) {
    const styleParts: string[] = [];
    if (profile.learningStyle.preferredExplanations?.length) {
      styleParts.push(
        `${profile.learningStyle.preferredExplanations.join(
          ' and '
        )}-based explanations`
      );
    }
    if (profile.learningStyle.pacePreference) {
      styleParts.push(
        profile.learningStyle.pacePreference === 'thorough'
          ? 'a step-by-step pace'
          : 'a quicker pace'
      );
    }
    if (profile.learningStyle.responseToChallenge) {
      styleParts.push(
        profile.learningStyle.responseToChallenge === 'motivated'
          ? 'challenge as motivation'
          : 'extra encouragement when work gets difficult'
      );
    }
    if (styleParts.length > 0) {
      sections.push(`- They learn best with ${styleParts.join(', ')}.`);
    }
  }

  const topInterests = profile.interests.slice(-5).reverse();
  if (topInterests.length > 0) {
    sections.push(`- They're interested in: ${topInterests.join(', ')}.`);
  }

  const recentNotes = profile.communicationNotes.slice(-2);
  if (recentNotes.length > 0) {
    sections.push(`- ${recentNotes.join('. ')}.`);
  }

  const signalCount = totalProfileSignalCount(profile);
  if (!profile.learningStyle && signalCount > 0) {
    sections.push(
      '- Their preferred explanation style is still emerging. Vary your approach and notice what seems to click.'
    );
  }

  const effectivenessCount = profile.effectivenessSessionCount ?? 0;
  if (effectivenessCount < 5 && signalCount > 0) {
    sections.push(
      "- If it fits naturally, ask one gentle check-in question such as 'Did that help?' or 'Want another kind of example?' — no more than once per session."
    );
  }

  if (sections.length === 0) return '';

  const metaInstruction =
    'Use the learner memory naturally. Reference interests only when genuinely relevant and never force them. ' +
    'Use their preferred explanation style where it helps. Do not announce that you are reading from a profile. ' +
    'Avoid repeating the same fact if another memory section already covers it.';

  let block = `About this learner:\n${sections.join(
    '\n'
  )}\n\n${metaInstruction}`;
  const originalSectionCount = sections.length;
  while (block.length > MEMORY_BLOCK_CHAR_BUDGET && sections.length > 0) {
    sections.pop();
    block = `About this learner:\n${sections.join('\n')}\n\n${metaInstruction}`;
  }
  if (sections.length < originalSectionCount) {
    logger.warn('[learner-profile] Memory block truncated to fit budget', {
      event: 'learner_profile.memory_block.truncated',
      droppedSections: originalSectionCount - sections.length,
      charBudget: MEMORY_BLOCK_CHAR_BUDGET,
    });
  }

  return block;
}

export async function getLearningProfile(
  db: Database,
  profileId: string
): Promise<LearningProfileRow | undefined> {
  return db.query.learningProfiles.findFirst({
    where: eq(learningProfiles.profileId, profileId),
  });
}

export async function getOrCreateLearningProfile(
  db: Database,
  profileId: string
): Promise<LearningProfileRow> {
  const existing = await getLearningProfile(db, profileId);
  if (existing) return existing;

  const [created] = await db
    .insert(learningProfiles)
    .values({ profileId })
    .onConflictDoNothing({ target: learningProfiles.profileId })
    .returning();

  if (created) return created;

  const retry = await getLearningProfile(db, profileId);
  if (!retry) {
    throw new Error(`Unable to create learning profile for ${profileId}`);
  }
  return retry;
}

async function updateWithRetry(
  db: Database,
  profileId: string,
  expectedVersion: number,
  updates: Record<string, unknown>
): Promise<boolean> {
  const [updated] = await db
    .update(learningProfiles)
    .set({
      ...updates,
      version: sql`${learningProfiles.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(learningProfiles.profileId, profileId),
        eq(learningProfiles.version, expectedVersion)
      )
    )
    .returning();

  return Boolean(updated);
}

export async function applyAnalysis(
  db: Database,
  profileId: string,
  analysis: SessionAnalysisOutput,
  subjectName: string | null,
  source: MemorySource = 'inferred'
): Promise<ApplyAnalysisResult> {
  if (analysis.confidence === 'low') {
    console.info('[learner-profile] Low-confidence analysis skipped', {
      event: 'learner_profile.analysis.low_confidence',
      profileId,
    });
    return { fieldsUpdated: [], notifications: [] };
  }

  const profile = await getOrCreateLearningProfile(db, profileId);
  const { updates, fieldsUpdated, notifications } = buildAnalysisUpdates(
    profile,
    analysis,
    source,
    subjectName
  );

  if (Object.keys(updates).length === 0) {
    return { fieldsUpdated: [], notifications: [] };
  }

  const updated = await updateWithRetry(
    db,
    profileId,
    profile.version,
    updates
  );
  if (!updated) {
    const fresh = await getLearningProfile(db, profileId);
    if (!fresh) return { fieldsUpdated: [], notifications: [] };

    const retry = buildAnalysisUpdates(fresh, analysis, source, subjectName);
    await updateWithRetry(db, profileId, fresh.version, retry.updates);
  }

  if (notifications.length > 0) {
    console.info('[learner-profile] Struggle notifications emitted', {
      event: 'learner_profile.struggle.notifications',
      profileId,
      notifications: notifications.map((n) => ({
        type: n.type,
        topic: n.topic,
      })),
    });
  }

  // Epic 7 FR165.3: Write urgency boost when test/deadline detected
  if (analysis.urgencyDeadline && subjectName) {
    try {
      const boostUntil = new Date(
        Date.now() + analysis.urgencyDeadline.daysFromNow * 24 * 60 * 60 * 1000
      );
      await db
        .update(subjects)
        .set({
          urgencyBoostUntil: boostUntil,
          urgencyBoostReason: analysis.urgencyDeadline.reason,
          updatedAt: new Date(),
        })
        .where(
          and(eq(subjects.profileId, profileId), eq(subjects.name, subjectName))
        );
      fieldsUpdated.push('urgencyBoostUntil');
    } catch (err) {
      // Urgency boost is best-effort — log and continue
      logger.warn('Failed to write urgency boost', {
        event: 'learner_profile.urgency_boost.failed',
        profileId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.info('[learner-profile] Analysis applied', {
    event: 'learner_profile.analysis.completed',
    profileId,
    fieldsUpdated,
  });

  return { fieldsUpdated, notifications };
}

export async function deleteMemoryItem(
  db: Database,
  profileId: string,
  category: string,
  value: string,
  suppress = false,
  subject?: string
): Promise<void> {
  const profile = await getLearningProfile(db, profileId);
  if (!profile) return;

  const updates = buildDeleteMemoryItemUpdates(
    profile,
    category,
    value,
    suppress,
    subject
  );
  if (!updates) return;

  const updated = await updateWithRetry(
    db,
    profileId,
    profile.version,
    updates
  );
  if (updated) return;

  const fresh = await getLearningProfile(db, profileId);
  if (!fresh) return;

  const retryUpdates = buildDeleteMemoryItemUpdates(
    fresh,
    category,
    value,
    suppress,
    subject
  );
  if (!retryUpdates) return;

  await updateWithRetry(db, profileId, fresh.version, retryUpdates);
}

function buildUnsuppressUpdates(
  profile: LearningProfileRow,
  value: string
): Record<string, unknown> {
  return {
    suppressedInferences: asStringArray(profile.suppressedInferences).filter(
      (entry) => !sameNormalized(entry, value)
    ),
  };
}

export async function unsuppressInference(
  db: Database,
  profileId: string,
  value: string
): Promise<void> {
  const profile = await getLearningProfile(db, profileId);
  if (!profile) return;

  const updated = await updateWithRetry(
    db,
    profileId,
    profile.version,
    buildUnsuppressUpdates(profile, value)
  );
  if (updated) return;

  const fresh = await getLearningProfile(db, profileId);
  if (!fresh) return;
  await updateWithRetry(
    db,
    profileId,
    fresh.version,
    buildUnsuppressUpdates(fresh, value)
  );
}

export async function toggleMemoryEnabled(
  db: Database,
  profileId: string,
  enabled: boolean
): Promise<void> {
  const profile = await getOrCreateLearningProfile(db, profileId);
  const canCollect = enabled
    ? profile.memoryConsentStatus === 'granted'
    : false;

  await db
    .update(learningProfiles)
    .set({
      memoryEnabled: enabled,
      memoryCollectionEnabled: canCollect,
      memoryInjectionEnabled: enabled,
      version: sql`${learningProfiles.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(learningProfiles.profileId, profileId));
}

export async function toggleMemoryCollection(
  db: Database,
  profileId: string,
  enabled: boolean
): Promise<void> {
  const profile = await getOrCreateLearningProfile(db, profileId);
  const memoryConsentStatus: MemoryConsentStatus = enabled
    ? 'granted'
    : profile.memoryConsentStatus;

  await db
    .update(learningProfiles)
    .set({
      memoryCollectionEnabled: enabled,
      memoryEnabled: enabled || profile.memoryInjectionEnabled,
      memoryConsentStatus,
      consentPromptDismissedAt: new Date(),
      version: sql`${learningProfiles.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(learningProfiles.profileId, profileId));
}

export async function toggleMemoryInjection(
  db: Database,
  profileId: string,
  enabled: boolean
): Promise<void> {
  const profile = await getOrCreateLearningProfile(db, profileId);

  await db
    .update(learningProfiles)
    .set({
      memoryInjectionEnabled: enabled,
      memoryEnabled: enabled || profile.memoryCollectionEnabled,
      version: sql`${learningProfiles.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(learningProfiles.profileId, profileId));
}

export async function grantMemoryConsent(
  db: Database,
  profileId: string,
  consent: 'granted' | 'declined'
): Promise<void> {
  await getOrCreateLearningProfile(db, profileId);
  const granted = consent === 'granted';

  await db
    .update(learningProfiles)
    .set({
      memoryConsentStatus: consent,
      memoryCollectionEnabled: granted,
      memoryInjectionEnabled: granted,
      memoryEnabled: granted,
      consentPromptDismissedAt: new Date(),
      version: sql`${learningProfiles.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(learningProfiles.profileId, profileId));
}

/**
 * GDPR right-to-erasure: hard-delete the learner's memory row entirely.
 * The row (along with all JSONB fields, consent state, and timestamps) is
 * removed from the database. Subsequent access will create a fresh default
 * row via `getOrCreateLearningProfile`, which starts with consent status
 * 'pending' so collection and injection are both disabled until re-granted.
 */
export async function deleteAllMemory(
  db: Database,
  profileId: string
): Promise<void> {
  await db
    .delete(learningProfiles)
    .where(eq(learningProfiles.profileId, profileId));
}

const MAX_TRANSCRIPT_EVENTS = 100;

export async function analyzeSessionTranscript(
  transcript: Array<{ eventType: string; content: string }>,
  subjectName: string | null,
  topicTitle: string | null,
  rawInput?: string | null
): Promise<SessionAnalysisOutput | null> {
  const conversationEvents = transcript
    .filter(
      (entry) =>
        entry.eventType === 'user_message' || entry.eventType === 'ai_response'
    )
    .slice(-MAX_TRANSCRIPT_EVENTS);

  if (conversationEvents.length < 3) {
    return null;
  }

  const transcriptText = conversationEvents
    .map(
      (entry) =>
        `${entry.eventType === 'user_message' ? 'Learner' : 'Mentor'}: ${
          entry.content
        }`
    )
    .join('\n\n');

  const systemPrompt = SESSION_ANALYSIS_PROMPT.replace(
    '{subject}',
    subjectName ?? 'Freeform'
  )
    .replace('{topic}', topicTitle ?? 'General')
    .replace('{rawInput}', rawInput ?? '(none)');

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: transcriptText },
  ];

  const result = await routeAndCall(messages, 1, {});
  if (!result.response) return null;

  try {
    const jsonMatch = result.response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]) as unknown;
    const validated = sessionAnalysisOutputSchema.safeParse(parsed);
    if (!validated.success) return null;
    return validated.data;
  } catch (err) {
    logger.warn('Failed to parse session analysis', {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

export function buildHumanReadableMemoryExport(
  profile: LearningProfile | LearningProfileRow | null | undefined
): string {
  if (!profile) {
    return 'No learner memory has been stored yet.';
  }

  const interests = asStringArray(profile.interests);
  const strengths = asStrengthArray(profile.strengths);
  const struggles = asStruggleArray(profile.struggles);
  const notes = asStringArray(profile.communicationNotes);
  const style = asLearningStyle(profile.learningStyle);
  const hidden = asStringArray(profile.suppressedInferences);

  const sections: string[] = ['Learner Memory Export'];

  const accommodationMode =
    'accommodationMode' in profile
      ? (profile as Record<string, unknown>).accommodationMode
      : undefined;
  if (accommodationMode && accommodationMode !== 'none') {
    const modeLabels: Record<string, string> = {
      'short-burst':
        'Short-Burst — shorter explanations, frequent check-ins, small steps',
      'audio-first':
        'Audio-First — spoken-style explanations, simple sentences, phonetic support',
      predictable:
        'Predictable — clear structure, explicit transitions, concrete examples',
    };
    sections.push(
      `Accommodation mode\n${
        modeLabels[accommodationMode as string] ?? accommodationMode
      }`
    );
  }

  if (style) {
    const styleParts: string[] = [];
    if (style.preferredExplanations?.length) {
      styleParts.push(
        `Preferred explanations: ${style.preferredExplanations.join(', ')}`
      );
    }
    if (style.pacePreference) {
      styleParts.push(`Pace: ${style.pacePreference}`);
    }
    if (style.responseToChallenge) {
      styleParts.push(`Response to challenge: ${style.responseToChallenge}`);
    }
    if (styleParts.length > 0) {
      sections.push(`Learning style\n${styleParts.join('\n')}`);
    }
  }

  if (interests.length > 0) {
    sections.push(
      `Interests\n${interests.map((value) => `- ${value}`).join('\n')}`
    );
  }

  if (strengths.length > 0) {
    sections.push(
      `Strengths\n${strengths
        .map(
          (entry) =>
            `- ${entry.subject}: ${entry.topics.join(', ')} (${
              entry.confidence
            })`
        )
        .join('\n')}`
    );
  }

  if (struggles.length > 0) {
    sections.push(
      `Struggles\n${struggles
        .map((entry) => {
          const subject = entry.subject ? `${entry.subject}: ` : '';
          return `- ${subject}${entry.topic} (${entry.confidence}, attempts ${entry.attempts})`;
        })
        .join('\n')}`
    );
  }

  if (notes.length > 0) {
    sections.push(
      `Communication notes\n${notes.map((value) => `- ${value}`).join('\n')}`
    );
  }

  if (hidden.length > 0) {
    sections.push(
      `Hidden items\n${hidden.map((value) => `- ${value}`).join('\n')}`
    );
  }

  return sections.join('\n\n');
}

// ---------------------------------------------------------------------------
// Accommodation mode
// ---------------------------------------------------------------------------

const ACCOMMODATION_PREAMBLES: Record<string, string> = {
  'short-burst': [
    'Learning accommodation (Short-Burst):',
    '- Keep explanations concise — 2-3 sentences max before checking understanding',
    '- Break complex topics into small, concrete steps — one concept per exchange',
    '- Use frequent engagement checkpoints: "Ready for the next part?" or "Want to try one?"',
    '- Celebrate small wins explicitly — "Nice one!" after each correct step, not just at the end',
    '- Avoid long blocks of text. If a concept needs depth, split it across multiple exchanges',
    '- Vary activity types to maintain engagement (explain → try → explain → game → try)',
  ].join('\n'),
  'audio-first': [
    'Learning accommodation (Audio-First):',
    '- Prefer spoken-style explanations — write as if reading aloud, with natural rhythm',
    '- Avoid relying on visual-only content (tables, diagrams described only in text, complex formatting)',
    '- When teaching vocabulary or new terms, always include phonetic breakdowns or syllable splits',
    '- Use repetition and rhyme as memory aids where natural',
    '- Keep sentence structure simple — active voice, short clauses, minimal nesting',
    '- When the learner makes a spelling or reading error, gently model the correct form without highlighting the mistake',
  ].join('\n'),
  predictable: [
    'Learning accommodation (Predictable):',
    '- Start every session with a clear agenda: "Today we\'ll do X, then Y, then Z"',
    '- Use explicit transitions between topics: "We\'re done with fractions. Now let\'s move to geometry."',
    '- Avoid open-ended questions without scaffolding — offer choices or examples alongside "What do you think?"',
    '- Be literal and concrete — avoid sarcasm, idioms, or figurative language unless teaching them explicitly',
    '- Maintain a consistent session structure: recap → new concept → practice → summary',
    '- When something changes (topic shift, difficulty increase), explain why: "This next part is harder because…"',
  ].join('\n'),
};

const ACCOMMODATION_META =
  'The above learning accommodation is a parental preference. Follow it consistently. Do not override it based on inferred learner behavior.';

export function buildAccommodationBlock(
  mode: AccommodationMode | string | null | undefined
): string {
  if (!mode || mode === 'none') return '';
  const preamble = ACCOMMODATION_PREAMBLES[mode];
  if (!preamble) return '';
  return `${preamble}\n\n${ACCOMMODATION_META}`;
}

export async function updateAccommodationMode(
  db: Database,
  profileId: string,
  mode: AccommodationMode
): Promise<void> {
  // FR253.4: create row if it doesn't exist
  await getOrCreateLearningProfile(db, profileId);

  await db
    .update(learningProfiles)
    .set({
      accommodationMode: mode,
      version: sql`${learningProfiles.version} + 1`,
      updatedAt: new Date(),
    })
    .where(eq(learningProfiles.profileId, profileId));
}
