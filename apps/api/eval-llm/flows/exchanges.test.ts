import { exchangesFlow } from './exchanges';
import { PROFILES, getProfile } from '../fixtures/profiles';
import { buildMemoryBlock } from '../../src/services/learner-profile';

describe('exchangesFlow', () => {
  const generalProfile = getProfile('12yo-dinosaurs');
  const languageProfile = getProfile('13yo-spanish-beginner');

  if (!generalProfile || !languageProfile) {
    throw new Error('fixture profiles missing');
  }

  describe('enumerateScenarios', () => {
    it('returns 7 scenario inputs for a general (non-language) profile', () => {
      const scenarios =
        exchangesFlow.enumerateScenarios?.(generalProfile) ?? [];
      expect(scenarios).toHaveLength(7);
      expect(scenarios.map((s) => s.scenarioId)).not.toContain(
        'S7-language-fluency'
      );
      expect(scenarios.map((s) => s.scenarioId)).toEqual(
        expect.arrayContaining([
          'S1-rung1-teach-new',
          'S2-rung2-revisit',
          'S3-rung3-evaluate',
          'S4-rung4-teach-back',
          'S5-rung5-exit',
          'S6-homework-help',
          'S8-casual-freeform',
        ])
      );
    });

    it('returns 8 scenarios for a language-learning profile (includes S7)', () => {
      const scenarios =
        exchangesFlow.enumerateScenarios?.(languageProfile) ?? [];
      expect(scenarios).toHaveLength(8);
      expect(scenarios.map((s) => s.scenarioId)).toContain(
        'S7-language-fluency'
      );
    });

    it('every scenario input has matching scenarioId and context', () => {
      const scenarios =
        exchangesFlow.enumerateScenarios?.(generalProfile) ?? [];
      for (const s of scenarios) {
        expect(s.scenarioId).toBe(s.input.scenarioId);
        expect(s.input.context).toBeDefined();
      }
    });
  });

  describe('context synthesis', () => {
    it('retentionStatus override is applied per scenario', () => {
      const scenarios =
        exchangesFlow.enumerateScenarios?.(generalProfile) ?? [];
      const s2 = scenarios.find((s) => s.scenarioId === 'S2-rung2-revisit');
      expect(s2?.input.context.retentionStatus).toEqual({
        status: 'fading',
        easeFactor: 2.3,
        daysSinceLastReview: 14,
      });

      const s5 = scenarios.find((s) => s.scenarioId === 'S5-rung5-exit');
      expect(s5?.input.context.retentionStatus?.status).toBe('weak');
    });

    it('exchangeCount matches scenario spec', () => {
      const scenarios =
        exchangesFlow.enumerateScenarios?.(generalProfile) ?? [];
      const byId = Object.fromEntries(
        scenarios.map((s) => [s.scenarioId, s.input.context.exchangeCount])
      );
      expect(byId['S1-rung1-teach-new']).toBe(0);
      expect(byId['S2-rung2-revisit']).toBe(2);
      expect(byId['S4-rung4-teach-back']).toBe(4);
      expect(byId['S5-rung5-exit']).toBe(5);
    });

    it('casual freeform scenario clears the topicTitle', () => {
      const scenarios =
        exchangesFlow.enumerateScenarios?.(generalProfile) ?? [];
      const s8 = scenarios.find((s) => s.scenarioId === 'S8-casual-freeform');
      expect(s8?.input.context.topicTitle).toBeUndefined();
      expect(s8?.input.context.sessionType).toBe('learning');
      expect(s8?.input.context.learningMode).toBe('casual');
    });

    it('exchangeHistory substitutes profile-specific tokens', () => {
      const scenarios =
        exchangesFlow.enumerateScenarios?.(generalProfile) ?? [];
      const s5 = scenarios.find((s) => s.scenarioId === 'S5-rung5-exit');
      const userMsg = s5?.input.context.exchangeHistory.find(
        (t) => t.role === 'user'
      );
      expect(userMsg?.content).toContain('long division');
      const joined = s5?.input.context.exchangeHistory
        .map((t) => t.content)
        .join(' ');
      expect(joined).not.toMatch(/\{\{.*?\}\}/);
    });

    it('learnerMemoryContext is built by the real buildMemoryBlock', () => {
      const scenarios =
        exchangesFlow.enumerateScenarios?.(generalProfile) ?? [];
      const s1 = scenarios.find((s) => s.scenarioId === 'S1-rung1-teach-new');
      const memoryContext = s1?.input.context.learnerMemoryContext;
      expect(memoryContext).toBeTruthy();
      expect(memoryContext && memoryContext.length).toBeGreaterThan(0);
      expect(memoryContext).toContain('dinosaur classification');
    });

    it('buildMemoryBlock result matches when called with the same synthesis inputs', () => {
      const now = new Date().toISOString();
      const block = buildMemoryBlock(
        {
          learningStyle: {
            preferredExplanations: generalProfile.preferredExplanations,
            pacePreference: generalProfile.pacePreference,
            corroboratingSessions: 3,
          },
          interests: generalProfile.interests.map((i) => i.label),
          strengths: generalProfile.strengths.map((s) => ({
            subject: s.subject ?? 'general',
            topics: [s.topic],
            confidence: 'medium' as const,
          })),
          struggles: generalProfile.struggles.map((s) => ({
            subject: s.subject,
            topic: s.topic,
            lastSeen: now,
            attempts: 2,
            confidence: 'medium' as const,
          })),
          communicationNotes: [],
          memoryEnabled: true,
          memoryInjectionEnabled: true,
          memoryConsentStatus: 'granted',
          effectivenessSessionCount: 3,
        },
        'Science',
        'Mesozoic era',
        null,
        []
      );
      expect(block.text.length).toBeGreaterThan(0);
      expect(block.entries.length).toBeGreaterThan(0);
    });
  });

  describe('buildPrompt', () => {
    it('renders the production system prompt and exposes the last user turn', () => {
      const scenarios =
        exchangesFlow.enumerateScenarios?.(generalProfile) ?? [];
      const s5 = scenarios.find((s) => s.scenarioId === 'S5-rung5-exit');
      if (!s5) throw new Error('S5 missing');

      const messages = exchangesFlow.buildPrompt(s5.input);
      expect(typeof messages.system).toBe('string');
      expect(messages.system.length).toBeGreaterThan(200);
      expect(messages.user).toBe('…still not clicking.');
      expect(messages.notes?.[0]).toContain('S5-rung5-exit');
    });
  });

  describe('fixture coverage', () => {
    it('all profiles produce at least S1–S6 + S8 (7 scenarios minimum)', () => {
      for (const profile of PROFILES) {
        const scenarios = exchangesFlow.enumerateScenarios?.(profile) ?? [];
        expect(scenarios.length).toBeGreaterThanOrEqual(7);
      }
    });

    it('only language profiles get S7', () => {
      const languageIds = PROFILES.filter(
        (p) => p.targetLanguage && p.cefrLevel
      ).map((p) => p.id);
      const nonLanguageIds = PROFILES.filter(
        (p) => !p.targetLanguage || !p.cefrLevel
      ).map((p) => p.id);

      for (const id of languageIds) {
        const profile = getProfile(id);
        const scenarios = profile
          ? exchangesFlow.enumerateScenarios?.(profile) ?? []
          : [];
        expect(scenarios.map((s) => s.scenarioId)).toContain(
          'S7-language-fluency'
        );
      }
      for (const id of nonLanguageIds) {
        const profile = getProfile(id);
        const scenarios = profile
          ? exchangesFlow.enumerateScenarios?.(profile) ?? []
          : [];
        expect(scenarios.map((s) => s.scenarioId)).not.toContain(
          'S7-language-fluency'
        );
      }
    });
  });
});
