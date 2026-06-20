// App Help Map - server-owned static map of user-facing destinations.
//
import type {
  ChallengeRoundEvaluationItem,
  ChallengeRoundNoteDraftHint,
} from '@eduagent/schemas';

// Every label MUST match the exact string visible in the app. Tests in
// app-help-map.test.ts read the mobile en.json source for i18n-backed labels
// and assert important hardcoded labels explicitly.
// If a screen is renamed, update the map and the tests together.
//
// Map version: 2026-05-30 (V0/V1 shell) · 2026-06-14 (V2 shell)
//
// Two shells coexist while the mentor-is-the-app V2 redesign strangles the
// legacy nav (see docs/plans/v2-plan/). The V0 map describes the shipped
// production shell (Home / Library / More / Progress). The V2 map describes
// the three-tab Mentor / Subjects / Journal shell + the account sheet, live on
// dev/preview builds behind MODE_NAV_V2_ENABLED. `buildAppHelpPromptBlock` and
// `buildAppHelpDirectReply` select by `shell`, defaulting to 'v0' so every
// existing caller (and production) is byte-identical until the S6 cutover flips
// V2 to the default and T13 deletes the V0 variant.

export type AppShell = 'v0' | 'v2';

const APP_HELP_MAP_V0 = `APP HELP (map version 2026-05-30):
This section means the current learner message is an internal MentoMate app question. You DO have access to the app map below, and you are allowed and expected to answer internal app-navigation questions from it. Do not say you cannot help with the app. Do not treat app questions as off-topic. Do not treat app questions as assessment answers. Answer in plain chat text using the visible destination labels below.

Use this map only for internal MentoMate app questions: where to find things, how to change settings, what app modes mean, or how to use app features. Do not invent screens, buttons, routes, links, or capabilities. Use visible labels only. Keep the answer to one or two sentences, then return to the learning thread if one was active. When answering in a non-English conversation, keep destination labels exactly as shown in this map; translate only the surrounding explanation. Never state prices, plan costs, quota numbers, daily limits, or claim the app is free or unlimited — you do not have that information. For any question about cost, billing, plans, upgrades, or usage limits, point to the subscription destination below (and to "More > Help & feedback" for billing problems) without quoting any numbers. Never invent a fixed review schedule or "every N days" cadence — reviews are adaptive; describe the concept and point to where reviews live, but do not promise a number.

Destinations:
- Getting started / what to do: Home > choose Ask anything, Help with an assignment, Test yourself, or Learn something new.
- How the Library is organised (what subjects/books/topics/chapters are): The Library holds your subjects. Inside a subject are books; inside a book are topics; related topics can be grouped into chapters. Open Library, choose a subject, then a book or topic to go deeper. A "topic" is the smallest unit you actually study; a "book" is a collection of topics; a "chapter" just groups topics inside a book.
- All notes: Home > My Notes > Notes.
- Topic or book notes: Library > choose the subject, choose the book or topic > Your Notes.
- Past conversations: Home > My Notes > Sessions.
- Saved explanations / bookmarks: Home > My Notes > Bookmarks. They can also use Progress > tap Saved.
- Preferences: More > Preferences (under "Your learning").
- Learning accommodation: More > Preferences > Your learning accommodation.
- Challenge Round: An optional in-session check the mentor offers when the learner shows mastery. The learner accepts or declines per round; there is no global "mode" to toggle.
- Mentor memory: More > Mentor memory.
- Profile / account: More > Profile.
- Subscription, plan, upgrade, or billing (account owner): More > Profile, then Subscription. Do not quote any prices, tiers, or limits.
- App Language: More > Profile, then App Language. This also sets the mentor's language. (It is also reachable via the Mentor language row in More.)
- Notifications: More > Notifications.
- Privacy & data / export / account deletion: More > Privacy & data.
- Help & feedback: More > Help & feedback.
- Homework: Home > Help with an assignment.
- Practice / reviews: Home > Test yourself.
- How often to review (review cadence): Reviews are adaptive — MentoMate brings a topic back when it judges you are due, based on how well you remembered it, rather than on a fixed "every N days" schedule. Start a review anytime from Home > Test yourself; the app shows when your next review is due. Do not promise a specific number of days.
- Adding a child (parent / adult account owner): More > Add a child.
- Viewing a child's progress (parent): Open Progress, then pick the child you want to view.
- Changing a child's preferences (parent): Open Progress, pick the child, then open the "<child name>'s learning preferences" row.

If you do not know a destination, say so and suggest "More > Help & feedback".
Do not output internal route paths, Expo routes, markdown links, or URLs.`;

// V2 three-tab shell (Mentor / Subjects / Journal + account sheet). Every
// destination label below is the exact string rendered by the delivered V2
// surfaces (`mentor.tsx`, `subjects.tsx` → SubjectsBrowse, `journal.tsx` →
// JournalTabView, `account.tsx` → AccountAdminSheet, opened from AccountAvatar
// in the top-right). app-help-map.test.ts cross-reads mobile en.json and
// asserts these labels — if a V2 screen is renamed, update the map and the test
// together.
const APP_HELP_MAP_V2 = `APP HELP (map version 2026-06-14, V2 shell):
This section means the current learner message is an internal MentoMate app question. You DO have access to the app map below, and you are allowed and expected to answer internal app-navigation questions from it. Do not say you cannot help with the app. Do not treat app questions as off-topic. Do not treat app questions as assessment answers. Answer in plain chat text using the visible destination labels below.

Use this map only for internal MentoMate app questions: where to find things, how to change settings, what app modes mean, or how to use app features. Do not invent screens, buttons, routes, links, or capabilities. Use visible labels only. Keep the answer to one or two sentences, then return to the learning thread if one was active. When answering in a non-English conversation, keep destination labels exactly as shown in this map; translate only the surrounding explanation. Never state prices, plan costs, quota numbers, daily limits, or claim the app is free or unlimited — you do not have that information. For any question about cost, billing, plans, upgrades, or usage limits, point to the Subscription destination below (and to "Account, then Help & feedback" for billing problems) without quoting any numbers. Never invent a fixed review schedule or "every N days" cadence — reviews are adaptive; describe the concept and point to where reviews live, but do not promise a number.

The app has three tabs along the bottom — Mentor, Subjects, and Journal — plus your Account, which opens from your profile picture in the top-right corner.

Destinations:
- Getting started / what to do: Open the Mentor tab. Tap one of the suggested cards, or type or say what you need in the bar at the bottom. Use the camera or Homework button on that bar for help with an assignment.
- Help with an assignment / homework: Mentor tab, then the camera or Homework button on the bottom bar.
- Practice / reviews: Mentor tab — review and practice cards appear in your feed when something is due, and you can pick a lighter practice activity from the feed. Reviews are adaptive, so they appear when the mentor judges you are due rather than on a fixed schedule.
- How the Subjects tab is organised (subjects, books, topics): Open the Subjects tab to see your subjects; open a subject to see its books and topics. A "topic" is the smallest unit you study; a "book" is a collection of topics; a "subject" groups books.
- All notes / study notes you saved: Journal tab, then Saved notes (Study notes you saved).
- Past conversations / learning sessions: Journal tab, then Saved notes (Recent learning sessions).
- Saved explanations / bookmarks: Journal tab, then Saved notes (Saved mentor replies).
- Recaps of past sessions: Journal tab, then Recaps.
- Reports: Journal tab, then My reports.
- Mentor memory (what the mentor remembers about you): Journal tab, then Mentor memory. (It is also reachable from your Account.)
- Profile / account: Tap your profile picture (top-right) to open Account, then Profile.
- Account security: Tap your profile picture (top-right) to open Account, then Account security.
- Subscription, plan, upgrade, or billing (account owner): Tap your profile picture (top-right) to open Account, then Subscription. Do not quote any prices, tiers, or limits.
- App or mentor language: Tap your profile picture (top-right) to open Account, then Mentor language. This also sets the mentor's language.
- Notifications: Tap your profile picture (top-right) to open Account, then Notifications.
- Privacy & data / export / account deletion: Tap your profile picture (top-right) to open Account, then Privacy & data.
- Help & feedback: Tap your profile picture (top-right) to open Account, then Help & feedback.
- Preferences / learning accommodation: Tap your profile picture (top-right) to open Account, then Preferences.
- Challenge Round: An optional in-session check the mentor offers when the learner shows mastery. The learner accepts or declines per round; there is no global "mode" to toggle.
- Adding a child (parent / adult account owner): Tap your profile picture (top-right) to open Account, then Family settings, then Add a child.
- How often to review (review cadence): Reviews are adaptive — MentoMate brings a topic back when it judges you are due, based on how well you remembered it, rather than on a fixed "every N days" schedule. Review cards appear on your Mentor tab when something is due. Do not promise a specific number of days.

If you do not know a destination, say so and suggest opening your Account (profile picture, top-right), then Help & feedback.
Do not output internal route paths, Expo routes, markdown links, or URLs.`;

export function buildAppHelpPromptBlock(shell: AppShell = 'v0'): string {
  return shell === 'v2' ? APP_HELP_MAP_V2 : APP_HELP_MAP_V0;
}

// Specific multi-word phrases that are unambiguously about app navigation.
const APP_HELP_SPECIFIC =
  /\b(explorer mode|challenge mode|change mode|learning preferences|help section|help (&|and) feedback|progress (tab|page|screen|section)|mentor memory|my notes|delete.*account|export.*data|notification settings|past conversations?|old conversations?|previous sessions?)\b/i;

// Navigational frames that anchor common nouns to app-help. Keep this
// conservative: bare "notes" can mean music or worksheet notes in a lesson.
const APP_HELP_FRAMED =
  /\b(where (do i|can i) (find|see|change|access|get to) (my |the )?(notes|saved|saved replies|saved explanations|settings|preferences|bookmarks?|notifications?|profile|account|mode|library|app|sessions?|conversations?)\b|where (are|is) (my |the )?(notes about|notes for|notes from|saved|saved replies|saved explanations|settings|preferences|bookmarks?|notifications?|profile|mentor memory|sessions?|conversations?)\b|how do i (find|change|see|access|get to) (my |the )?(notes|saved|saved replies|saved explanations|settings|preferences|bookmarks?|notifications?|profile|account|mode|library|sessions?|conversations?)|my (notes|saved|settings|preferences|bookmarks?|notifications?|profile|account)\b|where can i see what you remember|what you remember about me)/i;

const APP_HELP_GENERAL =
  /\b(how (do|can) i use (this )?(app|mentomate)|how does (this )?(app|mentomate) work|what can i do (in|with) (this )?(app|mentomate)|what is (this )?(app|mentomate)|where (do|can) i start (in|with) (this )?(app|mentomate)|can you answer (internal )?(app|mentomate) questions|what (app|mentomate) questions can (i ask|you answer))\b/i;

// Account, family, billing, language, and the library/review concept. Carefully
// scoped so learning questions that merely contain "progress" / "plan" / "limit"
// / "chapter" do NOT match (e.g. "my progress in the textbook", "the limit as x
// approaches 0", "explain chapter 3 of the French Revolution"). Progress only
// matches as a named surface ("progress tab/page/screen/...") or when explicitly
// about a child. Library/topic/chapter only match when framed as an app concept
// ("what is a topic in the app", "how is the library organised", "how often
// should i review in the app").
const APP_HELP_ACCOUNT =
  /\b(add (a |my |another )?(child|kid|son|daughter)|create (a |another )?(child|kid)('?s)? (profile|account)|(child|children|kid|son|daughter)'?s progress|progress (tab|page|screen|section|view|dashboard)|upgrade|subscription|subscribe|billing|payment method|paid plan|free plan|more questions|out of questions|run out of questions|daily limit|question limit|usage limit|app language|mentor language|(change|switch|set) (the )?(app |mentor |ui )?language|is (this |the )?(app|it|mentomate) free|is it free|do i (have to |need to )?pay (for|to use)|does (the app|this app|mentomate) cost|how much (does|is) (the app|this app|mentomate))\b/i;

// Library-structure and review-cadence concept questions. Each clause is tight:
// "book"/"topic"/"chapter" are also ordinary study words, so structure clauses
// require an app anchor (organised/structured, or "...in the app/library", or
// the app-specific nouns library/shelf). Review-cadence requires the word
// "review" near a cadence frame — so "do a review of my essay" (a learning
// request) and "how often should I practice the piano" do NOT match, while
// "how often do I need to do a review" does.
const APP_HELP_LIBRARY =
  /\bspaced repetition\b|\breviews? (schedule|cadence|frequency|interval)\b|\bhow (often|frequently|much)[^.?!]{0,25}\breviews?\b|\bwhen (is|will|do|does|should)[^.?!]{0,20}\b(next review|review due|i review)\b|\bhow (is|are) (the |my )?(library|subjects?|books?|topics?|chapters?) (organi[sz]ed|structured|arranged|laid out|set up)\b|\b(what is|what are|what'?s) (a |the )?(topics?|chapters?|books?|subjects?|shelf|shelves)( and (a |the )?(topics?|chapters?|books?|subjects?))? (in|on) (the |this )?(app|mentomate|library)\b|\b(what'?s the )?difference between (a |the )?(book|topic|chapter|subject)s? and (a |the )?(book|topic|chapter|subject)s?\b|\b(what is|how does) (the )?(library|shelf)\b/i;

export function isAppHelpQuery(userMessage: string): boolean {
  if (!userMessage || userMessage.length < 5) return false;
  return (
    APP_HELP_SPECIFIC.test(userMessage) ||
    APP_HELP_FRAMED.test(userMessage) ||
    APP_HELP_GENERAL.test(userMessage) ||
    APP_HELP_ACCOUNT.test(userMessage) ||
    APP_HELP_LIBRARY.test(userMessage)
  );
}

export function buildAppHelpDirectReply(
  userMessage: string,
  shell: AppShell = 'v0',
): string {
  return shell === 'v2'
    ? buildAppHelpDirectReplyV2(userMessage)
    : buildAppHelpDirectReplyV0(userMessage);
}

function buildAppHelpDirectReplyV2(userMessage: string): string {
  const text = userMessage.toLowerCase();

  if (
    /\b(add (a |my |another )?(child|kid|son|daughter)|create (a |another )?(child|kid)('?s)? (profile|account))\b/.test(
      text,
    )
  ) {
    return 'You can add a child by tapping your profile picture (top-right) to open Account, then Family settings, then Add a child (you need to be the adult account owner).';
  }

  if (
    /\b(upgrade|subscription|subscribe|billing|payment method|paid plan|free plan|more questions|out of questions|run out of questions|daily limit|question limit|usage limit|is (this |the )?(app|it|mentomate) free|is it free|do i (have to |need to )?pay (for|to use)|does (the app|this app|mentomate) cost|how much (does|is) (the app|this app|mentomate))\b/.test(
      text,
    )
  ) {
    return "Your plan and upgrade options are in your Account — tap your profile picture (top-right), then Subscription. For billing problems, open Account, then Help & feedback. I can't quote prices or limits here.";
  }

  if (
    /\b(app language|mentor language|(change|switch|set) (the )?(app |mentor |ui )?language)\b/.test(
      text,
    )
  ) {
    return "You can change the language by tapping your profile picture (top-right) to open Account, then Mentor language. This also sets your mentor's language.";
  }

  if (
    /\bspaced repetition\b|\breviews? (schedule|cadence|frequency|interval)\b|\bhow (often|frequently|much)[^.?!]{0,25}\breviews?\b|\bwhen (is|will|do|does|should)[^.?!]{0,20}\b(next review|review due|i review)\b/.test(
      text,
    )
  ) {
    return "Reviews are adaptive — MentoMate brings a topic back when it judges you're due, rather than on a fixed schedule. Review cards appear on your Mentor tab when something is due.";
  }

  if (/\bnotes?\b/.test(text)) {
    return 'You can find your saved notes in the Journal tab, under Saved notes. Notes tied to a specific subject, book, or topic appear there too.';
  }

  if (/\b(saved|bookmarks?|saved replies|saved explanations)\b/.test(text)) {
    return 'Saved explanations are in the Journal tab, under Saved notes (Saved mentor replies).';
  }

  if (/\b(past|old|previous|sessions?|conversations?)\b/.test(text)) {
    return 'Past conversations are in the Journal tab, under Saved notes (Recent learning sessions).';
  }

  if (
    /\b(library|shelf|shelves|subjects?|books?|topics?|chapters?)\b/.test(text)
  ) {
    return 'Open the Subjects tab to see your subjects; open a subject to see its books and topics (sometimes grouped into chapters).';
  }

  if (/\b(preferences?|accommodation|learning accommodation)\b/.test(text)) {
    return 'Preferences are in your Account — tap your profile picture (top-right), then Preferences. Your learning accommodation is in the same place.';
  }

  if (/\b(challenge round)\b/.test(text)) {
    return 'A Challenge Round is an optional check the mentor offers in a session when you show mastery — you accept or decline each one, and a "ready for a challenge" card can also appear on your Mentor tab. There is no global mode to switch on or off.';
  }

  if (/\b(memory|remember)\b/.test(text)) {
    return 'You can see what the mentor remembers in the Journal tab, under Mentor memory.';
  }

  if (/\b(profile|account)\b/.test(text)) {
    return 'Profile and account details are in your Account — tap your profile picture (top-right).';
  }

  if (/\b(notifications?)\b/.test(text)) {
    return 'Notification settings are in your Account — tap your profile picture (top-right), then Notifications.';
  }

  if (/\b(privacy|data|export|delete)\b/.test(text)) {
    return 'Privacy, data export, and account deletion are in your Account — tap your profile picture (top-right), then Privacy & data.';
  }

  if (/\b(help|feedback)\b/.test(text)) {
    return 'Help and feedback are in your Account — tap your profile picture (top-right), then Help & feedback.';
  }

  if (/\b(homework|assignment)\b/.test(text)) {
    return 'For homework, open the Mentor tab and use the camera or Homework button on the bottom bar.';
  }

  if (/\b(practice|review|test yourself|knowledge check)\b/.test(text)) {
    return 'For practice and reviews, open the Mentor tab — review and practice cards appear in your feed when something is due.';
  }

  if (/\b(progress|child|parent)\b/.test(text)) {
    return 'Family settings are in your Account — tap your profile picture (top-right), then Family settings.';
  }

  if (APP_HELP_GENERAL.test(userMessage)) {
    return 'Yes - I can answer questions about where things are in MentoMate. Start on the Mentor tab, then use the Subjects and Journal tabs, or tap your profile picture (top-right) to open your Account.';
  }

  return 'I can answer app questions from the MentoMate app map. For anything not listed there, open your Account (profile picture, top-right), then Help & feedback.';
}

function buildAppHelpDirectReplyV0(userMessage: string): string {
  const text = userMessage.toLowerCase();

  if (
    /\b(add (a |my |another )?(child|kid|son|daughter)|create (a |another )?(child|kid)('?s)? (profile|account))\b/.test(
      text,
    )
  ) {
    return 'You can add a child from More > Add a child (you need to be the adult account owner).';
  }

  if (
    /\b(upgrade|subscription|subscribe|billing|payment method|paid plan|free plan|more questions|out of questions|run out of questions|daily limit|question limit|usage limit|is (this |the )?(app|it|mentomate) free|is it free|do i (have to |need to )?pay (for|to use)|does (the app|this app|mentomate) cost|how much (does|is) (the app|this app|mentomate))\b/.test(
      text,
    )
  ) {
    return "Your plan and upgrade options are in More > Profile, then Subscription. For billing problems, use More > Help & feedback. I can't quote prices or limits here.";
  }

  if (
    /\b(app language|mentor language|(change|switch|set) (the )?(app |mentor |ui )?language)\b/.test(
      text,
    )
  ) {
    return "You can change the app language in More > Profile, then App Language. This also sets your mentor's language.";
  }

  if (
    /\bspaced repetition\b|\breviews? (schedule|cadence|frequency|interval)\b|\bhow (often|frequently|much)[^.?!]{0,25}\breviews?\b|\bwhen (is|will|do|does|should)[^.?!]{0,20}\b(next review|review due|i review)\b/.test(
      text,
    )
  ) {
    return "Reviews are adaptive — MentoMate brings a topic back when it judges you're due, based on how well you remembered it, rather than on a fixed schedule. You can start a review anytime from Home > Test yourself.";
  }

  if (/\bnotes?\b/.test(text)) {
    return 'You can find all notes at Home > My Notes > Notes. For notes tied to a specific subject, book, or topic, go to Library > choose the subject, choose the book or topic > Your Notes.';
  }

  if (/\b(saved|bookmarks?|saved replies|saved explanations)\b/.test(text)) {
    return 'Saved explanations are in Home > My Notes > Bookmarks. You can also use Progress > tap Saved.';
  }

  if (/\b(past|old|previous|sessions?|conversations?)\b/.test(text)) {
    return 'Past conversations are in Home > My Notes > Sessions.';
  }

  // Library / topics / chapters concept. Reached only after the notes, saved,
  // and sessions branches above, so a note question never lands here.
  if (
    /\b(library|shelf|shelves|subjects?|books?|topics?|chapters?)\b/.test(text)
  ) {
    return 'In the Library, your learning is organised as subjects; inside a subject you have books, and inside a book you have topics (sometimes grouped into chapters). Open Library, choose a subject, then a book or topic to drill in.';
  }

  if (/\b(preferences?|accommodation|learning accommodation)\b/.test(text)) {
    return 'Preferences are in More > Preferences. Your learning accommodation is in More > Preferences > Your learning accommodation.';
  }

  if (/\b(challenge round)\b/.test(text)) {
    return 'A Challenge Round is an optional check the mentor offers in a session when you show mastery. You accept or decline each one — there is no global mode to switch on or off.';
  }

  if (/\b(memory|remember)\b/.test(text)) {
    return 'You can see mentor memory in More > Mentor memory.';
  }

  if (/\b(profile|account)\b/.test(text)) {
    return 'Profile and account details are in More > Profile.';
  }

  if (/\b(notifications?)\b/.test(text)) {
    return 'Notification settings are in More > Notifications.';
  }

  if (/\b(privacy|data|export|delete)\b/.test(text)) {
    return 'Privacy, data export, and account deletion are in More > Privacy & data.';
  }

  if (/\b(help|feedback)\b/.test(text)) {
    return 'Help and feedback are in More > Help & feedback.';
  }

  if (/\b(homework|assignment)\b/.test(text)) {
    return 'For homework, go to Home > Help with an assignment.';
  }

  if (/\b(practice|review|test yourself|knowledge check)\b/.test(text)) {
    return 'For practice and reviews, go to Home > Test yourself.';
  }

  if (/\b(progress|child|parent)\b/.test(text)) {
    return 'Open Progress, then pick the child you want to view.';
  }

  if (APP_HELP_GENERAL.test(userMessage)) {
    return 'Yes - I can answer questions about where things are in MentoMate. Start at Home and choose Ask anything, Help with an assignment, Test yourself, or Learn something new.';
  }

  return 'I can answer app questions from the MentoMate app map. For anything not listed there, go to More > Help & feedback.';
}

interface ParsedSignals {
  cleanResponse: string;
  understandingCheck: boolean;
  partialProgress: boolean;
  needsDeepening: boolean;
  notePrompt: boolean;
  notePromptPostSession: boolean;
  challengeRoundOffer?: boolean;
  challengeRoundEvaluation?: ChallengeRoundEvaluationItem[];
  noteDraft?: ChallengeRoundNoteDraftHint | null;
  fluencyDrill: unknown;
  readyToFinish: boolean;
}

export function applyAppHelpSignalGuard<T extends ParsedSignals>(parsed: T): T {
  return {
    ...parsed,
    partialProgress: false,
    needsDeepening: false,
    understandingCheck: false,
    notePrompt: false,
    notePromptPostSession: false,
    challengeRoundOffer: false,
    challengeRoundEvaluation: [],
    noteDraft: null,
    readyToFinish: false,
    fluencyDrill: null,
  };
}
