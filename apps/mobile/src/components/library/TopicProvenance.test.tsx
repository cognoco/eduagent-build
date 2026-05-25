import { render, screen } from '@testing-library/react-native';

import { TopicProvenance } from './TopicProvenance';

let mockChildren: Array<{ id: string; displayName: string }> = [];
const NOW = new Date('2026-05-23T12:00:00.000Z').getTime();

jest.mock(
  '../../lib/profile' /* gc1-allow: visual component test only needs linked child names */,
  () => ({
    ...jest.requireActual('../../lib/profile'),
    useLinkedChildren: () => mockChildren,
  }),
);

describe('TopicProvenance', () => {
  beforeEach(() => {
    mockChildren = [{ id: 'child-id', displayName: 'Ava' }];
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('renders nothing without a source child or recent timestamp', () => {
    render(<TopicProvenance />);

    expect(screen.queryByTestId('topic-provenance')).toBeNull();
  });

  it('renders the active child provenance chip', () => {
    render(<TopicProvenance sourceChildProfileId="child-id" />);

    screen.getByText('From Ava');
  });

  it('omits missing child names but keeps the recent badge', () => {
    mockChildren = [];

    render(
      <TopicProvenance
        sourceChildProfileId="deleted-child-id"
        createdAt={new Date(NOW - 60_000).toISOString()}
      />,
    );

    expect(screen.queryByTestId('topic-provenance-child')).toBeNull();
    screen.getByText('Recently added');
  });

  it('renders the recent badge without child provenance', () => {
    render(
      <TopicProvenance createdAt={new Date(NOW - 60_000).toISOString()} />,
    );

    expect(screen.queryByTestId('topic-provenance-child')).toBeNull();
    screen.getByText('Recently added');
  });

  it('renders nothing for old timestamps without child provenance', () => {
    render(
      <TopicProvenance
        createdAt={new Date(NOW - 25 * 60 * 60 * 1000).toISOString()}
      />,
    );

    expect(screen.queryByTestId('topic-provenance')).toBeNull();
  });

  it('renders nothing when a source child is no longer linked and the topic is not recent', () => {
    mockChildren = [];

    render(<TopicProvenance sourceChildProfileId="deleted-child-id" />);

    expect(screen.queryByTestId('topic-provenance')).toBeNull();
  });

  it('ignores invalid timestamps while preserving child provenance', () => {
    render(
      <TopicProvenance
        sourceChildProfileId="child-id"
        createdAt="not-a-date"
      />,
    );

    screen.getByText('From Ava');
    expect(screen.queryByTestId('topic-provenance-recent')).toBeNull();
  });
});
