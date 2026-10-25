import { ObjectMissingError, type ObjectStore, type PutOptions } from "./types";

/**
 * Moves one object between stores (server-side copy, then delete), so each file is stored once.
 * Idempotent: an object already in `to` (an earlier, interrupted or repeated move) counts as moved;
 * a crash between copy and delete leaves both copies, which the next move cleans up.
 */
export async function moveObject(from: ObjectStore, to: ObjectStore, key: string, options: PutOptions): Promise<void> {
  try {
    await from.copyTo(to, key, options);
  } catch (err) {
    if (err instanceof ObjectMissingError && (await to.exists(key))) return;
    throw err;
  }
  await from.deleteMany([key]);
}
