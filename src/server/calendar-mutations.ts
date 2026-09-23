// The deployed app has one Node process. Keep the lock on globalThis because
// Next may bundle the create and delete routes into separate module instances.
const shared = globalThis as typeof globalThis & { when2watchMutations?: Map<string, Promise<void>> };
const pending = shared.when2watchMutations ??= new Map<string, Promise<void>>();

export async function serializeCalendarMutation<T>(userId: string, work: () => Promise<T>): Promise<T> {
  const previous = pending.get(userId) ?? Promise.resolve();
  let release!: () => void;
  const finished = new Promise<void>((resolve) => { release = resolve; });
  pending.set(userId, finished);
  await previous;
  try { return await work(); }
  finally {
    release();
    if (pending.get(userId) === finished) pending.delete(userId);
  }
}
