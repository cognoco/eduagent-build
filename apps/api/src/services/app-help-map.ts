// App Help Map - server-owned static map of user-facing destinations.
//
// Every label MUST match the exact i18n string visible in the app. Tests in
// app-help-map.test.ts read the mobile en.json source and assert exact matches.
// If a screen is renamed, update the map and the tests together.
//
// Map version: 2026-05-13

const APP_HELP_MAP = `APP HELP (map version 2026-05-13):
If the learner asks how to find, change, or understand something in the app, answer from this map in plain chat text. Do not invent screens, buttons, routes, links, or capabilities. Use visible labels only. Keep the answer to one or two sentences, then return to the learning thread if one was active. When answering in a non-English conversation, translate the destination labels to match the language you are speaking.

Destinations:
- Notes: Library > choose the subject, book, or topic > Your Notes.
- Saved explanations / bookmarks: Progress > tap Saved.
- Preferences: More > Preferences (under "Your learning").
- Learning accommodation: More > Preferences > Your learning accommodation.
- Explorer mode: Relaxed, flexible learning. The mentor is more encouraging, and the learner can move at their own pace.
- Challenge mode: More focused learning. The mentor keeps the learner on track and asks for stronger proof of understanding.
- Changing Explorer / Challenge: In a session, tap the mode button in the session header. Outside a session, use More > Preferences.
- Mentor memory: More > Mentor memory.
- Profile / account: More > Profile.
- Notifications: More > Notifications.
- Privacy & data / export / account deletion: More > Privacy & data.
- Help & feedback: More > Help & feedback.
- Homework: Home > Help with an assignment.
- Practice / reviews: Home > Test yourself.
- Viewing a child's progress (parent): Home > tap the child's card.
- Changing a child's preferences (parent): Switch to the child's profile using the profile selector, then use More > Preferences as normal.

If you do not know a destination, say so and suggest "More > Help & feedback".
Do not output internal route paths, Expo routes, markdown links, or URLs.`;

export function buildAppHelpPromptBlock(): string {
  return APP_HELP_MAP;
}

// Specific multi-word phrases that are unambiguously about app navigation,
// plus possessive/navigational frames that anchor common nouns to app-help.
const APP_HELP_SPECIFIC =
  /\b(explorer mode|challenge mode|change mode|learning preferences|help section|mentor memory|delete.*account|export.*data|notification settings)\b/i;
const APP_HELP_FRAMED =
  /\b(where (do i|are my|can i|is the) (find|see|change|access|get to) (my |the )?(notes|saved|settings|preferences|bookmarks?|notifications?|profile|account|mode|app|help)\b|how do i (find|change|see|access|get to) (my |the )?(notes|saved|settings|preferences|bookmarks?|notifications?|profile|account|mode)|my (notes|saved|settings|preferences|bookmarks?|notifications?|profile|account)\b|(where are|where is|where can i find) (my )?(notes|saved|settings|preferences|bookmarks?|notifications?|profile|help|mentor memory)|where can i see what you remember|what you remember about me)/i;

export function isAppHelpQuery(userMessage: string): boolean {
  if (!userMessage || userMessage.length < 5) return false;
  return (
    APP_HELP_SPECIFIC.test(userMessage) || APP_HELP_FRAMED.test(userMessage)
  );
}

interface ParsedSignals {
  cleanResponse: string;
  understandingCheck: boolean;
  partialProgress: boolean;
  needsDeepening: boolean;
  notePrompt: boolean;
  notePromptPostSession: boolean;
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
    readyToFinish: false,
    fluencyDrill: null,
  };
}
