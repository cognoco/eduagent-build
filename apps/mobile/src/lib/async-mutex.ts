const locks = new Map<string, Promise<void>>();

/** @internal - exported for tests only */
export function __getLockCountForTests(): number {
  return locks.size;
}

export async function withLock<T>(
  key: string,
  work: () => Promise<T> | T,
): Promise<T> {
  const previous = locks.get(key) ?? Promise.resolve();

  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const next = previous.then(
    () => current,
    () => current,
  );
  locks.set(key, next);

  await previous;

  try {
    return await work();
  } finally {
    release();
    if (locks.get(key) === next) {
      locks.delete(key);
    }
  }
}
