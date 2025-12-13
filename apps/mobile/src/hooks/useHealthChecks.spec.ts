/**
 * useHealthChecks.spec.ts - Tests for the data fetching hook
 *
 * @see Story 6.3: Implement Mobile Health Check Screen
 * @see AC-6.3.1, AC-6.3.4, AC-6.3.5
 */
import { renderHook, act, waitFor } from '@testing-library/react-native';

import { useHealthChecks } from './useHealthChecks';
import { apiClient } from '../lib/api';

// Mock the API client
jest.mock('../lib/api', () => ({
  apiClient: {
    GET: jest.fn(),
  },
}));

const mockApiClient = apiClient as jest.Mocked<typeof apiClient>;

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

describe('useHealthChecks', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls apiClient.GET on mount', async () => {
    mockApiClient.GET.mockResolvedValueOnce({
      data: { healthChecks: [] },
      error: undefined,
    });

    renderHook(() => useHealthChecks());

    await waitFor(() => {
      expect(mockApiClient.GET).toHaveBeenCalledWith('/health');
    });
  });

  it('returns loading true initially', () => {
    mockApiClient.GET.mockImplementation(
      () =>
        new Promise(() => {
          /* never resolves */
        })
    );

    const { result } = renderHook(() => useHealthChecks());

    expect(result.current.loading).toBe(true);
    expect(result.current.data).toEqual([]);
  });

  it('returns data after successful fetch', async () => {
    mockApiClient.GET.mockResolvedValueOnce({
      data: { healthChecks: mockHealthChecks },
      error: undefined,
    });

    const { result } = renderHook(() => useHealthChecks());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(mockHealthChecks);
    expect(result.current.error).toBeNull();
  });

  it('returns error when API returns error', async () => {
    mockApiClient.GET.mockResolvedValueOnce({
      data: undefined,
      error: { message: 'Server error' },
    });

    const { result } = renderHook(() => useHealthChecks());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe(
      'Failed to load health checks. Please try again.'
    );
    expect(result.current.data).toEqual([]);
  });

  it('handles network errors with user-friendly message', async () => {
    mockApiClient.GET.mockRejectedValueOnce(
      new Error('Network request failed')
    );

    const { result } = renderHook(() => useHealthChecks());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toContain('Network error');
  });

  it('handles timeout errors with user-friendly message', async () => {
    mockApiClient.GET.mockRejectedValueOnce(new Error('timeout'));

    const { result } = renderHook(() => useHealthChecks());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toContain('timed out');
  });

  it('refetch function triggers new request', async () => {
    mockApiClient.GET.mockResolvedValueOnce({
      data: { healthChecks: [] },
      error: undefined,
    });

    const { result } = renderHook(() => useHealthChecks());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(mockApiClient.GET).toHaveBeenCalledTimes(1);

    // Setup mock for refetch
    mockApiClient.GET.mockResolvedValueOnce({
      data: { healthChecks: mockHealthChecks },
      error: undefined,
    });

    // Call refetch
    await act(async () => {
      await result.current.refetch();
    });

    expect(mockApiClient.GET).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual(mockHealthChecks);
  });

  it('sets refreshing true during refetch', async () => {
    mockApiClient.GET.mockResolvedValueOnce({
      data: { healthChecks: [] },
      error: undefined,
    });

    const { result } = renderHook(() => useHealthChecks());

    // Wait for initial load
    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    // Create a delayed response for refetch to capture refreshing state
    let resolveRefetch: (value: unknown) => void;
    mockApiClient.GET.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveRefetch = resolve;
        })
    );

    // Start refetch
    act(() => {
      result.current.refetch();
    });

    // Verify refreshing is true
    expect(result.current.refreshing).toBe(true);
    expect(result.current.loading).toBe(false); // loading stays false during refresh

    // Resolve the refetch
    await act(async () => {
      resolveRefetch({
        data: { healthChecks: mockHealthChecks },
        error: undefined,
      });
    });

    await waitFor(() => {
      expect(result.current.refreshing).toBe(false);
    });
  });
});
