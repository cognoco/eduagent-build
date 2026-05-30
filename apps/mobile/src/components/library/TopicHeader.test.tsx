import { render, screen } from '@testing-library/react-native';
import { TopicHeader } from './TopicHeader';

jest.mock(
  'react-i18next',
  () => require('../../test-utils/mock-i18n').i18nMock,
);

describe('TopicHeader', () => {
  it('renders the topic name', () => {
    render(
      <TopicHeader
        name="Photosynthesis"
        chapter={null}
        retentionStatus={null}
        lastStudiedText="Last studied 3 days ago"
      />,
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
      />,
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
      />,
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
      />,
    );
    // RetentionPill renders the status label
    screen.getByText('Still remembered');
  });

  it('passes elapsed review days to RetentionPill', () => {
    render(
      <TopicHeader
        name="Photosynthesis"
        chapter={null}
        retentionStatus="weak"
        daysSinceLastReview={14}
        lastStudiedText="Last studied 14 days ago"
      />,
    );
    screen.getByText('Ready for a refresh after 14 days');
  });

  it('does not render RetentionPill when retentionStatus is null', () => {
    render(
      <TopicHeader
        name="Photosynthesis"
        chapter={null}
        retentionStatus={null}
        lastStudiedText="Last studied 3 days ago"
      />,
    );
    expect(screen.queryByText('Still remembered')).toBeNull();
    expect(screen.queryByText('Getting fuzzy')).toBeNull();
    expect(screen.queryByText('Needs a quick refresh')).toBeNull();
    expect(screen.queryByText('Needs a fresh pass')).toBeNull();
  });

  it('renders lastStudiedText', () => {
    render(
      <TopicHeader
        name="Photosynthesis"
        chapter={null}
        retentionStatus={null}
        lastStudiedText="Last studied 3 days ago"
      />,
    );
    screen.getByText('Last studied 3 days ago');
  });

  it('renders the topic coverage description when provided', () => {
    render(
      <TopicHeader
        name="Photosynthesis"
        chapter={null}
        description="Chlorophyll, sunlight, carbon dioxide, and glucose."
        retentionStatus={null}
        lastStudiedText="Last studied 3 days ago"
      />,
    );
    screen.getByText('This topic covers');
    screen.getByText('Chlorophyll, sunlight, carbon dioxide, and glucose.');
  });

  it('renders strong review progress when a retention card exists', () => {
    render(
      <TopicHeader
        name="Photosynthesis"
        chapter={null}
        retentionStatus="strong"
        strongReviews={3}
        strongReviewsTarget={5}
        lastStudiedText="Last studied 3 days ago"
      />,
    );

    screen.getByTestId('topic-strong-reviews');
    screen.getByText('3/5 strong reviews');
  });

  it('renders mastered when the topic has sticky mastery', () => {
    render(
      <TopicHeader
        name="Photosynthesis"
        chapter={null}
        retentionStatus="strong"
        strongReviews={5}
        strongReviewsTarget={5}
        masteredAt="2026-05-30T00:00:00.000Z"
        lastStudiedText="Last studied 3 days ago"
      />,
    );

    screen.getByText('Mastered');
  });

  it('does not render the topic coverage card when description is empty', () => {
    render(
      <TopicHeader
        name="Photosynthesis"
        chapter={null}
        description="   "
        retentionStatus={null}
        lastStudiedText="Last studied 3 days ago"
      />,
    );
    expect(screen.queryByTestId('topic-covers-card')).toBeNull();
  });

  it('renders all elements together', () => {
    render(
      <TopicHeader
        name="Algebra"
        chapter="Chapter 2: Equations"
        retentionStatus="fading"
        lastStudiedText="Last studied yesterday"
      />,
    );
    screen.getByText('Algebra');
    screen.getByText('Chapter 2: Equations');
    screen.getByText('Getting fuzzy');
    screen.getByText('Last studied yesterday');
  });
});
