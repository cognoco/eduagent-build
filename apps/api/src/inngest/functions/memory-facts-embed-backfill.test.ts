// ---------------------------------------------------------------------------
// memory-facts-embed-backfill — focused config tests
//
// [BUG-155] The hourly cron must not overlap when a prior run is still
// chewing through a Voyage backlog; without a concurrency cap two runs both
// pick rows-with-NULL-embedding and double-call the Voyage API per fact. The
// UPDATE … WHERE embedding IS NULL means only one write lands, but the
// duplicate Voyage spend is real.
// ---------------------------------------------------------------------------

import { memoryFactsEmbedBackfill } from './memory-facts-embed-backfill';

describe('memoryFactsEmbedBackfill configuration', () => {
  it('is defined as an Inngest function with the expected id', () => {
    expect(
      (memoryFactsEmbedBackfill as { opts?: { id?: string } }).opts?.id,
    ).toBe('memory-facts-embed-backfill');
  });

  it('runs on the hourly cron schedule', () => {
    const triggers = (memoryFactsEmbedBackfill as any).opts?.triggers;
    expect(triggers).toEqual(
      expect.arrayContaining([expect.objectContaining({ cron: '0 * * * *' })]),
    );
  });

  // [BUG-155] Two simultaneous cron fires would each iterate the backlog and
  // each call Voyage on the same row — UPDATE-IS-NULL makes the write
  // idempotent but the embedding spend is doubled.
  it('[BUG-155] caps function-level concurrency to 1', () => {
    const opts = (memoryFactsEmbedBackfill as any).opts;
    expect(opts.concurrency).toEqual({ limit: 1 });
  });
});
