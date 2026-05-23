import { render, screen } from '@testing-library/react-native';

import { TopicProvenance } from './TopicProvenance';

let mockChildren: Array<{ id: string; displayName: string }> = [];

jest.mock(
  '../../lib/profile' /* gc1-allow: visual component test only needs linked child names */,
  () => ({
    useLinkedChildren: () => mockChildren,
  }),
);

describe('TopicProvenance', () => {
  beforeEach(() => {
    mockChildren = [{ id: 'child-id', displayName: 'Ava' }];
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
        createdAt={new Date().toISOString()}
      />,
    );

    expect(screen.queryByTestId('topic-provenance-child')).toBeNull();
    screen.getByText('Recently added');
  });
});
