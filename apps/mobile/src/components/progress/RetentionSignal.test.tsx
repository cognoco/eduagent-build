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

  it('maps forgotten to a distinct parent-facing review copy (M4)', () => {
    render(<RetentionSignal status="forgotten" parentFacing />);

    // M4 fix: 'forgotten' differentiates from 'weak' — parent-vocab now
    // returns "Needs a fresh pass" for forgotten, matching RetentionSignal.
    screen.getByText('Needs a fresh pass');
    expect(screen.queryByText('Needs a quick refresh')).toBeNull();
  });
});
