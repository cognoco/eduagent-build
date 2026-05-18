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
    account: { profile: string };
  };
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

  it('contains Explorer mode explanation', () => {
    expect(block).toMatch(/explorer/i);
  });

  it('contains Challenge mode explanation', () => {
    expect(block).toMatch(/challenge/i);
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
    expect(block).toMatch(/child's card/i);
    expect(block).toMatch(/learning preferences/i);
    expect(block).not.toMatch(/profile selector/i);
    expect(block).not.toMatch(/Switch to the child's profile/i);
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
    expect(block).toContain(
      en.more.accommodation.childScreenTitle.replace(
        '{{name}}',
        '<child name>',
      ),
    );
    expect(block).toContain(en.more.account.profile);
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
