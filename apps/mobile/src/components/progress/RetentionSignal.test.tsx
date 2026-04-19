import { render, screen } from '@testing-library/react-native';
import { RetentionSignal } from './RetentionSignal';

describe('RetentionSignal', () => {
  it('renders learner-facing organic labels by default', () => {
    render(<RetentionSignal status="strong" />);

    expect(screen.getByText('Thriving')).toBeTruthy();
  });

  it('renders parent-facing labels when requested', () => {
    render(<RetentionSignal status="fading" parentFacing />);

    expect(screen.getByText('A few things to refresh')).toBeTruthy();
    expect(screen.queryByText('Warming up')).toBeNull();
  });

  it('maps forgotten to the same parent-facing review copy', () => {
    render(<RetentionSignal status="forgotten" parentFacing />);

    expect(screen.getByText('Needs a review')).toBeTruthy();
  });
});
