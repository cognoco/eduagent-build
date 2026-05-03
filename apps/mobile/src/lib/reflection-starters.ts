const REFLECTION_STARTERS = {
  en: {
    learning: [
      'Today I learned that...',
      'The most interesting thing was...',
      'I want to learn more about...',
      'Something that surprised me was...',
      'I found it easy/hard to...',
    ],
    freeform: [
      'I found out that...',
      'My question was about...',
      'The clearest answer was...',
      'Something unexpected was...',
      'Now I want to ask about...',
    ],
    homework: [
      'Today I practiced...',
      'The trick that helped me was...',
      'One step I understand better now is...',
      'The part I still want to practice is...',
      'Next time I will remember to...',
    ],
  },
  cs: {
    learning: [
      'Dnes jsem se naucil/a, ze...',
      'Nejzajimavejsi bylo...',
      'Chci se dozvedet vic o...',
      'Prekvapilo me, ze...',
      'Slo mi snadno/tezko...',
    ],
    freeform: [
      'Zjistil/a jsem, ze...',
      'Moje otazka byla o...',
      'Nejvic mi pomohlo zjistit...',
      'Prekvapilo me...',
      'Ted se chci zeptat na...',
    ],
    homework: [
      'Dnes jsem si procvicil/a...',
      'Pomohlo mi, ze...',
      'Lip uz rozumim kroku...',
      'Jeste si chci procvicit...',
      'Priste si zapamatuju, ze...',
    ],
  },
} as const;

export type ReflectionStarterLanguage = keyof typeof REFLECTION_STARTERS;
export type ReflectionStarterSessionType =
  | keyof (typeof REFLECTION_STARTERS)['en'];

export function getReflectionStarters(
  sessionType: ReflectionStarterSessionType,
  language?: string | null
): readonly string[] {
  const normalizedLanguage = language?.toLowerCase() === 'cs' ? 'cs' : 'en';

  return REFLECTION_STARTERS[normalizedLanguage][sessionType];
}
