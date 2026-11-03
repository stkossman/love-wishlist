import { expect, test } from 'bun:test';
import { Timestamp } from 'firebase-admin/firestore';
import { decodeCursor, encodeCursor } from '../src/modules/wishlist/wishlist.cursor';

const timestamp = new Timestamp(1_700_000_000, 123456789);
const pack = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

test('versioned cursors preserve exact seconds, nanoseconds and Unicode IDs', () => {
  for (const owner of [undefined, 'me', 'her'] as const) {
    const cursor = encodeCursor(timestamp, '���������', owner);
    expect(decodeCursor(cursor, owner)).toEqual({ timestamp, id: '���������' });
    expect(cursor).not.toContain('=');
  }
});

test('ties remain distinct even when display dates are identical', () => {
  const adjacent = new Timestamp(timestamp.seconds, timestamp.nanoseconds + 1);
  expect(timestamp.toDate().toISOString()).toBe(adjacent.toDate().toISOString());
  const cursors = [
    encodeCursor(timestamp, 'a'),
    encodeCursor(timestamp, 'b'),
    encodeCursor(adjacent, 'a'),
  ];
  expect(new Set(cursors).size).toBe(3);
  expect(cursors.map((cursor) => decodeCursor(cursor).timestamp.nanoseconds)).toEqual([
    123456789, 123456789, 123456790,
  ]);
});

test('malformed, outdated, cross-owner and out-of-range cursors are rejected', () => {
  const valid = {
    v: 1,
    seconds: timestamp.seconds,
    nanoseconds: timestamp.nanoseconds,
    id: 'a',
    owner: 'me',
  };
  for (const cursor of [
    '',
    '!',
    'a'.repeat(4097),
    '2024-01-01T00:00:00.000Z',
    pack(null),
    pack([]),
    pack({ ...valid, v: 2 }),
    pack({ ...valid, nanoseconds: -1 }),
    pack({ ...valid, nanoseconds: 1e9 }),
    pack({ ...valid, seconds: 253402300800 }),
    pack({ ...valid, seconds: 1.5 }),
    pack({ ...valid, id: '../a' }),
    pack({ ...valid, id: '' }),
    pack({ ...valid, id: 5 }),
    pack({ ...valid, extra: true }),
    pack({ ...valid, owner: 'her' }),
    encodeCursor(timestamp, 'a'),
  ]) {
    expect(() => decodeCursor(cursor, 'me')).toThrow('Invalid or outdated pagination cursor');
  }
});
