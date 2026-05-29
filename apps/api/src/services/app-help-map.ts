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
// Map version: 2026-05-29

const APP_HELP_MAP = `APP HELP (map version 2026-05-29):
This section means the current learner message is an internal MentoMate app question. You DO have access to the app map below, and you are allowed and expected to answer internal app-navigation questions from it. Do not say you cannot help with the app. Do not treat app questions as off-topic. Do not treat app questions as assessment answers. Answer in plain chat text using the visible destination labels below.

Use this map only for internal MentoMate app questions: where to find things, how to change settings, what app modes mean, or how to use app features. Do not invent screens, buttons, routes, links, or capabilities. Use visible labels only. Keep the answer to one or two sentences, then return to the learning thread if one was active. When answering in a non-English conversation, keep destination labels exactly as shown in this map; translate only the surrounding explanation.

Destinations:
- Getting started / what to do: Home > choose Ask anything, Help with an assignment, Test yourself, or Learn something new.
- All notes: Home > My Notes > Notes.
- Topic or book notes: Library > choose the subject, choose the book or topic > Your Notes.
- Past conversations: Home > My Notes > Sessions.
- Saved explanations / bookmarks: Home > My Notes > Bookmarks. They can also use Progress > tap Saved.
- Preferences: More > Preferences (under "Your learning").
- Learning accommodation: More > Preferences > Your learning accommodation.
- Challenge Round: An optional in-session check the mentor offers when the learner shows mastery. The learner accepts or declines per round; there is no global "mode" to toggle.
- Mentor memory: More > Mentor memory.
- Profile / account: More > Profile.
- Notifications: More > Notifications.
- Privacy & data / export / account deletion: More > Privacy & data.
- Help & feedback: More > Help & feedback.
- Homework: Home > Help with an assignment.
- Practice / reviews: Home > Test yourself.
- Viewing a child's progress (parent): Open Progress, then pick the child you want to view.
- Changing a child's preferences (parent): Open Progress, pick the child, then open the "<child name>'s learning preferences" row.

If you do not know a destination, say so and suggest "More > Help & feedback".
Do not output internal route paths, Expo routes, markdown links, or URLs.`;

export function buildAppHelpPromptBlock(): string {
  return APP_HELP_MAP;
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

export function isAppHelpQuery(userMessage: string): boolean {
  if (!userMessage || userMessage.length < 5) return false;
  return (
    APP_HELP_SPECIFIC.test(userMessage) ||
    APP_HELP_FRAMED.test(userMessage) ||
    APP_HELP_GENERAL.test(userMessage)
  );
}

export function buildAppHelpDirectReply(userMessage: string): string {
  const text = userMessage.toLowerCase();

  if (/\bnotes?\b/.test(text)) {
    return 'You can find all notes at Home > My Notes > Notes. For notes tied to a specific subject, book, or topic, go to Library > choose the subject, choose the book or topic > Your Notes.';
  }

  if (/\b(saved|bookmarks?|saved replies|saved explanations)\b/.test(text)) {
    return 'Saved explanations are in Home > My Notes > Bookmarks. You can also use Progress > tap Saved.';
  }

  if (/\b(past|old|previous|sessions?|conversations?)\b/.test(text)) {
    return 'Past conversations are in Home > My Notes > Sessions.';
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
