export interface SessionModeConfig {
  title: string;
  subtitle: string;
  placeholder: string;
  openingMessage: string;
  showTimer: boolean;
  showQuestionCount: boolean;
}

export const SESSION_MODE_CONFIGS: Record<string, SessionModeConfig> = {
  homework: {
    title: 'Homework Help',
    subtitle: "Let's work through this together",
    placeholder: 'Describe what you need help with...',
    openingMessage:
      "Got it. Let's work through this together.\n\nI'll keep it brief and clear. Use the buttons below to choose.",
    showTimer: false,
    showQuestionCount: true,
  },
  practice: {
    title: 'Practice Session',
    subtitle: 'Test your knowledge',
    placeholder: 'Your answer...',
    openingMessage:
      "Let's see what you remember.\n\nQuick: what's the key concept we covered?",
    showTimer: true,
    showQuestionCount: false,
  },
  learning: {
    title: 'Learning Session',
    subtitle: 'Building understanding',
    placeholder: 'Type a message...',
    openingMessage:
      "Great, let's pick up where we left off. What do you remember from our last session?",
    showTimer: false,
    showQuestionCount: false,
  },
  relearn: {
    title: 'Relearn',
    subtitle: 'A fresh angle on this topic',
    placeholder: 'Type a message...',
    openingMessage:
      "Let's approach this one differently. What felt unclear last time?",
    showTimer: false,
    showQuestionCount: false,
  },
  review: {
    title: 'Review',
    subtitle: 'Refresh what you know',
    placeholder: 'Your answer...',
    openingMessage:
      'Quick refresh — tell me the core idea from this topic in your own words.',
    showTimer: true,
    showQuestionCount: false,
  },
  recitation: {
    title: 'Recitation (Beta)',
    subtitle: 'Recite from memory',
    placeholder: 'Say or type the title...',
    openingMessage:
      "What would you like to recite? A poem, song lyrics, or something else you've memorised?",
    showTimer: false,
    showQuestionCount: false,
  },
  freeform: {
    title: 'Chat',
    subtitle: 'Ask anything',
    placeholder: "What's on your mind?",
    openingMessage: "What's on your mind? I'm ready when you are.",
    showTimer: false,
    showQuestionCount: false,
  },
};

const DEFAULT_CONFIG = SESSION_MODE_CONFIGS.freeform!;

export function getModeConfig(mode: string): SessionModeConfig {
  return SESSION_MODE_CONFIGS[mode] ?? DEFAULT_CONFIG;
}

// ---------------------------------------------------------------------------
// Cold-start coaching voice (sessions 1-5)
// ---------------------------------------------------------------------------

const FIRST_SESSION: Record<string, string> = {
  homework:
    "Welcome! I'm your learning mate. Let's tackle this homework together. What are you working on?",
  learning:
    "Hi! I'm your learning mate. I'll teach you stuff and check if it sticks — ask me anything along the way. Ready to start?",
  practice:
    "Welcome to your first practice session! Let's see what you know. Ready?",
  recitation:
    "Hi! I'll listen while you recite something from memory — a poem, song lyrics, anything. What would you like to recite?",
  freeform:
    "Hi! I'm your learning mate. Feel free to ask me anything — I'm here to help.",
};

const EARLY_SESSIONS: Record<string, string> = {
  homework: 'Good to see you again! What homework are we tackling today?',
  learning: 'Back for more learning — awesome! What shall we dive into?',
  practice: "Ready for another round? Let's test your knowledge.",
  recitation:
    'Ready for another recitation? What would you like to recite today?',
  freeform: "Hey again! What's on your mind today?",
};

const FAMILIAR_SESSIONS: Record<string, string> = {
  homework: "Let's get this homework done. What do you need help with?",
  learning: 'What do you remember from our last session?',
  practice: "Quick: what's the key concept we covered?",
  recitation: 'What are we reciting today?',
  freeform: "What's on your mind? I'm ready when you are.",
};

/**
 * Returns a session-count-aware opening message.
 *
 * Sessions 1-5 use progressively warmer greetings (cold-start coaching voice):
 *   - Session 1 (experience 0): extra welcoming, introduces the coach
 *   - Sessions 2-3 (experience 1-2): warm, building familiarity
 *   - Sessions 4-5 (experience 3-4): familiar, casual
 *   - Session 6+ (experience >= 5): standard brief messages from config
 *
 * When a topic name is provided (e.g. from the library), the greeting is
 * tailored to that topic so the learner knows the session is contextual.
 * When only a subject name is available (e.g. from a home screen card),
 * the greeting references the subject so the learner sees continuity.
 *
 * @param mode - Session mode (homework, learning, practice, freeform)
 * @param sessionExperience - longestStreak from streaks API (proxy for experience)
 * @param problemText - Optional pre-filled problem text (homework OCR)
 * @param topicName - Optional topic title when launched from the library
 * @param subjectName - Optional subject name when launched from a home card
 */
export function getOpeningMessage(
  mode: string,
  sessionExperience: number,
  problemText?: string,
  topicName?: string,
  subjectName?: string,
  rawInput?: string
): string {
  if (problemText) {
    return "Got it. Let's work through this together. I'll keep it brief and clear.";
  }

  if (rawInput && topicName) {
    return `Let's explore ${rawInput}! I'll start with something interesting.`;
  }
  if (rawInput && !topicName) {
    return `I see you're curious about "${rawInput}" — let's dive in!`;
  }

  if (topicName) {
    if (sessionExperience <= 0) {
      return `Today we're starting with "${topicName}". I'll explain the key ideas and check they make sense — jump in anytime if something's unclear.`;
    }
    if (sessionExperience <= 2) {
      return `Let's dive into "${topicName}". Ready to start, or is there something specific you'd like to focus on?`;
    }
    return `"${topicName}" — ready when you are. Want me to start, or do you have a preference?`;
  }

  if (subjectName) {
    if (sessionExperience <= 0) {
      return `Let's work on ${subjectName} together. Where would you like to start?`;
    }
    if (sessionExperience <= 2) {
      return `Back to ${subjectName} — want to pick up where we left off, or try something new?`;
    }
    return `${subjectName} — ready when you are. What shall we work on?`;
  }

  if (sessionExperience <= 0) {
    return FIRST_SESSION[mode] ?? FIRST_SESSION.freeform!;
  }

  if (sessionExperience <= 2) {
    return EARLY_SESSIONS[mode] ?? EARLY_SESSIONS.freeform!;
  }

  if (sessionExperience <= 4) {
    return FAMILIAR_SESSIONS[mode] ?? FAMILIAR_SESSIONS.freeform!;
  }

  // Session 6+ — standard brief messages
  const config = SESSION_MODE_CONFIGS[mode] ?? DEFAULT_CONFIG;
  return config.openingMessage;
}
