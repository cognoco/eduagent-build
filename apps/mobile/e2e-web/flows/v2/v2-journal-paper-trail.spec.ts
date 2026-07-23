import { expect, test, type Page } from '@playwright/test';

import { pressableClick } from '../../helpers/pressable';
import { seedAndSignIn } from '../../helpers/seed-and-sign-in';

test.use({ storageState: { cookies: [], origins: [] } });

async function openJournal(page: Page): Promise<void> {
  await pressableClick(page.getByTestId('tab-journal'));
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.getByTestId('journal-screen')).toBeVisible();
  // This seed is a sole learner with no support edges. In the V2 scope
  // contract that means Journal is structurally Me-only: no switcher exists.
  await expect(page.getByTestId('scope-chip')).toHaveCount(0);
}

async function expectJournalReturn(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/journal$/);
  await expect(page.getByTestId('journal-screen')).toBeVisible();
  await expect(page.getByTestId('scope-chip')).toHaveCount(0);
}

test('[WI-2239] v2-journal-paper-trail: seeded Session, learner Note, Mentor bookmark, Practice, Memory, and exact weekly/monthly reports open their owning surfaces and return to Journal Me', async ({
  page,
}) => {
  const seeded = await seedAndSignIn(page, {
    scenario: 'v2-journal-paper-trail',
    alias: 'wi2239-paper-trail',
    landingTestId: 'mentor-screen',
    landingPath: '/mentor',
  });
  const {
    sessionId,
    recapId,
    subjectId,
    topicId,
    learnerNoteId,
    bookmarkId,
    practiceActivityEventId,
    weeklyReportId,
    monthlyReportId,
  } = seeded.ids;

  await openJournal(page);

  // Exact seeded recap -> exact session/subject/topic -> Journal Me.
  const recapRow = page.getByTestId(`journal-recap-row-${recapId}`);
  await expect(recapRow).toBeVisible();
  await expect(
    recapRow.getByText('Biology / Biology Topic 1', { exact: true }),
  ).toBeVisible();
  await pressableClick(recapRow);
  await expect
    .poll(() => {
      const url = new URL(page.url());
      return {
        pathname: url.pathname,
        subjectId: url.searchParams.get('subjectId'),
        topicId: url.searchParams.get('topicId'),
        returnTo: url.searchParams.get('returnTo'),
      };
    })
    .toEqual({
      pathname: `/session-summary/${sessionId}`,
      subjectId,
      topicId,
      returnTo: 'journal',
    });
  const recapCard = page.getByTestId('session-recap-card');
  await expect(recapCard).toBeVisible();
  await expect(
    recapCard.getByText(
      'We traced how photosynthesis stores sunlight as chemical energy in glucose.',
      { exact: true },
    ),
  ).toBeVisible();
  await pressableClick(page.getByTestId('summary-close-button'));
  await expectJournalReturn(page);
  await expect(recapRow).toBeVisible();

  // Mine + exact glucose search finds only the seeded learner-authored note,
  // which then opens the Notes owner list without swapping source identity.
  await pressableClick(page.getByTestId('journal-tab-notes'));
  await pressableClick(page.getByTestId('journal-notes-filter-mine'));
  const journalLearnerNote = page.getByTestId(
    `journal-note-note:${learnerNoteId}`,
  );
  await expect(journalLearnerNote).toBeVisible();
  await expect(
    page.getByTestId(`journal-note-bookmark:${bookmarkId}`),
  ).toHaveCount(0);
  await page
    .getByTestId('journal-notes-search-input')
    .fill('not-in-this-archive');
  await expect(page.getByTestId('journal-notes-empty')).toBeVisible();
  await expect(
    page.getByTestId(`journal-note-note:${learnerNoteId}`),
  ).toHaveCount(0);
  await page.getByTestId('journal-notes-search-input').fill('glucose');
  await expect(
    page.getByTestId(`journal-note-note:${learnerNoteId}`),
  ).toBeVisible();
  await expect(
    journalLearnerNote.getByText(
      'Photosynthesis stores sunlight as chemical energy in glucose for the plant.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByTestId(`journal-note-bookmark:${bookmarkId}`),
  ).toHaveCount(0);
  await pressableClick(page.getByTestId(`journal-note-note:${learnerNoteId}`));
  await expect(page).toHaveURL(/\/my-notes\/notes\?returnTo=journal$/);
  const learnerNote = page.getByTestId(`my-notes-row-notes-${learnerNoteId}`);
  await expect(learnerNote).toBeVisible();
  await expect(learnerNote.getByText('Biology', { exact: true })).toBeVisible();
  await expect(
    learnerNote.getByText(
      'Photosynthesis stores sunlight as chemical energy in glucose for the plant.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByTestId(`my-notes-row-bookmarks-${bookmarkId}`),
  ).toHaveCount(0);
  await pressableClick(page.getByTestId('my-notes-list-back'));
  await expect(page.getByTestId('my-notes-hub')).toBeVisible();
  await pressableClick(page.getByTestId('my-notes-back'));
  await expectJournalReturn(page);

  // Mentor + exact chlorophyll search finds only the seeded Mentor bookmark,
  // which then opens the Bookmarks owner list without swapping source identity.
  await pressableClick(page.getByTestId('journal-tab-notes'));
  await page.getByTestId('journal-notes-search-input').fill('');
  await pressableClick(page.getByTestId('journal-notes-filter-mentor'));
  const journalBookmark = page.getByTestId(
    `journal-note-bookmark:${bookmarkId}`,
  );
  await expect(journalBookmark).toBeVisible();
  await expect(
    page.getByTestId(`journal-note-note:${learnerNoteId}`),
  ).toHaveCount(0);
  await page
    .getByTestId('journal-notes-search-input')
    .fill('not-in-this-archive');
  await expect(page.getByTestId('journal-notes-empty')).toBeVisible();
  await expect(
    page.getByTestId(`journal-note-bookmark:${bookmarkId}`),
  ).toHaveCount(0);
  await page.getByTestId('journal-notes-search-input').fill('chlorophyll');
  await expect(
    page.getByTestId(`journal-note-bookmark:${bookmarkId}`),
  ).toBeVisible();
  await expect(
    journalBookmark.getByText(
      'Chlorophyll captures light energy that powers photosynthesis.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByTestId(`journal-note-note:${learnerNoteId}`),
  ).toHaveCount(0);
  await pressableClick(page.getByTestId(`journal-note-bookmark:${bookmarkId}`));
  await expect(page).toHaveURL(/\/my-notes\/bookmarks\?returnTo=journal$/);
  const bookmark = page.getByTestId(`my-notes-row-bookmarks-${bookmarkId}`);
  await expect(bookmark).toBeVisible();
  await expect(bookmark.getByText('Biology', { exact: true })).toBeVisible();
  await expect(
    bookmark.getByText(
      'Chlorophyll captures light energy that powers photosynthesis.',
      { exact: true },
    ),
  ).toBeVisible();
  await expect(
    page.getByTestId(`my-notes-row-notes-${learnerNoteId}`),
  ).toHaveCount(0);
  await pressableClick(page.getByTestId('my-notes-list-back'));
  await expect(page.getByTestId('my-notes-hub')).toBeVisible();
  await pressableClick(page.getByTestId('my-notes-back'));
  await expectJournalReturn(page);

  // Exact seeded practice activity -> existing Practice hub -> Journal Me.
  await pressableClick(page.getByTestId('journal-tab-practice'));
  await expect(
    page.getByTestId(`journal-activity-${practiceActivityEventId}`),
  ).toBeVisible();
  await pressableClick(page.getByTestId('journal-practice-open-hub'));
  await expect(page.getByTestId('practice-screen')).toBeVisible();
  await pressableClick(page.getByTestId('practice-back'));
  await expectJournalReturn(page);

  // Populated learner Mentor memory -> existing owner view -> Journal Me.
  await pressableClick(page.getByTestId('journal-tab-memory'));
  await pressableClick(page.getByTestId('journal-memory-open'));
  await expect(page.getByTestId('mentor-memory-screen')).toBeVisible();
  await expect(
    page.getByTestId('mentor-memory-interests-section'),
  ).toBeVisible();
  await pressableClick(page.getByTestId('mentor-memory-back'));
  await expectJournalReturn(page);

  // Exact weekly report ID -> weekly detail -> Journal Me.
  await pressableClick(page.getByTestId('journal-tab-reports'));
  await pressableClick(
    page.getByTestId(`weekly-report-card-${weeklyReportId}`),
  );
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe(`/progress/weekly-report/${weeklyReportId}`);
  await expect(
    page.getByTestId('progress-weekly-report-metric-sessions'),
  ).toBeVisible();
  await expect(
    page.getByText('4 sessions this week', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('14 sessions this week', { exact: true }),
  ).toHaveCount(0);
  await pressableClick(page.getByTestId('progress-weekly-report-back'));
  await expectJournalReturn(page);
  await pressableClick(page.getByTestId('journal-tab-reports'));
  await expect(
    page.getByTestId(`weekly-report-card-${weeklyReportId}`),
  ).toBeVisible();

  // Exact monthly report ID -> monthly detail -> Journal Me.
  await pressableClick(page.getByTestId(`report-card-${monthlyReportId}`));
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe(`/progress/reports/${monthlyReportId}`);
  await expect(
    page.getByTestId('progress-report-metric-sessions'),
  ).toBeVisible();
  await expect(page.getByText('July 2026')).toBeVisible();
  await expect(
    page.getByText('12 topics mastered', { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText('112 topics mastered', { exact: true }),
  ).toHaveCount(0);
  await pressableClick(page.getByTestId('progress-report-back'));
  await expectJournalReturn(page);
  await pressableClick(page.getByTestId('journal-tab-reports'));
  await expect(
    page.getByTestId(`report-card-${monthlyReportId}`),
  ).toBeVisible();
});

test('[WI-2239] v2-journal-paper-trail: transient Notes and Bookmarks API failures expose one stable archive retry and recover both exact seeded sources', async ({
  page,
}) => {
  const seeded = await seedAndSignIn(page, {
    scenario: 'v2-journal-paper-trail',
    alias: 'wi2239-notes-retry',
    landingTestId: 'mentor-screen',
    landingPath: '/mentor',
  });
  const learnerNoteId = seeded.ids.learnerNoteId;
  const bookmarkId = seeded.ids.bookmarkId;
  let allowArchiveRecovery = false;

  await page.route('**/v1/notes**', async (route) => {
    if (!allowArchiveRecovery) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Temporary notes outage',
          code: 'UPSTREAM_ERROR',
        }),
      });
      return;
    }
    await route.continue();
  });

  await page.route('**/v1/bookmarks**', async (route) => {
    if (!allowArchiveRecovery) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          message: 'Temporary bookmarks outage',
          code: 'UPSTREAM_ERROR',
        }),
      });
      return;
    }
    await route.continue();
  });

  await openJournal(page);
  await pressableClick(page.getByTestId('journal-tab-notes'));
  await expect(page.getByTestId('journal-notes-error')).toBeVisible();
  allowArchiveRecovery = true;
  await pressableClick(page.getByTestId('journal-notes-error-retry'));
  await expect(
    page.getByTestId(`journal-note-note:${learnerNoteId}`),
  ).toBeVisible();
  await expect(
    page.getByTestId(`journal-note-bookmark:${bookmarkId}`),
  ).toBeVisible();
});

test('[WI-2239] onboarding-complete: Journal without recap artifacts offers the hard CTA to the V2 Mentor', async ({
  page,
}) => {
  await seedAndSignIn(page, {
    scenario: 'onboarding-complete',
    alias: 'wi2239-empty-journal',
    landingTestId: 'mentor-screen',
    landingPath: '/mentor',
  });

  await openJournal(page);
  await expect(page.getByTestId('journal-recaps-empty')).toBeVisible();
  await pressableClick(page.getByTestId('journal-recaps-empty-start-session'));
  await expect(page).toHaveURL(/\/mentor$/);
  await expect(page.getByTestId('mentor-screen')).toBeVisible();
});
