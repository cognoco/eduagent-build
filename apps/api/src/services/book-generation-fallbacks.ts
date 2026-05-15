import type {
  BookGenerationResult,
  BookTopicGenerationResult,
  GeneratedBook,
  GeneratedTopic,
} from '@eduagent/schemas';

const BROAD_BOOKS_BY_SUBJECT: Record<string, GeneratedBook[]> = {
  history: [
    {
      title: 'Ancient Civilizations',
      description: 'Early societies, rulers, cities, and everyday life.',
      emoji: '🏺',
      sortOrder: 1,
    },
    {
      title: 'Medieval and Early Modern Worlds',
      description: 'Kingdoms, religions, trade, exploration, and conflict.',
      emoji: '🏰',
      sortOrder: 2,
    },
    {
      title: 'Revolutions and Modern Change',
      description: 'Ideas, revolutions, empires, industry, and reform.',
      emoji: '⚖️',
      sortOrder: 3,
    },
    {
      title: 'The Twentieth Century',
      description: 'World wars, independence movements, and global change.',
      emoji: '🌍',
      sortOrder: 4,
    },
    {
      title: 'People and Primary Sources',
      description: 'How historians use evidence to understand the past.',
      emoji: '📜',
      sortOrder: 5,
    },
  ],
  biology: [
    {
      title: 'Cells and Living Systems',
      description: 'Cells, tissues, organs, and how living things work.',
      emoji: '🔬',
      sortOrder: 1,
    },
    {
      title: 'Plants and Photosynthesis',
      description: 'Plant structures, growth, energy, and ecosystems.',
      emoji: '🌱',
      sortOrder: 2,
    },
    {
      title: 'Animals and Human Biology',
      description: 'Body systems, behavior, health, and adaptation.',
      emoji: '🫀',
      sortOrder: 3,
    },
    {
      title: 'Genetics and Evolution',
      description: 'Inheritance, variation, natural selection, and change.',
      emoji: '🧬',
      sortOrder: 4,
    },
    {
      title: 'Ecology',
      description:
        'Food webs, habitats, populations, and environmental change.',
      emoji: '🌿',
      sortOrder: 5,
    },
  ],
  science: [
    {
      title: 'Life Science',
      description: 'Living things, ecosystems, and the human body.',
      emoji: '🌿',
      sortOrder: 1,
    },
    {
      title: 'Earth and Space',
      description: 'Earth systems, weather, rocks, planets, and stars.',
      emoji: '🌎',
      sortOrder: 2,
    },
    {
      title: 'Matter and Chemistry',
      description: 'Atoms, substances, reactions, and materials.',
      emoji: '⚗️',
      sortOrder: 3,
    },
    {
      title: 'Forces and Energy',
      description: 'Motion, forces, waves, electricity, and energy transfer.',
      emoji: '⚡',
      sortOrder: 4,
    },
  ],
  geography: [
    {
      title: 'Maps and Places',
      description: 'Location, scale, map skills, and spatial patterns.',
      emoji: '🗺️',
      sortOrder: 1,
    },
    {
      title: 'Physical Geography',
      description: 'Landforms, climate, water, and natural processes.',
      emoji: '⛰️',
      sortOrder: 2,
    },
    {
      title: 'People and Places',
      description: 'Population, culture, cities, migration, and work.',
      emoji: '🏙️',
      sortOrder: 3,
    },
    {
      title: 'Environment and Resources',
      description: 'Resource use, sustainability, hazards, and change.',
      emoji: '🌊',
      sortOrder: 4,
    },
  ],
  mathematics: [
    {
      title: 'Numbers and Operations',
      description:
        'Number sense, arithmetic, fractions, and proportional thinking.',
      emoji: '🔢',
      sortOrder: 1,
    },
    {
      title: 'Algebra',
      description: 'Expressions, equations, patterns, and functions.',
      emoji: '𝑥',
      sortOrder: 2,
    },
    {
      title: 'Geometry',
      description: 'Shapes, angles, measurement, area, and volume.',
      emoji: '📐',
      sortOrder: 3,
    },
    {
      title: 'Data and Probability',
      description: 'Graphs, statistics, chance, and interpreting data.',
      emoji: '📊',
      sortOrder: 4,
    },
  ],
  music: [
    {
      title: 'Rhythm and Notation',
      description: 'Reading, counting, and writing musical patterns.',
      emoji: '🎼',
      sortOrder: 1,
    },
    {
      title: 'Melody and Harmony',
      description: 'Scales, intervals, chords, and how music fits together.',
      emoji: '🎹',
      sortOrder: 2,
    },
    {
      title: 'Listening and Styles',
      description: 'Genres, instruments, form, and musical interpretation.',
      emoji: '🎧',
      sortOrder: 3,
    },
  ],
};

const BROAD_SUBJECT_ALIASES: Record<string, string> = {
  math: 'mathematics',
  maths: 'mathematics',
  worldhistory: 'history',
  socialstudies: 'history',
  lifescience: 'biology',
};

function normalizeSubjectName(subjectName: string): string {
  return subjectName.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function displayName(value: string): string {
  return value.trim() || 'this subject';
}

export function buildFallbackSubjectStructure(
  subjectName: string,
): BookGenerationResult {
  const normalized = normalizeSubjectName(subjectName);
  const broadKey = BROAD_SUBJECT_ALIASES[normalized] ?? normalized;
  const broadBooks = BROAD_BOOKS_BY_SUBJECT[broadKey];

  if (broadBooks) {
    return {
      type: 'broad',
      books: broadBooks,
    };
  }

  const subject = displayName(subjectName);
  const topics: GeneratedTopic[] = [
    {
      title: `Getting oriented in ${subject}`,
      description: `Build a clear starting map for ${subject}.`,
      relevance: 'core',
      estimatedMinutes: 15,
    },
    {
      title: `Key words in ${subject}`,
      description: 'Learn the terms that make explanations easier to follow.',
      relevance: 'core',
      estimatedMinutes: 15,
    },
    {
      title: `Core ideas in ${subject}`,
      description: `Understand the main ideas that show up again and again in ${subject}.`,
      relevance: 'core',
      estimatedMinutes: 20,
    },
    {
      title: `Worked examples in ${subject}`,
      description: 'Walk through examples step by step and explain each move.',
      relevance: 'core',
      estimatedMinutes: 20,
    },
    {
      title: `Common mistakes in ${subject}`,
      description: 'Spot confusing parts early and practice avoiding them.',
      relevance: 'recommended',
      estimatedMinutes: 15,
    },
    {
      title: `Practice questions in ${subject}`,
      description: 'Try short questions and check understanding as you go.',
      relevance: 'core',
      estimatedMinutes: 20,
    },
    {
      title: `Real examples of ${subject}`,
      description: `Connect ${subject} to examples from school, work, or daily life.`,
      relevance: 'contemporary',
      estimatedMinutes: 15,
    },
    {
      title: `Quick review of ${subject}`,
      description:
        'Pull the main points together and decide what to learn next.',
      relevance: 'core',
      estimatedMinutes: 10,
    },
  ];

  return {
    type: 'narrow',
    topics,
  };
}

export function buildFallbackBookTopics(
  bookTitle: string,
  bookDescription: string,
): BookTopicGenerationResult {
  const title = displayName(bookTitle);
  const description = bookDescription.trim();
  const context = description || `Learn the essentials of ${title}.`;

  return {
    topics: [
      {
        title: `Start with ${title}`,
        description: context,
        chapter: 'Getting started',
        sortOrder: 1,
        estimatedMinutes: 15,
      },
      {
        title: `Key ideas in ${title}`,
        description: `Break ${title} into the few ideas that matter most first.`,
        chapter: 'Getting started',
        sortOrder: 2,
        estimatedMinutes: 20,
      },
      {
        title: `Important words for ${title}`,
        description:
          'Learn the vocabulary that makes the topic easier to explain.',
        chapter: 'Core understanding',
        sortOrder: 3,
        estimatedMinutes: 15,
      },
      {
        title: `Examples of ${title}`,
        description: 'Use concrete examples to make the topic less abstract.',
        chapter: 'Core understanding',
        sortOrder: 4,
        estimatedMinutes: 20,
      },
      {
        title: `Practice with ${title}`,
        description:
          'Answer short questions and explain the reasoning out loud.',
        chapter: 'Practice',
        sortOrder: 5,
        estimatedMinutes: 20,
      },
      {
        title: `Review ${title}`,
        description:
          'Summarize what stuck, what is confusing, and what to study next.',
        chapter: 'Practice',
        sortOrder: 6,
        estimatedMinutes: 10,
      },
    ],
    connections: [
      {
        topicA: `Start with ${title}`,
        topicB: `Key ideas in ${title}`,
      },
      {
        topicA: `Key ideas in ${title}`,
        topicB: `Examples of ${title}`,
      },
      {
        topicA: `Examples of ${title}`,
        topicB: `Practice with ${title}`,
      },
    ],
  };
}
