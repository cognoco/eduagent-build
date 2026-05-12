import { llmSummarySchema } from '@eduagent/schemas';
import { getProfile } from '../fixtures/profiles';
import { sessionSummaryFlow } from './session-summary';
import { buildSummaryEmbeddingText } from '../../src/services/transcript-purge';

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
}

function jaccard(left: string[], right: string[]): number {
  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((token) => rightSet.has(token));
  const union = new Set([...leftSet, ...rightSet]);
  return union.size === 0 ? 0 : intersection.length / union.size;
}

function presentAnchorPhrases(text: string, anchors: string[]): string[] {
  const normalized = normalizeText(text);
  return anchors.filter((anchor) =>
    normalized.includes(normalizeText(anchor).trim()),
  );
}

describe('session summary embedding overlap regression', () => {
  it('keeps top-token overlap at or above the launch threshold across fixture summaries', () => {
    const profileIds = [
      '11yo-czech-animals',
      '12yo-dinosaurs',
      '13yo-spanish-beginner',
    ] as const;

    const scores = profileIds.map((profileId) => {
      const profile = getProfile(profileId);
      if (!profile) {
        throw new Error(`Missing profile fixture: ${profileId}`);
      }

      const input = sessionSummaryFlow.buildPromptInput(profile);
      if (input === null) {
        throw new Error(
          `buildPromptInput returned null for profile: ${profileId}`,
        );
      }
      const topic = input.topicTitle ?? 'the topic';
      const struggle = profile.struggles[0]?.topic ?? topic;
      const summary = llmSummarySchema.parse({
        narrative: `Worked through ${topic} and ${struggle} while checking each step out loud together.`,
        topicsCovered: [topic, struggle],
        sessionState: 'completed',
        reEntryRecommendation: `Resume with one more ${topic} example and ask the learner to explain ${struggle} in their own words.`,
      });

      const embeddingText = buildSummaryEmbeddingText(
        summary,
        `You linked ${topic} back to ${struggle} and explained the pattern clearly.`,
      );
      const anchors = summary.topicsCovered.slice(0, 3);
      const transcriptTokens = presentAnchorPhrases(
        input.transcriptText,
        anchors,
      );
      const embeddingTokens = presentAnchorPhrases(embeddingText, anchors);

      return jaccard(transcriptTokens, embeddingTokens);
    });

    const average =
      scores.reduce((sum, score) => sum + score, 0) / scores.length;

    expect(average).toBeGreaterThanOrEqual(0.6);
  });
});
