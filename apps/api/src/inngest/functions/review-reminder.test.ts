import { reviewReminder } from './review-reminder';

describe('reviewReminder', () => {
  it('should be defined as an Inngest function', () => {
    expect(reviewReminder).toBeDefined();
  });

  it('should have the correct function id', () => {
    const config = (reviewReminder as any).opts;
    expect(config.id).toBe('review-reminder');
  });

  it('should trigger on app/retention.review-due event', () => {
    const triggers = (reviewReminder as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/retention.review-due' }),
      ])
    );
  });
});
