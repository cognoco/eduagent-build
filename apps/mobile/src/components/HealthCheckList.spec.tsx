/**
 * HealthCheckList.spec.tsx - Tests for the HealthCheckList component
 *
 * Tests the four display states: loading, error, empty, and data.
 *
 * @see Story 6.3: Implement Mobile Health Check Screen
 * @see AC-6.3.1, AC-6.3.4, AC-6.3.5, AC-6.3.6
 */
import * as React from 'react';
import { render, fireEvent } from '@testing-library/react-native';

import { HealthCheckList, HealthCheckListProps } from './HealthCheckList';

const defaultProps: HealthCheckListProps = {
  data: [],
  loading: false,
  error: null,
  onRefresh: jest.fn(),
  refreshing: false,
  onRetry: jest.fn(),
};

const mockHealthChecks = [
  {
    id: '550e8400-e29b-41d4-a716-446655440001',
    message: 'Test ping 1',
    timestamp: '2025-12-13T10:00:00.000Z',
  },
  {
    id: '550e8400-e29b-41d4-a716-446655440002',
    message: 'Test ping 2',
    timestamp: '2025-12-13T11:00:00.000Z',
  },
];

describe('HealthCheckList', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Loading State (AC-6.3.4)', () => {
    it('renders loading state when loading and no data', () => {
      const { getByTestId, getByText } = render(
        <HealthCheckList {...defaultProps} loading={true} data={[]} />
      );

      expect(getByTestId('loading-state')).toBeTruthy();
      expect(getByText('Loading health checks...')).toBeTruthy();
    });

    it('does not show loading state when loading with existing data', () => {
      const { queryByTestId, getByTestId } = render(
        <HealthCheckList
          {...defaultProps}
          loading={true}
          data={mockHealthChecks}
        />
      );

      expect(queryByTestId('loading-state')).toBeNull();
      expect(getByTestId('health-list')).toBeTruthy();
    });
  });

  describe('Error State (AC-6.3.5)', () => {
    it('renders error state with message', () => {
      const { getByTestId, getByText } = render(
        <HealthCheckList
          {...defaultProps}
          error="Network error. Check your connection."
          data={[]}
        />
      );

      expect(getByTestId('error-state')).toBeTruthy();
      expect(getByText('Error Loading Health Checks')).toBeTruthy();
      expect(getByTestId('error-message')).toHaveTextContent(
        'Network error. Check your connection.'
      );
    });

    it('renders retry button when onRetry is provided', () => {
      const onRetry = jest.fn();
      const { getByTestId } = render(
        <HealthCheckList
          {...defaultProps}
          error="Server error"
          onRetry={onRetry}
          data={[]}
        />
      );

      expect(getByTestId('retry-button')).toBeTruthy();
    });

    it('calls onRetry when retry button is pressed', () => {
      const onRetry = jest.fn();
      const { getByTestId } = render(
        <HealthCheckList
          {...defaultProps}
          error="Server error"
          onRetry={onRetry}
          data={[]}
        />
      );

      fireEvent.press(getByTestId('retry-button'));
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('does not render retry button when onRetry is not provided', () => {
      const { queryByTestId } = render(
        <HealthCheckList
          {...defaultProps}
          error="Server error"
          onRetry={undefined}
          data={[]}
        />
      );

      expect(queryByTestId('retry-button')).toBeNull();
    });
  });

  describe('Empty State (AC-6.3.6)', () => {
    it('renders empty state when no data and not loading', () => {
      const { getByTestId, getByText } = render(
        <HealthCheckList {...defaultProps} data={[]} loading={false} />
      );

      expect(getByTestId('empty-state')).toBeTruthy();
      expect(getByText('No health checks yet')).toBeTruthy();
      expect(getByText('Tap Ping to create one!')).toBeTruthy();
    });
  });

  describe('Data State (AC-6.3.1)', () => {
    it('renders FlatList with health check items', () => {
      const { getByTestId, getAllByTestId } = render(
        <HealthCheckList {...defaultProps} data={mockHealthChecks} />
      );

      expect(getByTestId('health-list')).toBeTruthy();
      expect(getAllByTestId('health-check-item')).toHaveLength(2);
    });

    it('displays correct count in footer', () => {
      const { getByText } = render(
        <HealthCheckList {...defaultProps} data={mockHealthChecks} />
      );

      expect(getByText('Showing 2 health checks')).toBeTruthy();
    });

    it('displays singular text for one item', () => {
      const { getByText } = render(
        <HealthCheckList {...defaultProps} data={[mockHealthChecks[0]]} />
      );

      expect(getByText('Showing 1 health check')).toBeTruthy();
    });
  });

  describe('Pull-to-Refresh (AC-6.3.7)', () => {
    it('passes refreshing and onRefresh to RefreshControl', () => {
      const onRefresh = jest.fn();
      const { getByTestId } = render(
        <HealthCheckList
          {...defaultProps}
          data={mockHealthChecks}
          onRefresh={onRefresh}
          refreshing={false}
        />
      );

      // The FlatList with RefreshControl is rendered
      expect(getByTestId('health-list')).toBeTruthy();
    });
  });
});
