import React from 'react';
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
    expect(screen.queryByTestId('metric-tooltip-understanding')).toBeNull();
  });

  it('renders nothing for unknown metricKey', () => {
    const { toJSON } = render(<MetricInfoDot metricKey="nonexistent" />);
    expect(toJSON()).toBeNull();
  });
});
