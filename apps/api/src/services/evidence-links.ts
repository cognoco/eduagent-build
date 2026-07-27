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
import {
  sessionMetadataSchema,
  type EvidenceLinkResolution,
  type EvidenceLink,
} from '@eduagent/schemas';
import {
  assertLearningTextSafe,
  evaluateLearningTextFields,
} from './learning-text-safety/gate';

type EvidenceLinkWriter = Pick<Database, 'insert'>;

/** Record transcript-safe provenance for an artifact without copying text. */
export async function recordArtifactEvidenceLinks(
  db: EvidenceLinkWriter,
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

type VerifiedChallengeArtifactInput =
  | {
      artifactSource: 'challenge_solid_quote';
      conceptKey: string;
      sourceEventIds: string[];
    }
  | {
      artifactSource: 'challenge_drafted_note';
      content: string;
      sourceEventIds: string[];
    };

function storedArtifactContent(input: VerifiedChallengeArtifactInput): string {
  return input.artifactSource === 'challenge_solid_quote'
    ? input.conceptKey
    : input.content;
}

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

  // [WI-2628] Evaluated as ONE batch, before `db.transaction` opens below — the
  // gate can make an LLM round-trip, and holding a pooled connection across it
  // would be a connection-exhaustion hazard. Batching also means N artifacts
  // cost at most one judge call per distinct (fieldKind, text).
  //
  // KEEPS THROWING, deliberately, and this is a documented deviation from AC-5's
  // "derived writes drop unsafe data". These are server-owned Challenge
  // artifacts, so by provenance they are a derived write and AC-5 would have them
  // dropped. But the throw is load-bearing CONTROL FLOW here, not an accident:
  // it aborts the whole artifact set, and the caller
  // (`session-exchange.ts` -> `safeWrite`) swallows it into Sentry. Converting to
  // a per-artifact drop would silently change all-or-nothing into partial
  // persistence for a verified-evidence set. Fail-closed either way; changing a
  // caller's atomicity contract is not this change-set's business. Flagged for
  // the operator rather than done quietly.
  const gate = await evaluateLearningTextFields({
    // No profile read on this path — the gate scans all ten attribution
    // grammars and keeps the strictest verdict. Never `'en'`.
    conversationLanguage: undefined,
    provenance: 'llm',
    // Not reachable here; AC-4 makes a missing producer fail closed to
    // block/unclear rather than referring to the judge.
    producerVendor: null,
    fields: params.artifacts.map((artifact, index) => ({
      key: `artifact-${index}`,
      fieldKind: 'evidence_link_context' as const,
      text: storedArtifactContent(artifact),
    })),
  });

  for (const [index, artifact] of params.artifacts.entries()) {
    assertLearningTextSafe(gate, `artifact-${index}`);
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
          content: storedArtifactContent(input),
          artifactSource: input.artifactSource,
          artifactConceptKey:
            input.artifactSource === 'challenge_solid_quote'
              ? input.conceptKey
              : null,
          verificationState: 'verified',
        })
        .returning({ id: topicNotes.id });
      if (!artifact) {
        throw new Error('Challenge artifact insert did not return a row');
      }
      await recordArtifactEvidenceLinks(tx, {
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
      params.artifactSource === 'challenge_solid_quote'
        ? {
            artifactSource: params.artifactSource,
            conceptKey: params.conceptKey,
            sourceEventIds: params.sourceEventIds,
          }
        : {
            artifactSource: params.artifactSource,
            content: params.content,
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
  if (links.length === 0) {
    // Migration 0154 marks historical Challenge-drafted notes verified but
    // cannot reconstruct their grounding events. Keep those legacy artifacts
    // fail-closed: proof consumers suppress the quote instead of inventing
    // provenance or falling back to raw transcript content.
    return 'source_unavailable';
  }
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
  let target: { id: string } | undefined;
  switch (link.toKind) {
    case 'note':
      target = await repo.topicNotes.findId(eq(topicNotes.id, link.toId));
      break;
    case 'bookmark':
      target = await repo.bookmarks.findId(eq(bookmarks.id, link.toId));
      break;
    case 'homework_ocr':
      target = await resolveHomeworkOcrTarget(repo, link.toId);
      break;
    case 'transcript_excerpt':
      target = await repo.sessionEvents.findId(eq(sessionEvents.id, link.toId));
      break;
    default:
      return assertUnreachableEvidenceLinkToKind(link.toKind);
  }

  return {
    evidenceLinkId: link.id,
    toKind: link.toKind,
    availability: target ? 'available' : 'source_unavailable',
  };
}

function assertUnreachableEvidenceLinkToKind(value: never): never {
  throw new Error(`Unhandled evidence-link target kind: ${value}`);
}

async function resolveHomeworkOcrTarget(
  repo: ReturnType<typeof createScopedRepository>,
  sessionId: string,
): Promise<{ id: string } | undefined> {
  const target = await repo.sessions.findIdAndMetadata(
    eq(learningSessions.id, sessionId),
  );
  if (!target) return undefined;

  const metadata = sessionMetadataSchema.safeParse(target.metadata ?? {});
  const ocrText = metadata.success
    ? metadata.data.homework?.ocrText
    : undefined;
  return typeof ocrText === 'string' && ocrText.trim().length > 0
    ? { id: target.id }
    : undefined;
}
