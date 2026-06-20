import { render, screen } from '@testing-library/react-native';

jest.mock(
  '../../components/journal/JournalTabView' /* gc1-allow: route smoke test verifies the page mounts the real landing component boundary */,
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

const JournalScreen = require('./journal').default;

describe('JournalScreen', () => {
  it('mounts the Journal tab landing instead of the old stub', () => {
    render(<JournalScreen />);

    screen.getByTestId('journal-tab-view');
    expect(
      screen.queryByText('Your saved learning record will live here.'),
    ).toBeNull();
  });
});
