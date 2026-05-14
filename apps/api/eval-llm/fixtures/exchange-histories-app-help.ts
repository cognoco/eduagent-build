import type { HistoryTurn } from './exchange-histories';

export const HISTORY_APP_HELP_NOTES: HistoryTurn[] = [
  {
    role: 'assistant',
    content:
      'Let us look at how plants convert sunlight into energy. What do you already know about this process?',
  },
  {
    role: 'user',
    content: 'Where do I find my notes?',
  },
];

export const HISTORY_APP_HELP_PREFERENCES: HistoryTurn[] = [
  {
    role: 'assistant',
    content:
      'Let us look at how plants convert sunlight into energy. What do you already know about this process?',
  },
  {
    role: 'user',
    content: 'How do I change learning preferences?',
  },
];

export const HISTORY_APP_HELP_MODES: HistoryTurn[] = [
  {
    role: 'assistant',
    content:
      'Let us look at how plants convert sunlight into energy. What do you already know about this process?',
  },
  {
    role: 'user',
    content: "What's the difference between Explorer and Challenge mode?",
  },
];

export const HISTORY_APP_HELP_MEMORY: HistoryTurn[] = [
  {
    role: 'assistant',
    content:
      'Let us look at how plants convert sunlight into energy. What do you already know about this process?',
  },
  {
    role: 'user',
    content: 'Where can I see what you remember about me?',
  },
];
