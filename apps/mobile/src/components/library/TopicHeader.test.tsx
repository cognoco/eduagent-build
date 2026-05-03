import { render, screen } from '@testing-library/react-native';
import { TopicHeader } from './TopicHeader';

jest.mock('../../lib/theme', () => ({
  useThemeColors: () => ({
    textPrimary: '#1a1a1a',
    textSecondary: '#525252',
    retentionStrong: '#22c55e',
    retentionFading: '#eab308',
    retentionWeak: '#f97316',
    retentionForgotten: '#737373',
  }),
}));

describe('TopicHeader', () => {
  it('renders the topic name', () => {
    render(
      <TopicHeader
        name="Photosynthesis"
        chapter={null}
        retentionStatus={null}
        lastStudiedText="Last studied 3 days ago"
      />
    );
    screen.getByText('Photosynthesis');
  });

  it('renders chapter subtitle when provided', () => {
    render(
      <TopicHeader
        name="Photosynthesis"
        chapter="Chapter 4: Plants"
        retentionStatus={null}
        lastStudiedText="Last studied 3 days ago"
      />
    );
    screen.getByText('Chapter 4: Plants');
  });

  it('does not render chapter when null', () => {
    render(
      <TopicHeader
        name="Photosynthesis"
        chapter={null}
        retentionStatus={null}
        lastStudiedText="Last studied 3 days ago"
      />
    );
    expect(screen.queryByText('Chapter 4: Plants')).toBeNull();
  });

  it('renders RetentionPill when retentionStatus is provided', () => {
    render(
      <TopicHeader
        name="Photosynthesis"
        chapter={null}
        retentionStatus="strong"
        lastStudiedText="Last studied 3 days ago"
      />
    );
    // RetentionPill renders the status label
    screen.getByText('Strong');
  });

  it('does not render RetentionPill when retentionStatus is null', () => {
    render(
      <TopicHeader
        name="Photosynthesis"
        chapter={null}
        retentionStatus={null}
        lastStudiedText="Last studied 3 days ago"
      />
    );
    expect(screen.queryByText('Strong')).toBeNull();
    expect(screen.queryByText('Fading')).toBeNull();
    expect(screen.queryByText('Weak')).toBeNull();
    expect(screen.queryByText('Forgotten')).toBeNull();
  });

  it('renders lastStudiedText', () => {
    render(
      <TopicHeader
        name="Photosynthesis"
        chapter={null}
        retentionStatus={null}
        lastStudiedText="Last studied 3 days ago"
      />
    );
    screen.getByText('Last studied 3 days ago');
  });

  it('renders all elements together', () => {
    render(
      <TopicHeader
        name="Algebra"
        chapter="Chapter 2: Equations"
        retentionStatus="fading"
        lastStudiedText="Last studied yesterday"
      />
    );
    screen.getByText('Algebra');
    screen.getByText('Chapter 2: Equations');
    screen.getByText('Fading');
    screen.getByText('Last studied yesterday');
  });
});
