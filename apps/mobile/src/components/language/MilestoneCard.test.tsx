import { render, screen } from '@testing-library/react-native';
import { MilestoneCard } from './MilestoneCard';

describe('MilestoneCard', () => {
  it('renders milestone progress', () => {
    render(
      <MilestoneCard
        currentLevel="A1"
        currentSublevel="3"
        milestoneTitle="Ordering Food & Drinks"
        wordsMastered={38}
        wordsTarget={55}
        chunksMastered={9}
        chunksTarget={15}
        milestoneProgress={0.67}
      />
    );

    expect(screen.getByText('A1.3')).toBeTruthy();
    expect(screen.getByText('Ordering Food & Drinks')).toBeTruthy();
    expect(screen.getByText('67%')).toBeTruthy();
    expect(screen.getByText('38/55 words')).toBeTruthy();
    expect(screen.getByText('9/15 chunks')).toBeTruthy();
  });
});
