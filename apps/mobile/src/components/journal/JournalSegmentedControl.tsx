import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

import { JOURNAL_SECTION_IDS, type JournalSectionId } from './journal-shared';

// Landing order drives the two-row count-driven grid: the first row fills with
// the first three, the rest wrap. Adding a sixth button simply flows to the
// next row — no layout change required.
function sectionTitle(section: JournalSectionId, t: TFunction): string {
  switch (section) {
    case 'notes':
      return t('journal.sections.notes');
    case 'sessions':
      return t('journal.sections.sessions');
    case 'practice':
      return t('journal.sections.practice');
    case 'memory':
      return t('journal.sections.memory');
    case 'reports':
      return t('journal.sections.reports');
  }
}

export function JournalSegmentedControl({
  value,
  onChange,
}: {
  value: JournalSectionId;
  onChange: (value: JournalSectionId) => void;
}): React.ReactElement {
  const { t } = useTranslation();

  // Count-driven two-row grid. `basis-[30%]` seats three buttons per row; the
  // remainder wraps and `grow` lets them fill the row. With five sections this
  // renders 3 + 2; a sixth flows naturally to the second row. Bigger tap
  // targets + single-line labels make the sections obvious on landing and end
  // the small-screen truncation ("Saved not…", "Mentor m…").
  return (
    <View
      className="flex-row flex-wrap gap-2"
      testID="journal-segmented-control"
    >
      {JOURNAL_SECTION_IDS.map((section) => {
        const selected = value === section;
        return (
          <Pressable
            key={section}
            onPress={() => onChange(section)}
            className={`min-h-[56px] grow basis-[30%] items-center justify-center rounded-card border px-2 py-3 ${
              selected
                ? 'border-primary bg-surface'
                : 'border-border bg-surface-elevated'
            }`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={sectionTitle(section, t)}
            testID={`journal-tab-${section}`}
          >
            <Text
              className={`text-body font-semibold text-center ${
                selected ? 'text-text-primary' : 'text-text-secondary'
              }`}
              numberOfLines={1}
            >
              {sectionTitle(section, t)}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
