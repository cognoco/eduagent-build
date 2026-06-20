import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  applyAppHelpSignalGuard,
  buildAppHelpDirectReply,
  buildAppHelpPromptBlock,
  isAppHelpQuery,
} from './app-help-map';

interface EnglishLocale {
  home: {
    learner: {
      askAnythingLabel: string;
      intentActions: {
        homework: { title: string };
        practice: { title: string };
        studyNew: { title: string };
      };
    };
  };
  more: {
    accommodation: { childScreenTitle: string; sectionHeader: string };
    help: { helpAndFeedback: string };
    learningPreferences: { rowLabel: string };
    mentorMemory: { sectionHeader: string };
    notifications: { sectionHeader: string };
    privacy: { privacyAndData: string };
    account: { profile: string; subscription: string; mentorLanguage: string };
    family: { addChild: string };
  };
  settings: { appLanguage: string };
  tabs: { mentor: string; subjects: string; journal: string };
  journal: {
    sections: {
      recaps: string;
      notes: string;
      memory: string;
      reports: string;
    };
    notes: { sessions: string; notes: string; bookmarks: string };
  };
  accountAdmin: { title: string; security: string; familySettings: string };
}

// Cross-package read: ensures the map's user-visible labels stay in sync with
// mobile's i18n source. If en.json moves, update this path — the test should break loudly.
const en = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../mobile/src/i18n/locales/en.json'),
    'utf8',
  ),
) as EnglishLocale;

describe('buildAppHelpPromptBlock', () => {
  const block = buildAppHelpPromptBlock();

  it('returns a non-empty string', () => {
    expect(typeof block).toBe('string');
    expect(block.length).toBeGreaterThan(0);
  });

  it('explicitly tells the model it can answer internal app questions', () => {
    expect(block).toContain(
      'You DO have access to the app map below, and you are allowed and expected to answer internal app-navigation questions from it.',
    );
    expect(block).toContain('Do not treat app questions as off-topic');
    expect(block).toContain('Do not treat app questions as assessment answers');
  });

  it('contains Notes destinations pointing to My Notes and Library', () => {
    expect(block).toContain('My Notes');
    expect(block).toContain('Home > My Notes > Notes');
    expect(block).toContain('Library');
    expect(block).toMatch(/notes/i);
  });

  it('contains past conversations and saved destinations pointing to My Notes', () => {
    expect(block).toContain('Home > My Notes > Sessions');
    expect(block).toContain('Home > My Notes > Bookmarks');
    expect(block).toContain('Progress');
    expect(block).toMatch(/saved/i);
  });

  it('contains Preferences destination under More', () => {
    expect(block).toContain('More');
    expect(block).toContain('Preferences');
  });

  it('contains Learning accommodation under Preferences', () => {
    expect(block).toMatch(/learning accommodation/i);
  });

  it('describes Challenge Round (the per-round successor to the removed mode toggle)', () => {
    expect(block).toMatch(/challenge round/i);
    expect(block).toMatch(/per round/i);
  });

  it('does NOT advertise the removed Explorer/Challenge mode toggle', () => {
    expect(block).not.toMatch(/explorer mode/i);
    expect(block).not.toMatch(/challenge mode/i);
    expect(block).not.toMatch(/mode button/i);
  });

  it('contains core More destinations', () => {
    expect(block).toContain('Mentor memory');
    expect(block).toContain('Profile');
    expect(block).toContain('Notifications');
    expect(block).toContain('Privacy & data');
    expect(block).toContain('Help & feedback');
  });

  it('contains Home action destinations', () => {
    expect(block).toContain('Home');
    expect(block).toMatch(/help with an assignment/i);
    expect(block).toMatch(/test yourself/i);
  });

  it('contains parent-specific destinations', () => {
    expect(block).toMatch(/child/i);
    expect(block).toMatch(/open progress/i);
    expect(block).toMatch(/learning preferences/i);
    expect(block).not.toMatch(/profile selector/i);
    expect(block).not.toMatch(/Switch to the child's profile/i);
    // V0/V1-neutral wording: parents reach a child's surfaces via Progress,
    // not via "tap the child's card" (which is a V1-only Family home pattern
    // and not the production default while MODE_NAV_V1_ENABLED is off).
    expect(block).not.toMatch(/child's card/i);
  });

  it('does not contain Expo route strings', () => {
    expect(block).not.toMatch(/\/\(app\)/);
    expect(block).not.toMatch(/\/\(tabs\)/);
    expect(block).not.toMatch(/\[.*Id\]/);
  });

  it('does not contain markdown links or URLs', () => {
    expect(block).not.toMatch(/\[.*\]\(.*\)/);
    expect(block).not.toMatch(/https?:\/\//);
  });

  it('uses exact i18n labels for More destinations', () => {
    expect(en.more.learningPreferences.rowLabel).toBe('Preferences');
    expect(en.more.help.helpAndFeedback).toBe('Help & feedback');
    expect(en.more.mentorMemory.sectionHeader).toBe('Mentor memory');
    expect(en.more.privacy.privacyAndData).toBe('Privacy & data');
    expect(en.more.notifications.sectionHeader).toBe('Notifications');
    expect(en.more.accommodation.sectionHeader).toBe(
      'Your learning accommodation',
    );
    expect(en.more.accommodation.childScreenTitle).toBe(
      "{{name}}'s learning preferences",
    );
    expect(en.more.account.profile).toBe('Profile');

    expect(block).toContain(en.more.learningPreferences.rowLabel);
    expect(block).toContain(en.more.help.helpAndFeedback);
    expect(block).toContain(en.more.mentorMemory.sectionHeader);
    expect(block).toContain(en.more.privacy.privacyAndData);
    expect(block).toContain(en.more.notifications.sectionHeader);
    expect(block).toContain(en.more.accommodation.sectionHeader);
    // The map uses V0/V1-neutral prose ("their learning preferences row")
    // rather than the childScreenTitle label verbatim; verify the
    // childScreenTitle key still exists in i18n and that the map contains
    // "learning preferences" as a substring.
    expect(en.more.accommodation.childScreenTitle).toContain(
      'learning preferences',
    );
    expect(block).toMatch(/learning preferences/i);
    expect(block).toContain(en.more.account.profile);
  });

  it('uses exact i18n labels for account/family/billing/language destinations', () => {
    expect(en.more.family.addChild).toBe('Add a child');
    expect(en.more.account.subscription).toBe('Subscription');
    expect(en.settings.appLanguage).toBe('App Language');

    expect(block).toContain(en.more.family.addChild);
    expect(block).toContain(en.more.account.subscription);
    expect(block).toContain(en.settings.appLanguage);
  });

  it('forbids quoting prices, limits, or "free/unlimited" claims', () => {
    expect(block).toMatch(/never state prices/i);
    expect(block).toMatch(/free or unlimited/i);
    expect(block).toMatch(/without quoting any numbers/i);
  });

  it('describes the library hierarchy and review cadence concept', () => {
    // Library structure entry: subjects > books > topics > chapters.
    expect(block).toMatch(/how the library is organised/i);
    expect(block).toMatch(/subjects/i);
    expect(block).toMatch(/books/i);
    expect(block).toMatch(/topics/i);
    expect(block).toMatch(/chapters?/i);
    // Review-cadence entry: adaptive, no fixed "every N days".
    expect(block).toMatch(/review cadence|how often to review/i);
    expect(block).toMatch(/adaptive/i);
    expect(block).toMatch(/do not promise a specific number of days/i);
  });

  it('keeps destination labels exact in non-English conversations', () => {
    expect(block).toContain('Use visible labels only.');
    expect(block).toContain(
      'When answering in a non-English conversation, keep destination labels exactly as shown in this map',
    );
    expect(block).not.toContain('translate the destination labels');
  });

  it('uses exact i18n labels for Home intent cards', () => {
    expect(en.home.learner.askAnythingLabel).toBe('Ask anything');
    expect(en.home.learner.intentActions.homework.title).toBe(
      'Help with an assignment',
    );
    expect(en.home.learner.intentActions.practice.title).toBe('Test yourself');
    expect(en.home.learner.intentActions.studyNew.title).toBe(
      'Learn something new',
    );

    expect(block).toContain(en.home.learner.askAnythingLabel);
    expect(block).toContain(en.home.learner.intentActions.homework.title);
    expect(block).toContain(en.home.learner.intentActions.practice.title);
    expect(block).toContain(en.home.learner.intentActions.studyNew.title);
  });

  it('contains a full version date stamp matching the header comment', () => {
    expect(block).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('isAppHelpQuery', () => {
  it.each([
    'Where do I find my notes?',
    'Where do I find my notes about this topic or subject?',
    'Where are the notes about this topic?',
    'Where are the notes for this subject?',
    'How do I change learning preferences?',
    'where are settings',
    'how to change mode',
    'where is the help section',
    'how do I find saved explanations',
    'Where are my saved replies?',
    'Where are my old conversations?',
    'Where can I find previous sessions?',
    'what is explorer mode',
    'what is challenge mode',
    'How do I use this app?',
    'How does MentoMate work?',
    'What can I do in this app?',
    'Where do I start in MentoMate?',
    'Can you answer internal app questions?',
    'What app questions can I ask?',
    'where can I see what you remember',
    'how do I delete my account',
    'Where can I find the progress tab?',
    'How do I get to the progress screen?',
    'Where do I find the app settings?',
    'Where is the Help & feedback section?',
    "How do I see my child's progress?",
    'How do I upgrade to get more questions?',
    'Where do I change the app language?',
    'How do I add a child?',
    'How do I add my child to my account?',
    'How do I change my subscription?',
    'How is the library organised?',
    'How are topics structured?',
    'What are topics in the app?',
    'What are chapters in the library?',
    'What is a topic in the app?',
    'What is the library?',
    'How often do I need to do a review?',
    'How often should I review?',
    'When should I review?',
    'How does spaced repetition work here?',
    'What are topics and chapters in the app?',
    'What is the difference between a book and a topic?',
    "What's the difference between a book and a topic?",
    'Is this app free?',
    'Is the app free?',
    'Do I have to pay to use this app?',
    'How much does the app cost?',
  ])('classifies "%s" as app-help', (msg) => {
    expect(isAppHelpQuery(msg)).toBe(true);
  });

  it.each(['mode', 'help', 'note'])(
    'rejects "%s" (below 5-char minimum)',
    (msg) => {
      expect(isAppHelpQuery(msg)).toBe(false);
    },
  );

  it('rejects empty string', () => {
    expect(isAppHelpQuery('')).toBe(false);
  });

  it.each([
    'What is photosynthesis?',
    'Explain the quadratic formula',
    'Can you help me with this homework problem?',
    'I got the answer 42, is that right?',
    'Tell me more about cellular respiration',
    'Where is the mitochondria in the cell?',
    'How do I solve quadratic equations?',
    'Help me find the prime factors of 24',
    'How to calculate the area of a triangle',
    "What's the difference between mitosis and meiosis?",
    'Where did the Vikings settle?',
    'Where do I find the quadratic formula?',
    'Where can I see the Pacific Ocean on a map?',
    'Where do I change the subject in this sentence?',
    'I need to find the derivative',
    'How do I know if my answer is correct?',
    'Explain the concept of privacy in law',
    'What is a profile in soil science?',
    'Can you help me find the answer?',
    'How to use the formula',
    'What is the Explorer age of discovery?',
    'Where are the notes on a musical staff?',
    'Where can I see progress on this topic?',
    'Where can I see my progress in the textbook?',
    'Where can I find help with this calculus problem?',
    // Library/review terms used in a genuine learning sense must NOT match —
    // these are the false positives that an over-broad app-help regex creates.
    'Can you do a review of my essay?',
    'Should I do a review of chapter 5 for my exam?',
    'Can you review my answer?',
    'How often should I practice the piano?',
    'Explain the book Romeo and Juliet',
    'What is a book report?',
    'Tell me about the chapter on the French Revolution',
    // Cost/pricing phrasing in a genuine learning sense must NOT match — these
    // are the false positives the tightened cost detection guards against.
    'How much does it cost to build a pyramid?',
    'How much does it cost?',
    'Is the answer free of errors?',
    'Do I have to pay attention to the sign?',
  ])('does NOT classify "%s" as app-help', (msg) => {
    expect(isAppHelpQuery(msg)).toBe(false);
  });
});

describe('buildAppHelpDirectReply', () => {
  it('answers topic-notes questions with the notes destinations', () => {
    expect(
      buildAppHelpDirectReply(
        'Where do I find my notes about this topic or subject?',
      ),
    ).toBe(
      'You can find all notes at Home > My Notes > Notes. For notes tied to a specific subject, book, or topic, go to Library > choose the subject, choose the book or topic > Your Notes.',
    );
  });

  it('answers capability questions without saying the app is off-topic', () => {
    const reply = buildAppHelpDirectReply(
      'Can you answer internal app questions?',
    );

    expect(reply).toContain('Yes - I can answer questions');
    expect(reply).toContain('MentoMate');
    expect(reply).not.toMatch(/off-topic|cannot help/i);
  });

  it('routes add-child questions to More > Add a child (never Progress)', () => {
    const reply = buildAppHelpDirectReply(
      'How do I add my child to my account?',
    );
    expect(reply).toContain('More > Add a child');
    expect(reply).not.toMatch(/progress/i);
  });

  it('routes billing/upgrade questions to Subscription without quoting prices', () => {
    const reply = buildAppHelpDirectReply(
      'How do I upgrade to get more questions?',
    );
    expect(reply).toContain('More > Profile');
    expect(reply).toContain('Subscription');
    expect(reply).not.toMatch(/free|unlimited|\$\d/i);
  });

  it('routes app-language questions to More > Profile, then App Language', () => {
    const reply = buildAppHelpDirectReply(
      'Where do I change the app language?',
    );
    expect(reply).toContain('App Language');
    expect(reply).toContain('More > Profile');
  });
});

describe('buildAppHelpPromptBlock — V2 shell', () => {
  const v2 = buildAppHelpPromptBlock('v2');

  it('selects a distinct V2 map; default and v0 stay on the V0 map (no regression)', () => {
    expect(buildAppHelpPromptBlock()).toBe(buildAppHelpPromptBlock('v0'));
    expect(buildAppHelpPromptBlock('v2')).not.toBe(
      buildAppHelpPromptBlock('v0'),
    );
  });

  it('still tells the model it can answer internal app questions', () => {
    expect(v2).toContain(
      'You DO have access to the app map below, and you are allowed and expected to answer internal app-navigation questions from it.',
    );
    expect(v2).toContain('Do not treat app questions as off-topic');
    expect(v2).toContain('Do not treat app questions as assessment answers');
  });

  it('names the three V2 tabs as destinations', () => {
    expect(en.tabs.mentor).toBe('Mentor');
    expect(en.tabs.subjects).toBe('Subjects');
    expect(en.tabs.journal).toBe('Journal');
    expect(v2).toContain(en.tabs.mentor);
    expect(v2).toContain(en.tabs.subjects);
    expect(v2).toContain(en.tabs.journal);
  });

  it('routes notes / sessions / bookmarks / memory into the Journal tab', () => {
    expect(en.journal.sections.notes).toBe('Saved notes');
    expect(en.journal.sections.memory).toBe('Mentor memory');
    expect(v2).toContain(en.journal.sections.notes);
    // Sessions and bookmarks are routed as sub-labels of "Saved notes" in the
    // V2 prompt, not standalone i18n keys: the journal i18n was restructured in
    // #1316 (journal.notes.sessions / journal.notes.bookmarks were removed), so
    // assert the literal destination copy the prompt actually teaches.
    expect(v2).toContain('Recent learning sessions');
    expect(v2).toContain('Saved mentor replies');
    expect(v2).toContain(en.journal.sections.memory);
  });

  it('routes account/settings to the Account sheet (opened from the profile picture)', () => {
    expect(en.accountAdmin.title).toBe('Account');
    expect(en.accountAdmin.security).toBe('Account security');
    expect(en.accountAdmin.familySettings).toBe('Family settings');
    expect(v2).toContain(en.accountAdmin.title);
    expect(v2).toMatch(/profile picture/i);
    expect(v2).toContain(en.accountAdmin.security);
    expect(v2).toContain(en.more.account.subscription);
    expect(v2).toContain(en.accountAdmin.familySettings);
    expect(v2).toContain(en.more.family.addChild);
  });

  it('uses the Subjects tab for subjects/books/topics (no Library tab)', () => {
    expect(v2).toMatch(/subjects/i);
    expect(v2).toMatch(/books?/i);
    expect(v2).toMatch(/topics?/i);
  });

  it('contains NONE of the deleted V0/V1 destination paths', () => {
    expect(v2).not.toContain('My Notes');
    expect(v2).not.toContain('More >');
    expect(v2).not.toContain('Library >');
    expect(v2).not.toContain('Open Progress');
    expect(v2).not.toContain('Home >');
  });

  it('keeps the V0-parity guardrails (prices, invented screens, adaptive reviews, labels)', () => {
    expect(v2).toMatch(/never state prices/i);
    expect(v2).toMatch(/do not invent/i);
    expect(v2).toMatch(/adaptive/i);
    expect(v2).toMatch(/do not promise a specific number of days/i);
    expect(v2).toContain('Use visible labels only.');
  });

  it('does not leak Expo routes or URLs', () => {
    expect(v2).not.toMatch(/\/\(app\)/);
    expect(v2).not.toMatch(/\/\(tabs\)/);
    expect(v2).not.toMatch(/\[.*Id\]/);
    expect(v2).not.toMatch(/https?:\/\//);
    expect(v2).not.toMatch(/\[.*\]\(.*\)/);
  });

  it('stamps a V2 version date', () => {
    expect(v2).toMatch(/V2 shell/);
    expect(v2).toMatch(/\d{4}-\d{2}-\d{2}/);
  });
});

describe('buildAppHelpDirectReply — V2 shell', () => {
  it('routes notes questions into the Journal tab', () => {
    const reply = buildAppHelpDirectReply('Where do I find my notes?', 'v2');
    expect(reply).toMatch(/journal/i);
    expect(reply).not.toContain('My Notes');
    expect(reply).not.toMatch(/library >/i);
  });

  it('routes add-child to the Account sheet > Family settings (never Progress/More)', () => {
    const reply = buildAppHelpDirectReply('How do I add a child?', 'v2');
    expect(reply).toContain('Add a child');
    expect(reply).toContain('Account');
    expect(reply).not.toMatch(/more >/i);
    expect(reply).not.toMatch(/progress/i);
  });

  it('routes billing to the Account sheet > Subscription without quoting prices', () => {
    const reply = buildAppHelpDirectReply(
      'How do I upgrade to get more questions?',
      'v2',
    );
    expect(reply).toContain('Subscription');
    expect(reply).toContain('Account');
    expect(reply).not.toMatch(/free|unlimited|\$\d/i);
    expect(reply).not.toMatch(/more >/i);
  });

  it('routes language questions to the Account sheet', () => {
    const reply = buildAppHelpDirectReply(
      'Where do I change the app language?',
      'v2',
    );
    expect(reply).toMatch(/language/i);
    expect(reply).toContain('Account');
  });

  it('answers capability questions without saying off-topic', () => {
    const reply = buildAppHelpDirectReply(
      'Can you answer internal app questions?',
      'v2',
    );
    expect(reply).toContain('MentoMate');
    expect(reply).not.toMatch(/off-topic|cannot help/i);
  });

  it('default and v0 keep the V0 replies (no regression)', () => {
    const msg = 'Where do I find my notes about this topic or subject?';
    expect(buildAppHelpDirectReply(msg)).toBe(
      buildAppHelpDirectReply(msg, 'v0'),
    );
    expect(buildAppHelpDirectReply(msg, 'v0')).toContain('My Notes');
  });
});

describe('applyAppHelpSignalGuard', () => {
  const baseParsed = {
    cleanResponse: 'You can find your notes in Library.',
    understandingCheck: false,
    partialProgress: false,
    needsDeepening: false,
    notePrompt: false,
    notePromptPostSession: false,
    fluencyDrill: null,
    readyToFinish: false,
  };

  it('forces all learning signals to false when LLM set them to true', () => {
    const guarded = applyAppHelpSignalGuard({
      ...baseParsed,
      partialProgress: true,
      needsDeepening: true,
      understandingCheck: true,
      notePrompt: true,
      notePromptPostSession: true,
    });

    expect(guarded.partialProgress).toBe(false);
    expect(guarded.needsDeepening).toBe(false);
    expect(guarded.understandingCheck).toBe(false);
    expect(guarded.notePrompt).toBe(false);
    expect(guarded.notePromptPostSession).toBe(false);
  });

  it('forces readyToFinish to false', () => {
    const guarded = applyAppHelpSignalGuard({
      ...baseParsed,
      readyToFinish: true,
    });

    expect(guarded.readyToFinish).toBe(false);
  });

  it('preserves non-learning output fields unchanged', () => {
    const guarded = applyAppHelpSignalGuard({
      ...baseParsed,
      partialProgress: true,
    });

    expect(guarded.cleanResponse).toBe('You can find your notes in Library.');
    expect(guarded.fluencyDrill).toBeNull();
  });

  it('suppresses fluency drills for app-help turns', () => {
    const guarded = applyAppHelpSignalGuard({
      ...baseParsed,
      fluencyDrill: { prompt: 'say it again' },
    });

    expect(guarded.fluencyDrill).toBeNull();
  });
});
