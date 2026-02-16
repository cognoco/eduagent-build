import { trialExpiry } from './trial-expiry';

describe('trialExpiry', () => {
  it('should be defined as an Inngest function', () => {
    expect(trialExpiry).toBeDefined();
  });

  it('should have the correct function id', () => {
    const config = (trialExpiry as any).opts;
    expect(config.id).toBe('trial-expiry-check');
  });

  it('should have a cron trigger', () => {
    const triggers = (trialExpiry as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([expect.objectContaining({ cron: '0 0 * * *' })])
    );
  });
});
