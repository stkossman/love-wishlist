import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { imageVersion } from '../src/modules/wishlist/wishlist-image-version';
import { FieldPath, FieldValue, Timestamp } from 'firebase-admin/firestore';

const saved = {
  owner: 'me' as const,
  topic: 'Brand',
  name: 'Item',
  createdAt: Timestamp.fromMillis(1_700_000_000_000),
};
const readDocument = mock<
  () => Promise<{ id: string; data: () => Record<string, unknown> | undefined }>
>(async () => ({ id: 'actual-id', data: () => saved }));
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
  startAfter: mock((_cursor: Timestamp, _id: string): typeof query => query),
  limit: mock((_limit: number): typeof query => query),
  get: mock<() => Promise<{ docs: { id: string; data: () => Record<string, unknown> }[] }>>(
    async () => ({ docs: [{ id: 'actual-id', data: () => saved }] })
  ),
  doc: document,
  add,
};
const collection = mock((_name: string) => query);
const transaction = {
  get: async (ref: ReturnType<typeof document>) => ref.get(),
  delete: (ref: ReturnType<typeof document>) => {
    void ref.delete();
  },
  update: (ref: ReturnType<typeof document>, data: unknown) => {
    void ref.update(data);
  },
};
mock.module('../src/lib/server/firebase', () => ({
  getDatabase: () => ({
    collection,
    runTransaction: async (action: (tx: typeof transaction) => unknown) => action(transaction),
  }),
}));
const { WishlistRepository } = await import('../src/modules/wishlist/wishlist.repository');

afterEach(() => mock.restore());

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
  await WishlistRepository.replaceImage(
    'item-id',
    {
      name: 'Updated',
      imageUrl: null,
      imagePublicId: null,
    },
    imageVersion({ imageUrl: undefined })
  );
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

test('nanosecond cursor and document identity reach Admin without a document lookup', async () => {
  const { encodeCursor } = await import('../src/modules/wishlist/wishlist.cursor');
  const timestamp = new Timestamp(1_700_000_000, 123456789);
  for (const owner of ['me', 'her'] as const) {
    await WishlistRepository.findAll(owner, encodeCursor(timestamp, 'deleted-boundary', owner));
    expect(query.orderBy).toHaveBeenCalledWith(FieldPath.documentId(), 'desc');
    expect(query.startAfter).toHaveBeenLastCalledWith(timestamp, 'deleted-boundary');
    expect(query.where).toHaveBeenLastCalledWith('owner', '==', owner);
  }
  expect(readDocument).not.toHaveBeenCalled();
});

test('full pages encode the raw final timestamp, not the display ISO date', async () => {
  const { decodeCursor } = await import('../src/modules/wishlist/wishlist.cursor');
  const timestamp = new Timestamp(1_700_000_000, 987654321);
  query.get.mockResolvedValueOnce({
    docs: Array.from({ length: 6 }, (_, i) => ({
      id: `doc-${6 - i}`,
      data: () => ({ ...saved, createdAt: timestamp }),
    })),
  });
  const page = await WishlistRepository.findAll('me');
  expect(page.items).toHaveLength(6);
  expect(decodeCursor(page.nextCursor!, 'me')).toEqual({ timestamp, id: 'doc-1' });
});

test('invalid cursors fail before accessing Firestore', async () => {
  expect(
    await WishlistRepository.findAll('me', '2024-01-01T00:00:00.000Z').catch(
      (error: unknown) => error
    )
  ).toMatchObject({ status: 400 });
  expect(collection).not.toHaveBeenCalled();
});

test('legacy and malformed optional fields map safely with actual document identity', async () => {
  readDocument.mockResolvedValueOnce({
    id: 'actual-id',
    data: () => ({
      ...saved,
      id: 'forged-id',
      name: 123,
      topic: null,
      createdAt: '2023-11-14T22:13:20.000Z',
      price: { bad: true },
      url: 'javascript:alert(1)',
      imageWidth: -1,
      specs: [null, {}, { label: 'Size', value: 'M' }, { label: 1, value: 'bad' }],
    }),
  });
  expect(await WishlistRepository.findById('actual-id')).toEqual({
    id: 'actual-id',
    owner: 'me',
    name: 'Untitled item',
    topic: '',
    createdAt: '2023-11-14T22:13:20.000Z',
    specs: [{ label: 'Size', value: 'M' }],
  });
});

test('missing and malformed stored timestamps do not crash detail mapping', async () => {
  for (const createdAt of [undefined, null, {}, 'bad date', new Date(NaN)]) {
    readDocument.mockResolvedValueOnce({ id: 'actual-id', data: () => ({ ...saved, createdAt }) });
    expect((await WishlistRepository.findById('actual-id'))?.createdAt).toBe('');
  }
});

test('unrecognized stored owners fail explicitly rather than assigning another owner', async () => {
  readDocument.mockResolvedValueOnce({
    id: 'actual-id',
    data: () => ({ ...saved, owner: 'unknown' }),
  });
  expect(
    await WishlistRepository.findById('actual-id').catch((error: unknown) => error)
  ).toMatchObject({ message: 'Invalid stored wishlist owner' });
});

test('missing documents return null and update not-found is distinguished from provider failure', async () => {
  readDocument.mockResolvedValueOnce({ id: 'actual-id', data: () => undefined });
  expect(await WishlistRepository.findById('missing')).toBeNull();
  updateDocument.mockRejectedValueOnce({ code: 5 });
  expect(await WishlistRepository.update('missing', { name: 'Name' })).toBe(false);
  updateDocument.mockRejectedValueOnce({ code: 7 });
  expect(
    await WishlistRepository.update('forbidden', { name: 'Name' }).catch((error: unknown) => error)
  ).toEqual({ code: 7 });
});

test('multiple pages with ties, sub-millisecond differences and deletions have no skips or duplicates', async () => {
  for (const owner of ['me', 'her'] as const) {
    const docs = Array.from({ length: 16 }, (_, index) => ({
      id: `doc-${String(16 - index).padStart(2, '0')}`,
      data: () => ({
        ...saved,
        owner,
        createdAt: new Timestamp(1700000000, index < 9 ? 123456789 : 123456788),
      }),
    }));
    query.startAfter.mockClear();
    query.get.mockImplementation(async () => {
      const boundary = query.startAfter.mock.lastCall;
      return {
        docs: docs
          .filter(
            (doc) =>
              !boundary ||
              doc.data().createdAt.seconds < boundary[0].seconds ||
              (doc.data().createdAt.seconds === boundary[0].seconds &&
                (doc.data().createdAt.nanoseconds < boundary[0].nanoseconds ||
                  (doc.data().createdAt.nanoseconds === boundary[0].nanoseconds &&
                    doc.id < boundary[1])))
          )
          .slice(0, 6),
      };
    });
    try {
      const first = await WishlistRepository.findAll(owner);
      docs.splice(5, 2); // Delete the boundary document and one unseen document.
      const second = await WishlistRepository.findAll(owner, first.nextCursor!);
      const third = await WishlistRepository.findAll(owner, second.nextCursor!);
      const ids = [...first.items, ...second.items, ...third.items].map((item) => item.id);
      expect(ids).toEqual(
        Array.from(
          { length: 16 },
          (_, index) => `doc-${String(16 - index).padStart(2, '0')}`
        ).filter((id) => id !== 'doc-10')
      );
      expect(new Set(ids).size).toBe(ids.length);
      expect(third.nextCursor).toBeNull();
    } finally {
      query.get.mockImplementation(async () => ({
        docs: [{ id: 'actual-id', data: () => saved }],
      }));
    }
  }
});

test('service waits for Telegram completion and isolates provider failures after persistence', async () => {
  const { WishlistService } = await import('../src/modules/wishlist/wishlist.service');
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousChat = process.env.TELEGRAM_CHAT_ID;
  process.env.TELEGRAM_BOT_TOKEN = 'test-only-token';
  process.env.TELEGRAM_CHAT_ID = 'test-only-chat';
  const log = spyOn(console, 'error').mockImplementation(() => {});
  const notify = spyOn(globalThis, 'fetch');
  try {
    let rejectNotification!: (error: Error) => void;
    notify.mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectNotification = reject;
      })
    );
    let settled = false;
    const pending = WishlistService.createItem({
      owner: 'me',
      topic: 'Brand',
      name: '<Item>',
    }).finally(() => {
      settled = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(add).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    rejectNotification(new Error('secret-provider-detail'));
    expect(await pending).toBe('created-id');
    expect(log).toHaveBeenCalledWith('Telegram create notification failed', 'Error');
    expect(JSON.stringify(log.mock.calls)).not.toContain('secret-provider-detail');
    notify.mockResolvedValueOnce(new Response(JSON.stringify({ ok: false }), { status: 200 }));
    expect(await WishlistService.deleteItem('actual-id')).toBeUndefined();
    expect(deleteDocument).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledWith('Telegram delete notification failed', 'Error');
  } finally {
    if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previousToken;
    if (previousChat === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = previousChat;
  }
});

test('service turns missing documents into 404s and never notifies on failed persistence', async () => {
  const { WishlistService } = await import('../src/modules/wishlist/wishlist.service');
  const notify = spyOn(globalThis, 'fetch');
  readDocument.mockResolvedValueOnce({ id: 'missing', data: () => undefined });
  expect(
    await WishlistService.deleteItem('missing').catch((error: unknown) => error)
  ).toMatchObject({ status: 404 });
  expect(deleteDocument).not.toHaveBeenCalled();
  updateDocument.mockRejectedValueOnce({ code: 5 });
  expect(
    await WishlistService.updateItem('missing', { name: 'Name' }).catch((error: unknown) => error)
  ).toMatchObject({ status: 404 });
  add.mockRejectedValueOnce(new Error('Persistence unavailable'));
  expect(
    await WishlistService.createItem({ owner: 'her', topic: 'Brand', name: 'Name' }).catch(
      (error: unknown) => error
    )
  ).toMatchObject({ message: 'Persistence unavailable' });
  expect(notify).not.toHaveBeenCalled();
});

test('Telegram timeout aborts the request while retaining successful persistence', async () => {
  const { WishlistService } = await import('../src/modules/wishlist/wishlist.service');
  const previousToken = process.env.TELEGRAM_BOT_TOKEN;
  const previousChat = process.env.TELEGRAM_CHAT_ID;
  process.env.TELEGRAM_BOT_TOKEN = 'test-only-token';
  process.env.TELEGRAM_CHAT_ID = 'test-only-chat';
  const log = spyOn(console, 'error').mockImplementation(() => {});
  const notify = spyOn(globalThis, 'fetch');
  let reject!: (error: Error) => void;
  notify.mockReturnValueOnce(
    new Promise((_resolve, rejectRequest) => {
      reject = rejectRequest;
    })
  );
  try {
    const operation = WishlistService.createItem({ owner: 'me', topic: 'Brand', name: 'Name' });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const signal = notify.mock.calls[0][1]?.signal;
    signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), {
      once: true,
    });
    expect(await operation).toBe('created-id');
    expect(signal?.aborted).toBe(true);
    expect(log).toHaveBeenCalledWith('Telegram create notification failed', 'AbortError');
  } finally {
    if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = previousToken;
    if (previousChat === undefined) delete process.env.TELEGRAM_CHAT_ID;
    else process.env.TELEGRAM_CHAT_ID = previousChat;
  }
});

test('description source and format survive persistence without converting legacy records', async () => {
  const source = '**Notes** <script>literal</script>';
  const payload = {
    owner: 'me' as const,
    topic: 'Collection',
    name: 'Wish',
    description: source,
    descriptionFormat: 'markdown' as const,
  };
  await WishlistRepository.create(payload);
  expect(add).toHaveBeenCalledWith(expect.objectContaining(payload));
  readDocument.mockResolvedValueOnce({ id: 'markdown', data: () => ({ ...saved, ...payload }) });
  expect(await WishlistRepository.findById('markdown')).toMatchObject(payload);
  await WishlistRepository.update('markdown', { description: source, descriptionFormat: 'plain' });
  expect(updateDocument).toHaveBeenCalledWith({ description: source, descriptionFormat: 'plain' });
  readDocument.mockResolvedValueOnce({
    id: 'legacy',
    data: () => ({ ...saved, description: '*literal*' }),
  });
  expect(await WishlistRepository.findById('legacy')).not.toHaveProperty('descriptionFormat');
  readDocument.mockResolvedValueOnce({
    id: 'unknown',
    data: () => ({ ...saved, description: '*literal*', descriptionFormat: 'html' }),
  });
  expect(await WishlistRepository.findById('unknown')).not.toHaveProperty('descriptionFormat');
});
