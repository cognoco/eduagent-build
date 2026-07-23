import { and, eq } from 'drizzle-orm';
import {
  bookmarks,
  createScopedRepository,
  evidenceLinks,
  learningSessions,
  sessionEvents,
  topicNotes,
  type Database,
} from '@eduagent/database';
import type { EvidenceLinkResolution, EvidenceLink } from '@eduagent/schemas';
import * as learningTextGuard from './persisted-learning-text-guard';

/** Record transcript-safe provenance for an artifact without copying text. */
export async function recordArtifactEvidenceLinks(
  db: Database,
  params: { profileId: string; artifactId: string; sourceEventIds: string[] },
): Promise<void> {
  const sourceEventIds = [...new Set(params.sourceEventIds)];
  if (sourceEventIds.length === 0) return;

  await db
    .insert(evidenceLinks)
    .values(
      sourceEventIds.map((toId) => ({
        profileId: params.profileId,
        fromKind: 'artifact' as const,
        fromId: params.artifactId,
        toKind: 'transcript_excerpt' as const,
        toId,
      })),
    )
    .onConflictDoNothing();
}

type VerifiedChallengeArtifactInput = {
  content: string;
  artifactSource: 'challenge_solid_quote' | 'challenge_drafted_note';
  sourceEventIds: string[];
};

/** Persist a server-owned Challenge artifact set and opaque provenance atomically. */
export async function persistVerifiedChallengeArtifacts(
  db: Database,
  params: {
    profileId: string;
    topicId: string;
    sessionId: string;
    artifacts: VerifiedChallengeArtifactInput[];
  },
): Promise<void> {
  if (params.artifacts.length === 0) return;
  for (const artifact of params.artifacts) {
    learningTextGuard.assertNoClinicalInferenceInLearningRecord(
      artifact.content,
    );
    if (new Set(artifact.sourceEventIds).size === 0) {
      throw new Error('Verified Challenge artifact requires provenance');
    }
  }

  await db.transaction(async (tx) => {
    for (const input of params.artifacts) {
      const [artifact] = await tx
        .insert(topicNotes)
        .values({
          profileId: params.profileId,
          topicId: params.topicId,
          sessionId: params.sessionId,
          content: input.content,
          artifactSource: input.artifactSource,
          verificationState: 'verified',
        })
        .returning({ id: topicNotes.id });
      if (!artifact) {
        throw new Error('Challenge artifact insert did not return a row');
      }
      await recordArtifactEvidenceLinks(tx as unknown as Database, {
        profileId: params.profileId,
        artifactId: artifact.id,
        sourceEventIds: input.sourceEventIds,
      });
    }
  });
}

/** Persist one server-owned Challenge artifact and opaque provenance atomically. */
export async function persistVerifiedChallengeArtifact(
  db: Database,
  params: {
    profileId: string;
    topicId: string;
    sessionId: string;
  } & VerifiedChallengeArtifactInput,
): Promise<void> {
  await persistVerifiedChallengeArtifacts(db, {
    profileId: params.profileId,
    topicId: params.topicId,
    sessionId: params.sessionId,
    artifacts: [
      {
        content: params.content,
        artifactSource: params.artifactSource,
        sourceEventIds: params.sourceEventIds,
      },
    ],
  });
}

/** Metadata-only aggregate; it never selects a transcript body. */
export async function getArtifactEvidenceAvailability(
  db: Database,
  profileId: string,
  artifactId: string,
): Promise<'available' | 'source_unavailable'> {
  const repo = createScopedRepository(db, profileId);
  const links = await repo.evidenceLinks.findMany(
    and(
      eq(evidenceLinks.fromKind, 'artifact'),
      eq(evidenceLinks.fromId, artifactId),
    ),
  );
  if (links.length === 0) return 'source_unavailable';
  const states = await Promise.all(
    links.map((link) =>
      resolveEvidenceLink(db, {
        ...link,
        fromKind: link.fromKind as EvidenceLink['fromKind'],
        toKind: link.toKind as EvidenceLink['toKind'],
        createdAt: new Date(link.createdAt).toISOString(),
      }),
    ),
  );
  return states.every((state) => state.availability === 'available')
    ? 'available'
    : 'source_unavailable';
}

/**
 * Resolve only whether the cited learner source still exists for this profile.
 * Intentionally returns no source content, so a dangling evidence link becomes
 * an honest unavailable-source state rather than a privacy fallback.
 */
export async function resolveEvidenceLink(
  db: Database,
  link: EvidenceLink,
): Promise<EvidenceLinkResolution> {
  const repo = createScopedRepository(db, link.profileId);
  const target =
    link.toKind === 'note'
      ? await repo.topicNotes.findId(eq(topicNotes.id, link.toId))
      : link.toKind === 'bookmark'
        ? await repo.bookmarks.findId(eq(bookmarks.id, link.toId))
        : link.toKind === 'homework_ocr'
          ? await repo.sessions.findId(eq(learningSessions.id, link.toId))
          : await repo.sessionEvents.findId(eq(sessionEvents.id, link.toId));

  return {
    evidenceLinkId: link.id,
    toKind: link.toKind,
    availability: target ? 'available' : 'source_unavailable',
  };
}
