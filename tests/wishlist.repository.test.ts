import { beforeEach, expect, mock, test } from 'bun:test';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

const saved = {
  owner: 'me' as const,
  topic: 'Brand',
  name: 'Item',
  createdAt: Timestamp.fromMillis(1_700_000_000_000),
};
const readDocument = mock(async () => ({ id: 'actual-id', data: () => saved }));
const updateDocument = mock(async (_data: unknown) => {});
const deleteDocument = mock(async () => {});
const document = mock((_id: string) => ({
  get: readDocument,
  update: updateDocument,
  delete: deleteDocument,
}));
const add = mock(async (_data: unknown) => ({ id: 'created-id' }));
const query = {
  orderBy: mock((_field: string, _order: string): typeof query => query),
  where: mock((_field: string, _operator: string, _owner: string): typeof query => query),
  startAfter: mock((_cursor: Timestamp): typeof query => query),
  limit: mock((_limit: number): typeof query => query),
  get: mock(async () => ({ docs: [{ id: 'actual-id', data: () => saved }] })),
  doc: document,
  add,
};
const collection = mock((_name: string) => query);
mock.module('../src/lib/server/firebase', () => ({ getDatabase: () => ({ collection }) }));
const { WishlistRepository } = await import('../src/modules/wishlist/wishlist.repository');

beforeEach(() => {
  for (const stub of [
    readDocument,
    updateDocument,
    deleteDocument,
    document,
    add,
    collection,
    query.orderBy,
    query.where,
    query.startAfter,
    query.limit,
    query.get,
  ])
    stub.mockClear();
});

test('Admin reads retain the collection, owner query, order, and page size', async () => {
  const result = await WishlistRepository.findAll('me');
  expect(collection).toHaveBeenCalledWith('items');
  expect(query.where).toHaveBeenCalledWith('owner', '==', 'me');
  expect(query.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
  expect(query.limit).toHaveBeenCalledWith(6);
  expect(result.items[0]).toEqual({
    ...saved,
    id: 'actual-id',
    createdAt: saved.createdAt.toDate().toISOString(),
  });
  expect(result.nextCursor).toBeNull();
});

test('Admin create retains server timestamps and the existing payload', async () => {
  const input = { owner: 'her' as const, topic: 'Brand', name: 'Item' };
  expect(await WishlistRepository.create(input)).toBe('created-id');
  const payload = add.mock.calls[0][0] as Record<string, unknown>;
  expect(payload).toMatchObject(input);
  expect(FieldValue.serverTimestamp().isEqual(payload.createdAt as FieldValue)).toBe(true);
});

test('nullable image removal uses Firestore field deletion, not stored nulls', async () => {
  await WishlistRepository.update('item-id', {
    name: 'Updated',
    imageUrl: null,
    imagePublicId: null,
  });
  expect(document).toHaveBeenCalledWith('item-id');
  const payload = updateDocument.mock.calls[0][0] as Record<string, unknown>;
  expect(payload.name).toBe('Updated');
  expect(FieldValue.delete().isEqual(payload.imageUrl as FieldValue)).toBe(true);
  expect(FieldValue.delete().isEqual(payload.imagePublicId as FieldValue)).toBe(true);
  expect(payload).not.toHaveProperty('createdAt');
});

test('Admin deletion targets only the requested document', async () => {
  await WishlistRepository.delete('item-id');
  expect(collection).toHaveBeenCalledWith('items');
  expect(document).toHaveBeenCalledWith('item-id');
  expect(deleteDocument).toHaveBeenCalledTimes(1);
});
