import { render, screen } from '@testing-library/react-native';
import { unstable_settings } from './_layout';

jest.mock(
  '../../../components/journal/JournalTabView' /* gc1-allow: route smoke test verifies the page mounts the real landing component boundary */,
  () => ({
    JournalTabView: () => {
      const { Text, View } = require('react-native');
      return (
        <View testID="journal-tab-view">
          <Text>Journal landing</Text>
        </View>
      );
    },
  }),
);

const JournalScreen = require('./index').default;

describe('JournalScreen', () => {
  it('mounts the Journal tab landing instead of the old stub', () => {
    render(<JournalScreen />);

    screen.getByTestId('journal-tab-view');
    expect(
      screen.queryByText('Your saved learning record will live here.'),
    ).toBeNull();
  });

  it('seeds the journal stack with the index route for cross-stack deep pushes', () => {
    // The nested Journal layout will gain deeper dynamic children (e.g. a
    // report/recap detail leaf); per the cross-stack-push guardrail the layout
    // must export unstable_settings.initialRouteName === 'index' as the back-stack
    // safety net (AGENTS.md → Repo-Specific Guardrails).
    expect(unstable_settings.initialRouteName).toBe('index');
  });
});
