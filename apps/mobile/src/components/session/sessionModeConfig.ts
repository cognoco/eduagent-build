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
      "Got it. Let's work through this together.\n\nWhat do you think the first step is?",
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
  freeform: {
    title: 'Chat',
    subtitle: 'Ask anything',
    placeholder: "What's on your mind?",
    openingMessage: "What's on your mind? I'm ready when you are.",
    showTimer: false,
    showQuestionCount: false,
  },
};

const DEFAULT_CONFIG = SESSION_MODE_CONFIGS.freeform;

export function getModeConfig(mode: string): SessionModeConfig {
  return SESSION_MODE_CONFIGS[mode] ?? DEFAULT_CONFIG;
}

// ---------------------------------------------------------------------------
// Cold-start coaching voice (sessions 1-5)
// ---------------------------------------------------------------------------

const FIRST_SESSION: Record<string, string> = {
  homework:
    "Welcome! I'm your learning coach. Let's tackle this homework together. What are you working on?",
  learning:
    "Hey there! I'm excited to learn with you. What topic would you like to explore?",
  practice:
    "Welcome to your first practice session! Let's see what you know. Ready?",
  freeform:
    "Hi! I'm your learning coach. Feel free to ask me anything — I'm here to help.",
};

const EARLY_SESSIONS: Record<string, string> = {
  homework: 'Good to see you again! What homework are we tackling today?',
  learning: 'Back for more learning — awesome! What shall we dive into?',
  practice: "Ready for another round? Let's test your knowledge.",
  freeform: "Hey again! What's on your mind today?",
};

const FAMILIAR_SESSIONS: Record<string, string> = {
  homework: "Let's get this homework done. What do you need help with?",
  learning: 'What do you remember from our last session?',
  practice: "Quick: what's the key concept we covered?",
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
 * @param mode - Session mode (homework, learning, practice, freeform)
 * @param sessionExperience - longestStreak from streaks API (proxy for experience)
 * @param problemText - Optional pre-filled problem text (homework OCR)
 */
export function getOpeningMessage(
  mode: string,
  sessionExperience: number,
  problemText?: string
): string {
  if (problemText) return "Got it. Let's work through this together.";

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
