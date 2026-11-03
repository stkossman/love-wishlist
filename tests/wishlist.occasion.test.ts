import { expect, test } from 'bun:test';
import { Timestamp } from 'firebase-admin/firestore';
import { OCCASIONS, isOccasionType, readOccasion } from '../src/modules/wishlist/occasion';
import {
  parseCreateItem,
  parseUpdateItem,
  parseOccasionFilters,
} from '../src/modules/wishlist/wishlist.validation';
import { encodeCursor, decodeCursor } from '../src/modules/wishlist/wishlist.cursor';
import { serializeWishlistForm } from '../src/modules/wishlist/client/wishlist-form-handler';

const occasion = { type: 'birthday', year: 2027, desire: 4 } as const;
const item = { owner: 'me', topic: 'Brand', name: 'Wish' };
test('all occasion types and desire boundaries validate and normalize', () => {
  for (const type of Object.keys(OCCASIONS).filter(isOccasionType))
    for (const desire of [1, 5] as const) {
      const value = {
        type,
        year: 2026,
        desire,
        ...(type === 'other' ? { customLabel: ' Our day ' } : {}),
      };
      const saved = parseCreateItem({ ...item, occasion: value }).occasion;
      expect(saved?.type).toBe(type);
      expect(saved?.desire).toBe(desire);
      expect(saved?.customLabel).toBe(type === 'other' ? 'Our day' : undefined);
      expect(parseUpdateItem({ occasion: value }).occasion).toEqual(saved);
    }
});
test('invalid occasion objects cannot reach persistence', () => {
  for (const value of [
    null,
    [],
    'birthday',
    {},
    { ...occasion, type: 'unknown' },
    ...[0, 6, -1, 1.5, '4', null].map((desire) => ({ ...occasion, desire })),
    ...[1899, 10000, 2027.5, '2027', null].map((year) => ({ ...occasion, year })),
    { ...occasion, type: 'other' },
    { ...occasion, type: 'other', customLabel: ' ' },
    { ...occasion, type: 'other', customLabel: 'x'.repeat(81) },
    { ...occasion, customLabel: 'Wrong' },
    { ...occasion, extra: true },
  ]) {
    expect(() => parseCreateItem({ ...item, occasion: value })).toThrow();
    if (value !== null) expect(() => parseUpdateItem({ occasion: value })).toThrow();
  }
});
test('legacy payloads omit occasion; removal is explicit and malformed stored values map safely', () => {
  expect(parseCreateItem(item)).not.toHaveProperty('occasion');
  expect(parseUpdateItem({ name: 'Updated' })).not.toHaveProperty('occasion');
  expect(parseUpdateItem({ occasion: null })).toEqual({ occasion: null });
  for (const value of [undefined, null, {}, { ...occasion, desire: 9 }])
    expect(readOccasion(value)).toBeUndefined();
});
test('filters accept occasion/year combinations and reject malformed values', () => {
  expect(parseOccasionFilters(new URLSearchParams())).toEqual({});
  expect(parseOccasionFilters(new URLSearchParams('collection=occasions&occasion=&year='))).toEqual(
    { occasions: true }
  );
  expect(parseOccasionFilters(new URLSearchParams('occasion=birthday&year=2027'))).toEqual({
    occasions: true,
    type: 'birthday',
    year: 2027,
  });
  for (const query of [
    'collection=other',
    'occasion=invalid',
    'year=0',
    'year=2027.5',
    'year=1e3',
    'year=10000',
  ])
    expect(() => parseOccasionFilters(new URLSearchParams(query))).toThrow();
});
test('cursors bind every filter and owner, including combined and unfiltered views', () => {
  const timestamp = new Timestamp(1700000000, 123456789);
  const filters = { occasions: true, type: 'birthday', year: 2027 } as const;
  for (const owner of [undefined, 'me', 'her'] as const) {
    const cursor = encodeCursor(timestamp, 'wish', owner, filters);
    expect(decodeCursor(cursor, owner, filters)).toEqual({ timestamp, id: 'wish' });
    for (const mismatch of [
      {},
      { occasions: true },
      { ...filters, year: 2026 },
      { ...filters, type: 'christmas' } as const,
    ])
      expect(() => decodeCursor(cursor, owner, mismatch)).toThrow();
    expect(() => decodeCursor(encodeCursor(timestamp, 'wish', owner), owner, filters)).toThrow();
    expect(() => decodeCursor(cursor, owner === 'me' ? 'her' : 'me', filters)).toThrow();
  }
});
test('form serialization includes only enabled occasion data and normalizes Other', () => {
  const data = new FormData();
  Object.entries(item).forEach(([key, value]) => data.set(key, value));
  expect(serializeWishlistForm(data, [])).not.toHaveProperty('occasion');
  Object.entries({
    occasionType: 'other',
    occasionYear: '2027',
    occasionDesire: '5',
    occasionLabel: ' Our day ',
  }).forEach(([key, value]) => data.set(key, value));
  expect(serializeWishlistForm(data, []).occasion).toEqual({
    type: 'other',
    year: 2027,
    desire: 5,
    customLabel: 'Our day',
  });
  data.set('occasionDesire', '6');
  expect(() => serializeWishlistForm(data, [])).toThrow();
  data.set('occasionType', '');
  expect(serializeWishlistForm(data, [])).not.toHaveProperty('occasion');
});
