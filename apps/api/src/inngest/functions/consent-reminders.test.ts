import { consentReminder } from './consent-reminders';

describe('consentReminder', () => {
  it('should be defined as an Inngest function', () => {
    expect(consentReminder).toBeDefined();
  });

  it('should have the correct function id', () => {
    // The Inngest function object exposes its config
    const config = (consentReminder as any).opts;
    expect(config.id).toBe('consent-reminder');
  });

  it('should trigger on app/consent.requested event', () => {
    // Inngest v3 stores triggers in the config array
    const triggers = (consentReminder as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: 'app/consent.requested' }),
      ])
    );
  });
});
