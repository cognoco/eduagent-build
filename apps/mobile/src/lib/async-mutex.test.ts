import { withLock } from './async-mutex';

describe('withLock', () => {
  it('serializes work for the same key', async () => {
    const order: string[] = [];

    await Promise.all([
      withLock('same', async () => {
        order.push('a:start');
        await new Promise((resolve) => setTimeout(resolve, 10));
        order.push('a:end');
      }),
      withLock('same', async () => {
        order.push('b:start');
        order.push('b:end');
      }),
    ]);

    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end']);
  });
});
