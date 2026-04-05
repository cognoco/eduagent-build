import { render, fireEvent } from '@testing-library/react-native';
import type { UseQueryResult } from '@tanstack/react-query';
import { QueryGuard } from './QueryGuard';
import { Text } from 'react-native';

function makeQuery<T>(
  overrides: Partial<UseQueryResult<T>>
): UseQueryResult<T> {
  return {
    data: undefined as T,
    error: null,
    isError: false,
    isLoading: false,
    isLoadingError: false,
    isPending: false,
    isRefetchError: false,
    isRefetching: false,
    isSuccess: true,
    status: 'success',
    dataUpdatedAt: 0,
    errorUpdatedAt: 0,
    errorUpdateCount: 0,
    failureCount: 0,
    failureReason: null,
    fetchStatus: 'idle',
    isFetched: true,
    isFetchedAfterMount: true,
    isFetching: false,
    isInitialLoading: false,
    isPaused: false,
    isPlaceholderData: false,
    isStale: false,
    refetch: jest.fn(),
    promise: Promise.resolve(undefined as T),
    ...overrides,
  } as UseQueryResult<T>;
}

describe('QueryGuard', () => {
  it('shows loading state when isLoading is true', () => {
    const query = makeQuery<string[]>({
      isLoading: true,
      isPending: true,
      status: 'pending',
    });
    const { getByTestId } = render(
      <QueryGuard query={query}>
        {(data: string[]) => <Text>{data.length}</Text>}
      </QueryGuard>
    );
    expect(getByTestId('query-guard-loading')).toBeTruthy();
  });

  it('shows error state with retry button when isError is true', () => {
    const refetch = jest.fn();
    const query = makeQuery<string[]>({
      isError: true,
      error: new Error('Network timeout'),
      status: 'error',
      refetch,
    });
    const { getByTestId, getByText } = render(
      <QueryGuard query={query}>
        {(data: string[]) => <Text>{data.length}</Text>}
      </QueryGuard>
    );
    expect(getByTestId('query-guard-error')).toBeTruthy();
    expect(getByText('Network timeout')).toBeTruthy();

    fireEvent.press(getByTestId('query-guard-retry'));
    expect(refetch).toHaveBeenCalled();
  });

  it('shows empty state when data is empty array', () => {
    const query = makeQuery<string[]>({ data: [] });
    const { getByTestId, getByText } = render(
      <QueryGuard query={query} emptyMessage="No items yet">
        {(data: string[]) => <Text>{data.length}</Text>}
      </QueryGuard>
    );
    expect(getByTestId('query-guard-empty')).toBeTruthy();
    expect(getByText('No items yet')).toBeTruthy();
  });

  it('renders children with data when query succeeds', () => {
    const query = makeQuery<string[]>({ data: ['a', 'b'] });
    const { getByText } = render(
      <QueryGuard query={query}>
        {(data: string[]) => <Text>Count: {data.length}</Text>}
      </QueryGuard>
    );
    expect(getByText('Count: 2')).toBeTruthy();
  });

  it('renders data even when empty if no emptyMessage is provided', () => {
    const query = makeQuery<string[]>({ data: [] });
    const { getByText } = render(
      <QueryGuard query={query}>
        {(data: string[]) => <Text>Count: {data.length}</Text>}
      </QueryGuard>
    );
    expect(getByText('Count: 0')).toBeTruthy();
  });

  it('shows empty state when data is null', () => {
    const query = makeQuery<null>({ data: null });
    const { getByTestId } = render(
      <QueryGuard query={query} emptyMessage="Nothing here">
        {() => <Text>Should not render</Text>}
      </QueryGuard>
    );
    expect(getByTestId('query-guard-empty')).toBeTruthy();
  });

  // BM-04: disabled queries have isPending=true but isLoading=false.
  // Using isLoading would let undefined data fall through to children.
  it('shows loading for disabled query where isPending=true but isLoading=false (BM-04)', () => {
    const query = makeQuery<string[]>({
      isPending: true,
      isLoading: false,
      isFetching: false,
      fetchStatus: 'idle',
      status: 'pending',
      isSuccess: false,
    });
    const { getByTestId, queryByText } = render(
      <QueryGuard query={query}>
        {(data: string[]) => <Text>Count: {data.length}</Text>}
      </QueryGuard>
    );
    // Should show loading spinner, NOT crash by passing undefined to children
    expect(getByTestId('query-guard-loading')).toBeTruthy();
    expect(queryByText(/Count/)).toBeNull();
  });

  it('renders custom loading UI when provided', () => {
    const query = makeQuery<string[]>({
      isPending: true,
      isLoading: true,
      status: 'pending',
    });
    const { getByText } = render(
      <QueryGuard query={query} loading={<Text>Custom loading...</Text>}>
        {(data: string[]) => <Text>{data.length}</Text>}
      </QueryGuard>
    );
    expect(getByText('Custom loading...')).toBeTruthy();
  });

  it('renders custom error UI when provided', () => {
    const query = makeQuery<string[]>({
      isError: true,
      error: new Error('fail'),
      status: 'error',
    });
    const { getByText } = render(
      <QueryGuard query={query} error={<Text>Custom error</Text>}>
        {(data: string[]) => <Text>{data.length}</Text>}
      </QueryGuard>
    );
    expect(getByText('Custom error')).toBeTruthy();
  });

  it('renders custom empty UI when provided', () => {
    const query = makeQuery<string[]>({ data: [] });
    const { getByText } = render(
      <QueryGuard query={query} empty={<Text>Custom empty</Text>}>
        {(data: string[]) => <Text>{data.length}</Text>}
      </QueryGuard>
    );
    expect(getByText('Custom empty')).toBeTruthy();
  });
});
