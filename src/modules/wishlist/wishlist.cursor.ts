import { Timestamp } from 'firebase-admin/firestore';
import { HttpError } from '@/lib/server/http';
import { parseItemId, parseObject } from './wishlist.validation';
import type { OccasionFilters, Owner } from './wishlist.types';

export function encodeCursor(
  timestamp: Timestamp,
  id: string,
  owner?: Owner,
  filters: OccasionFilters = {}
): string {
  return Buffer.from(
    JSON.stringify({
      v: 1,
      seconds: timestamp.seconds,
      nanoseconds: timestamp.nanoseconds,
      id,
      owner: owner ?? null,
      ...(filters.occasions || filters.type || filters.year
        ? { occasions: true, type: filters.type ?? null, year: filters.year ?? null }
        : {}),
    })
  ).toString('base64url');
}

export function decodeCursor(
  cursor: string,
  owner?: Owner,
  filters: OccasionFilters = {}
): { timestamp: Timestamp; id: string } {
  try {
    if (cursor.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new Error();
    const data = parseObject(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')), [
      'v',
      'seconds',
      'nanoseconds',
      'id',
      'owner',
      'occasions',
      'type',
      'year',
    ]);
    if (
      data.v !== 1 ||
      data.owner !== (owner ?? null) ||
      typeof data.seconds !== 'number' ||
      typeof data.nanoseconds !== 'number' ||
      !Number.isSafeInteger(data.seconds) ||
      !Number.isSafeInteger(data.nanoseconds) ||
      typeof data.id !== 'string'
    )
      throw new Error();
    const id = parseItemId(data.id);
    const timestamp = new Timestamp(data.seconds, data.nanoseconds);
    if (encodeCursor(timestamp, id, owner, filters) !== cursor) throw new Error();
    return { timestamp, id };
  } catch {
    throw new HttpError(400, 'Invalid or outdated pagination cursor. Refresh the feed.');
  }
}
