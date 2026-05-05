// ---------------------------------------------------------------------------
// Curated Memory View — Parent-facing categorized presentation of learning profile
// ---------------------------------------------------------------------------

export type MemoryCategoryKey =
  | 'struggles'
  | 'interests'
  | 'strengths'
  | 'communicationNotes'
  | 'learningStyle';

export interface CuratedMemoryItem {
  category: MemoryCategoryKey;
  value: string;
  statement: string;
}

export interface MemoryCategory {
  label: string;
  items: CuratedMemoryItem[];
}

export interface ParentTellItem {
  id: string;
  content: string;
  createdAt: string;
}

export interface CuratedMemoryView {
  categories: MemoryCategory[];
  parentContributions: ParentTellItem[];
  settings: {
    memoryEnabled: boolean;
    collectionEnabled: boolean;
    injectionEnabled: boolean;
    accommodationMode: string | null;
  };
}

// ---------------------------------------------------------------------------
// Column → Label mapping
// ---------------------------------------------------------------------------

const CATEGORY_CONFIG: Array<{
  key: MemoryCategoryKey;
  label: string;
}> = [
  { key: 'interests', label: 'Interests' },
  { key: 'strengths', label: 'Strengths' },
  { key: 'struggles', label: 'Struggles with' },
  { key: 'communicationNotes', label: 'Learning pace & notes' },
  { key: 'learningStyle', label: 'Learning style' },
];

// ---------------------------------------------------------------------------
// Learning style serialization
// ---------------------------------------------------------------------------

const STYLE_FIELD_LABELS: Record<string, (v: string) => string> = {
  modality: (v) => `Prefers ${v} learning`,
  pacing: (v) => `Prefers ${v} pacing`,
  scaffolding: (v) => `Responds to ${v} scaffolding`,
  feedback: (v) => `Prefers ${v} feedback`,
  engagement: (v) => `${capitalize(v)} engagement style`,
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function serializeLearningStyle(
  style: Record<string, unknown> | null
): CuratedMemoryItem[] {
  if (!style || typeof style !== 'object') return [];

  const items: CuratedMemoryItem[] = [];
  for (const [field, rawValue] of Object.entries(style)) {
    if (rawValue == null || typeof rawValue !== 'string') continue;
    const labelFn = STYLE_FIELD_LABELS[field];
    const statement = labelFn
      ? labelFn(rawValue)
      : `${capitalize(field)}: ${rawValue}`;
    items.push({ category: 'learningStyle', value: field, statement });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Strength / Struggle item builders
// ---------------------------------------------------------------------------

interface StrengthEntry {
  subject: string;
  topics: string[];
}

interface StruggleEntry {
  topic: string;
  subject?: string;
  severity?: string;
}

function buildStrengthItems(strengths: unknown[]): CuratedMemoryItem[] {
  return (strengths as StrengthEntry[]).map((entry) => ({
    category: 'strengths' as const,
    value: entry.subject,
    statement: `Strong in ${entry.subject}: ${entry.topics.join(', ')}`,
  }));
}

function buildStruggleItems(struggles: unknown[]): CuratedMemoryItem[] {
  return (struggles as StruggleEntry[]).map((entry) => ({
    category: 'struggles' as const,
    value: entry.topic,
    statement: entry.subject
      ? `Struggles with ${entry.topic} (${entry.subject})`
      : `Struggles with ${entry.topic}`,
  }));
}

function buildStringArrayItems(
  items: unknown[],
  category: MemoryCategoryKey,
  formatter: (s: string) => string
): CuratedMemoryItem[] {
  return items.flatMap((item) => {
    const value =
      typeof item === 'string'
        ? item
        : item &&
          typeof item === 'object' &&
          'label' in item &&
          typeof item.label === 'string'
        ? item.label
        : null;
    if (!value) return [];
    return [
      {
        category,
        value,
        statement: formatter(value),
      },
    ];
  });
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildCuratedMemoryView(profile: {
  interests?: unknown;
  strengths?: unknown;
  struggles?: unknown;
  communicationNotes?: unknown;
  learningStyle?: unknown;
  memoryEnabled?: boolean;
  memoryCollectionEnabled?: boolean;
  memoryInjectionEnabled?: boolean;
  memoryConsentStatus?: string | null;
  accommodationMode?: string | null;
}): CuratedMemoryView {
  const categories: MemoryCategory[] = [];

  for (const config of CATEGORY_CONFIG) {
    let items: CuratedMemoryItem[];

    switch (config.key) {
      case 'interests':
        items = Array.isArray(profile.interests)
          ? buildStringArrayItems(
              profile.interests,
              'interests',
              (v) => `Interested in ${v}`
            )
          : [];
        break;
      case 'strengths':
        items = Array.isArray(profile.strengths)
          ? buildStrengthItems(profile.strengths)
          : [];
        break;
      case 'struggles':
        items = Array.isArray(profile.struggles)
          ? buildStruggleItems(profile.struggles)
          : [];
        break;
      case 'communicationNotes':
        items = Array.isArray(profile.communicationNotes)
          ? buildStringArrayItems(
              profile.communicationNotes,
              'communicationNotes',
              (v) => capitalize(v)
            )
          : [];
        break;
      case 'learningStyle':
        items = serializeLearningStyle(
          (profile.learningStyle as Record<string, unknown> | null) ?? null
        );
        break;
    }

    if (items.length > 0) {
      categories.push({ label: config.label, items });
    }
  }

  return {
    categories,
    // Raw parent tell texts are not persisted separately — see spec correction note.
    // When tell-text persistence is added, query them here.
    parentContributions: [],
    settings: {
      memoryEnabled: profile.memoryEnabled ?? true,
      collectionEnabled: profile.memoryCollectionEnabled ?? false,
      // [F-PV-09] Gate injection on consent — if consent is not granted,
      // injection must be off regardless of the DB flag.
      injectionEnabled:
        profile.memoryConsentStatus === 'granted' &&
        (profile.memoryInjectionEnabled ?? true),
      accommodationMode: profile.accommodationMode ?? null,
    },
  };
}
