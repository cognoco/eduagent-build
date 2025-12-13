/**
 * App.spec.tsx - Tests for the main Health Check screen
 *
 * @see Story 6.3: Implement Mobile Health Check Screen
 */
import * as React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import App from './App';
import { apiClient } from '../lib/api';

// Mock the API client
jest.mock('../lib/api', () => ({
  apiClient: {
    GET: jest.fn(),
    POST: jest.fn(),
  },
}));

// Mock Alert to prevent actual alerts in tests
jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

describe('App (Health Check Screen)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders page title correctly', async () => {
    // Mock successful empty response
    mockApiClient.GET.mockResolvedValueOnce({
      data: { healthChecks: [] },
      error: undefined,
    });

    const { getByTestId } = render(<App />);

    await waitFor(() => {
      expect(getByTestId('page-title')).toHaveTextContent('Health Checks');
    });
  });

  it('renders ping button', async () => {
    mockApiClient.GET.mockResolvedValueOnce({
      data: { healthChecks: [] },
      error: undefined,
    });

    const { getByTestId } = render(<App />);

    await waitFor(() => {
      expect(getByTestId('ping-button')).toBeTruthy();
    });
  });

  it('shows loading state initially', () => {
    // Keep the promise pending to simulate loading
    mockApiClient.GET.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves */
        })
    );

    const { getByTestId } = render(<App />);

    expect(getByTestId('loading-state')).toBeTruthy();
  });

  it('shows empty state when no health checks exist', async () => {
    mockApiClient.GET.mockResolvedValueOnce({
      data: { healthChecks: [] },
      error: undefined,
    });

    const { getByTestId } = render(<App />);

    await waitFor(() => {
      expect(getByTestId('empty-state')).toBeTruthy();
    });
  });

  it('displays health check items when data exists', async () => {
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

    mockApiClient.GET.mockResolvedValueOnce({
      data: { healthChecks: mockHealthChecks },
      error: undefined,
    });

    const { getByTestId, getAllByTestId } = render(<App />);

    await waitFor(() => {
      expect(getByTestId('health-list')).toBeTruthy();
      expect(getAllByTestId('health-check-item')).toHaveLength(2);
    });
  });

  it('shows error state when API fails', async () => {
    mockApiClient.GET.mockResolvedValueOnce({
      data: undefined,
      error: { message: 'Server error' },
    });

    const { getByTestId } = render(<App />);

    await waitFor(() => {
      expect(getByTestId('error-state')).toBeTruthy();
      expect(getByTestId('error-message')).toBeTruthy();
    });
  });

  it('creates health check when ping button is pressed', async () => {
    const mockHealthCheck = {
      id: '550e8400-e29b-41d4-a716-446655440003',
      message: 'Mobile ping',
      timestamp: '2025-12-13T12:00:00.000Z',
    };

    mockApiClient.GET.mockResolvedValueOnce({
      data: { healthChecks: [] },
      error: undefined,
    });

    mockApiClient.POST.mockResolvedValueOnce({
      data: { healthCheck: mockHealthCheck },
      error: undefined,
      response: new Response(null, { status: 200 }),
    });

    // After POST, GET will be called again (refetch)
    mockApiClient.GET.mockResolvedValueOnce({
      data: { healthChecks: [mockHealthCheck] },
      error: undefined,
    });

    const { getByTestId } = render(<App />);

    // Wait for initial load
    await waitFor(() => {
      expect(getByTestId('empty-state')).toBeTruthy();
    });

    // Press ping button
    fireEvent.press(getByTestId('ping-button'));

    // Verify POST was called
    await waitFor(() => {
      expect(mockApiClient.POST).toHaveBeenCalledWith('/health/ping', {
        body: { message: 'Mobile ping' },
      });
    });
  });

  it('shows retry button on error and allows retry', async () => {
    // First call fails
    mockApiClient.GET.mockResolvedValueOnce({
      data: undefined,
      error: { message: 'Network error' },
    });

    // Second call (retry) succeeds
    mockApiClient.GET.mockResolvedValueOnce({
      data: { healthChecks: [] },
      error: undefined,
    });

    const { getByTestId } = render(<App />);

    // Wait for error state
    await waitFor(() => {
      expect(getByTestId('error-state')).toBeTruthy();
    });

    // Press retry button
    fireEvent.press(getByTestId('retry-button'));

    // Verify GET was called again
    await waitFor(() => {
      expect(mockApiClient.GET).toHaveBeenCalledTimes(2);
    });
  });
});
