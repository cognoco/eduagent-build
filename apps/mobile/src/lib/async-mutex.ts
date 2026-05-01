const locks = new Map<string, Promise<void>>();

export async function withLock<T>(
  key: string,
  work: () => Promise<T> | T
): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();

  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  locks.set(
    key,
    previous.then(
      () => current,
      () => current
    )
  );

  await previous;

  try {
    return await work();
  } finally {
    release();
    if (locks.get(key) === current) {
      locks.delete(key);
    }
  }
}
