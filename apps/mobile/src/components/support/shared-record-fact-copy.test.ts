import { createInstance } from 'i18next';
import type { ReportableFact, SharedRecordView } from '@eduagent/schemas';

import de from '../../i18n/locales/de.json';
import type { Translate } from '../../i18n';
import {
  renderSharedRecordFact,
  renderSharedRecordHeadline,
} from './shared-record-fact-copy';

async function germanTranslate(): Promise<Translate> {
  const instance = createInstance();
  await instance.init({
    lng: 'de',
    fallbackLng: false,
    resources: { de: { translation: de } },
    interpolation: { escapeValue: false },
  });
  return instance.getFixedT('de') as Translate;
}

function fact(overrides: Partial<ReportableFact>): ReportableFact {
  return {
    id: 'fact-1',
    kind: 'effort',
    title: 'Legacy English title',
    detail: 'Legacy English detail',
    source: 'test',
    ...overrides,
  };
}

describe('shared-record fact copy', () => {
  it('renders weekly-report and session-recap metadata in German without raw server prose', async () => {
    const t = await germanTranslate();

    const weekly = renderSharedRecordFact(
      fact({
        metadata: {
          templateKey: 'weeklyReport',
          reportWeek: '2026-06-22',
          stats: [{ metricKey: 'topicsExplored', value: 3 }],
        },
      }),
      t,
      'de',
    );
    const recap = renderSharedRecordFact(
      fact({
        metadata: {
          templateKey: 'sessionRecap',
          sessionDate: '2026-06-28T12:00:00.000Z',
        },
      }),
      t,
      'de',
    );

    expect(weekly.title).toContain('Wochenbericht');
    expect(weekly.detail).toBe('3 Themen erkundet');
    expect(recap.title).toMatch(/Sitzungs/);
    expect(recap.detail).toMatch(/teilbar/i);
    expect(JSON.stringify([weekly, recap])).not.toMatch(
      /Weekly report|Topics explored|Session recap ready|Legacy English/,
    );
  });

  it.each([
    ['vocabulary_count', 4, undefined, '4 Wörter gelernt'],
    ['topic_mastered_count', 2, undefined, '2 Themen gemeistert'],
    ['session_count', 3, undefined, '3 Lernsitzungen abgeschlossen'],
    ['streak_length', 5, undefined, '5-Tage-Streak'],
    ['subject_mastered', 1, 'Physik', 'Physik gemeistert'],
    ['book_completed', 1, undefined, 'Ein Buch abgeschlossen'],
    ['learning_time', 2, undefined, '2 Stunden gelernt'],
    ['cefr_level_up', 1, undefined, 'Sprachlevel erhöht'],
    ['topics_explored', 6, 'Physik', '6 Themen in Physik erkundet'],
  ])(
    'renders %s milestone metadata through localized copy',
    async (milestoneType, threshold, subjectName, expectedDetail) => {
      const t = await germanTranslate();
      const rendered = renderSharedRecordFact(
        fact({
          kind: 'mastery',
          metadata: {
            templateKey: 'milestone',
            milestoneType,
            threshold,
            ...(subjectName ? { subjectName } : {}),
          },
        }),
        t,
        'de',
      );

      expect(rendered).toEqual({
        title: 'Meilenstein erreicht',
        detail: expectedDetail,
      });
    },
  );

  it.each([
    undefined,
    { templateKey: 'futureTemplate', value: 1 },
    { templateKey: 'weeklyReport', reportWeek: 42 },
  ])(
    'falls back to non-blank legacy copy for %p metadata',
    async (metadata) => {
      const t = await germanTranslate();

      expect(renderSharedRecordFact(fact({ metadata }), t, 'de')).toEqual({
        title: 'Legacy English title',
        detail: 'Legacy English detail',
      });
    },
  );

  it('localizes a structured supporter headline and preserves a legacy headline', async () => {
    const t = await germanTranslate();
    const structuredFact = fact({
      metadata: {
        templateKey: 'sessionRecap',
        sessionDate: '2026-06-28T12:00:00.000Z',
      },
    });
    const view: SharedRecordView = {
      audience: 'supporter',
      factIds: ['fact-1'],
      headline: 'Emma has 1 shareable update.',
      facts: [structuredFact],
    };

    expect(renderSharedRecordHeadline(view, t, 'Emma')).toBe(
      'Emma hat 1 teilbares Update.',
    );
    expect(renderSharedRecordHeadline(view, t, undefined)).toBe(view.headline);
    expect(
      renderSharedRecordHeadline(
        { ...view, facts: [fact({ metadata: { templateKey: 'unknown' } })] },
        t,
        'Emma',
      ),
    ).toBe(view.headline);
    expect(
      renderSharedRecordHeadline(
        {
          ...view,
          factIds: ['fact-1', 'fact-2'],
          facts: [structuredFact, fact({ metadata: undefined })],
        },
        t,
        'Emma',
      ),
    ).toBe('Emma hat 2 teilbare Updates.');
    expect(
      renderSharedRecordHeadline(
        { ...view, facts: [fact({ metadata: undefined })] },
        t,
        'Emma',
      ),
    ).toBe('Emma has 1 shareable update.');
  });
});
