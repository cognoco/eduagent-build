import { render, screen, fireEvent } from '@testing-library/react-native';
import { MetricInfoDot } from './MetricInfoDot';

describe('MetricInfoDot', () => {
  it('renders the info icon', () => {
    render(<MetricInfoDot metricKey="understanding" />);
    expect(screen.getByTestId('metric-info-understanding')).toBeTruthy();
  });

  it('shows tooltip content on press', () => {
    render(<MetricInfoDot metricKey="understanding" />);
    fireEvent.press(screen.getByTestId('metric-info-understanding'));
    expect(screen.getByTestId('metric-tooltip-understanding')).toBeTruthy();
    expect(screen.getByText(/how well your child understands/i)).toBeTruthy();
  });

  it('hides tooltip on second press', () => {
    render(<MetricInfoDot metricKey="understanding" />);
    const dot = screen.getByTestId('metric-info-understanding');
    fireEvent.press(dot);
    expect(screen.getByTestId('metric-tooltip-understanding')).toBeTruthy();
    fireEvent.press(dot);
    // RN's iOS Modal keeps children mounted during the dismiss animation
    // (waits for a 'modalDismissed' native event that never fires under
    // jest), so queryByTestId(...).toBeNull() never goes null. Assert on
    // the Modal host's `visible` prop instead — that's what the second
    // press actually flips.
    const tooltipModal = screen.UNSAFE_queryByProps({
      visible: false,
      animationType: 'fade',
      transparent: true,
    });
    expect(tooltipModal).toBeTruthy();
  });

  it('renders nothing for unknown metricKey', () => {
    const { toJSON } = render(<MetricInfoDot metricKey="nonexistent" />);
    expect(toJSON()).toBeNull();
  });
});
