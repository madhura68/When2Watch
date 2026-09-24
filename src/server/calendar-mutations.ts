import { AppError } from "./errors";

// The deployed app has one Node process. Keep the lock on globalThis because
// Next may bundle the create and delete routes into separate module instances.
const shared = globalThis as typeof globalThis & { when2watchMutations?: Map<string, Promise<void>> };
const pending = shared.when2watchMutations ??= new Map<string, Promise<void>>();

export async function serializeCalendarMutation<T>(userId: string, work: () => Promise<T>, rejectIfBusy = false): Promise<T> {
  if (rejectIfBusy && pending.has(userId)) throw new AppError("SYNC_BUSY", 409, "Er loopt al een agenda-actie. De volgende synchronisatie probeert het opnieuw.");
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
