import { render, screen } from '@testing-library/react-native';
import { RetentionSignal } from './RetentionSignal';

describe('RetentionSignal', () => {
  it('renders warm learner-facing memory labels by default', () => {
    render(<RetentionSignal status="strong" />);

    screen.getByText('Still remembered');
  });

  it('renders parent-facing labels when requested', () => {
    render(<RetentionSignal status="fading" parentFacing />);

    screen.getByText('A few things to refresh');
    expect(screen.queryByText('Getting fuzzy')).toBeNull();
  });

  it('maps forgotten to the same parent-facing review copy', () => {
    render(<RetentionSignal status="forgotten" parentFacing />);

    screen.getByText('Needs a quick refresh');
  });
});
