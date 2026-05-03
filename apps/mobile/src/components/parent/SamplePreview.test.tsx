import { render, screen } from '@testing-library/react-native';
import { Text, View } from 'react-native';
import { SamplePreview } from './SamplePreview';

describe('SamplePreview', () => {
  it('renders children with overlay and unlock message', () => {
    render(
      <SamplePreview unlockMessage="Complete 3 more sessions to unlock.">
        <View testID="sample-content">
          <Text>Mock chart content</Text>
        </View>
      </SamplePreview>
    );

    screen.getByTestId('sample-preview-container');
    screen.getByTestId('sample-content');
    screen.getByTestId('sample-preview-overlay');
    screen.getByText('Complete 3 more sessions to unlock.');
  });

  it('renders unlock message text', () => {
    render(
      <SamplePreview unlockMessage="After 2 more sessions, you'll see trends here.">
        <View testID="sample-content">
          <Text>Mock content</Text>
        </View>
      </SamplePreview>
    );

    screen.getByText("After 2 more sessions, you'll see trends here.");
  });
});
