import { render, screen } from '@testing-library/react-native';
import { RetentionSignal } from './RetentionSignal';

describe('RetentionSignal', () => {
  it('renders honest retention labels by default', () => {
    render(<RetentionSignal status="strong" />);

    screen.getByText('Strong');
  });

  it('renders parent-facing labels when requested', () => {
    render(<RetentionSignal status="fading" parentFacing />);

    screen.getByText('A few things to refresh');
    expect(screen.queryByText('Fading')).toBeNull();
  });

  it('maps forgotten to the same parent-facing review copy', () => {
    render(<RetentionSignal status="forgotten" parentFacing />);

    screen.getByText('Needs a review');
  });
});
