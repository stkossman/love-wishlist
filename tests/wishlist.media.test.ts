import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { Timestamp } from 'firebase-admin/firestore';
import {
  v2 as cloudinarySdk,
  type UploadApiResponse,
  type UploadApiOptions,
  type UploadResponseCallback,
} from 'cloudinary';
import { PassThrough } from 'node:stream';
import * as firebase from '../src/lib/server/firebase';
import * as cloudinary from '../src/lib/server/cloudinary';
import { WishlistService } from '../src/modules/wishlist/wishlist.service';
import { WishlistRepository } from '../src/modules/wishlist/wishlist.repository';
import {
  WishlistMediaRepository,
  ORPHAN_GRACE_MS,
} from '../src/modules/wishlist/wishlist-media.repository';
import {
  WishlistMediaService,
  validateImageContents,
} from '../src/modules/wishlist/wishlist-media.service';
import { imageVersion } from '../src/modules/wishlist/wishlist-image-version';
import { mapImageMetadata } from '../src/modules/wishlist/utils/image';
import { createMemoryFirestore } from './helpers/firestore';

let memory: ReturnType<typeof createMemoryFirestore>;
const previousCloud = process.env.CLOUDINARY_CLOUD_NAME;
const previousToken = process.env.TELEGRAM_BOT_TOKEN;
const previousChat = process.env.TELEGRAM_CHAT_ID;
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aE0cAAAAASUVORK5CYII=',
  'base64'
);
const item = { owner: 'me' as const, topic: 'Brand', name: 'Gift' };
const metadata = (publicId: string) => ({
  publicId,
  secureUrl: `https://res.cloudinary.com/test-cloud/image/upload/v1/${publicId}.png`,
  width: 1,
  height: 1,
  format: 'png',
  bytes: png.length,
});
const upload = () => WishlistMediaService.upload(png, 'image/png');
const imagePath = (publicId: string) =>
  `wishlistImages/${Buffer.from(publicId).toString('base64url')}`;
const record = (publicId: string) => memory.documents.get(imagePath(publicId))!;
const payload = (image: ReturnType<typeof metadata>) => ({ ...item, ...mapImageMetadata(image) });
const getItem = (id: string) => memory.documents.get(`items/${id}`)!;
const version = (id: string) => imageVersion(getItem(id));
const failure = (promise: Promise<unknown>) => promise.catch((error: unknown) => error);

beforeEach(() => {
  process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';
  process.env.TELEGRAM_BOT_TOKEN = '';
  process.env.TELEGRAM_CHAT_ID = '';
  memory = createMemoryFirestore();
  spyOn(firebase, 'getDatabase').mockReturnValue(memory.db);
  spyOn(cloudinary, 'uploadWishlistImage').mockImplementation(async (_buffer, publicId) => {
    expect(record(publicId).state).toBe('uploading');
    return metadata(publicId);
  });
  spyOn(cloudinary, 'deleteWishlistImage').mockImplementation(async (publicId) => {
    expect(record(publicId).state).toBe('deleting');
    expect(
      [...memory.documents.entries()].filter(
        ([path, data]) =>
          path.startsWith('items/') &&
          (data.imagePublicId === publicId || data.imageUrl === metadata(publicId).secureUrl)
      )
    ).toHaveLength(0);
    memory.events.push(`cloud-delete:${publicId}`);
  });
  spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  mock.restore();
  if (previousCloud === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
  else process.env.CLOUDINARY_CLOUD_NAME = previousCloud;
  if (previousToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
  else process.env.TELEGRAM_BOT_TOKEN = previousToken;
  if (previousChat === undefined) delete process.env.TELEGRAM_CHAT_ID;
  else process.env.TELEGRAM_CHAT_ID = previousChat;
});

test('content checks reject spoofed MIME types, empty/truncated files and malformed WebP lengths', () => {
  expect(() => validateImageContents(png, 'image/png')).not.toThrow();
  expect(() =>
    validateImageContents(Buffer.from([255, 216, 255, 217]), 'image/jpeg')
  ).not.toThrow();
  const webp = Buffer.alloc(20);
  webp.write('RIFF');
  webp.writeUInt32LE(12, 4);
  webp.write('WEBPVP8 ', 8);
  expect(() => validateImageContents(webp, 'image/webp')).not.toThrow();
  for (const [buffer, mime] of [
    [png, 'image/jpeg'],
    [Buffer.from('<svg/>'), 'image/png'],
    [Buffer.alloc(0), 'image/png'],
    [png.subarray(0, 16), 'image/png'],
  ] as const)
    expect(() => validateImageContents(buffer, mime)).toThrow();
  webp.writeUInt32LE(500, 4);
  expect(() => validateImageContents(webp, 'image/webp')).toThrow();
  expect(() =>
    validateImageContents(Buffer.concat([png, Buffer.alloc(5 * 1024 * 1024)]), 'image/png')
  ).toThrow();
});

test('provider metadata verifies account, identity, format, dimensions and byte bounds', () => {
  const raw = {
    public_id: 'wishlist/test',
    secure_url: metadata('wishlist/test').secureUrl,
    resource_type: 'image',
    type: 'upload',
    width: 1,
    height: 1,
    format: 'png',
    bytes: png.length,
  };
  expect(cloudinary.toImageMetadata(raw as UploadApiResponse, 'wishlist/test')).toEqual(
    metadata('wishlist/test')
  );
  for (const patch of [
    { public_id: 'wishlist/other' },
    { resource_type: 'raw' },
    { type: 'private' },
    { format: 'svg' },
    { width: 0 },
    { bytes: 6 * 1024 * 1024 },
    { secure_url: raw.secure_url.replace('test-cloud', 'other-cloud') },
    { secure_url: raw.secure_url.replace('test.png', 'other.png') },
  ]) {
    expect(() =>
      cloudinary.toImageMetadata({ ...raw, ...patch } as UploadApiResponse, 'wishlist/test')
    ).toThrow();
  }
});

test('creating without an image retains the item schema and performs no media operations', async () => {
  const id = await WishlistService.createItem(item);
  expect(getItem(id)).toMatchObject(item);
  expect(getItem(id).createdAt).toBeInstanceOf(Timestamp);
  expect([...memory.documents.keys()]).toEqual([`items/${id}`]);
  expect(cloudinary.uploadWishlistImage).not.toHaveBeenCalled();
  expect(cloudinary.deleteWishlistImage).not.toHaveBeenCalled();
});

test('server upload is registered before Cloudinary, and the item atomically claims authoritative metadata', async () => {
  const image = await upload();
  expect(record(image.publicId).state).toBe('ready');
  const id = await WishlistService.createItem({ ...payload(image), imageWidth: 999 });
  expect(getItem(id).imageWidth).toBe(1);
  expect(record(image.publicId)).toMatchObject({ state: 'attached', itemId: id });
  expect(cloudinary.deleteWishlistImage).not.toHaveBeenCalled();
});

test('unregistered IDs, forged URLs and sharing an attached asset are rejected', async () => {
  expect(
    await failure(WishlistService.createItem(payload(metadata('wishlist/arbitrary'))))
  ).toMatchObject({ status: 409 });
  const image = await upload();
  expect(
    await failure(
      WishlistService.createItem({
        ...payload(image),
        imageUrl: metadata('wishlist/other').secureUrl,
      })
    )
  ).toMatchObject({ status: 409 });
  await WishlistService.createItem(payload(image));
  expect(
    await failure(WishlistService.createItem({ ...payload(image), name: 'Different item' }))
  ).toMatchObject({ status: 409 });
});

test('upload failure and failed registration remain observable without unsafe deletion', async () => {
  spyOn(cloudinary, 'uploadWishlistImage').mockRejectedValueOnce(
    new Error('private-provider-secret')
  );
  expect(await failure(upload())).toMatchObject({ status: 502 });
  expect([...memory.documents.values()][0].state).toBe('uploading');
  expect(JSON.stringify(mockedLogs())).not.toContain('private-provider-secret');
  memory.faults.beforeCommit = true;
  expect(await failure(upload())).toMatchObject({ status: 502 });
  expect([...memory.documents.values()].map((data) => data.state)).toEqual([
    'uploading',
    'uploading',
  ]);
  expect(cloudinary.deleteWishlistImage).not.toHaveBeenCalled();
});
function mockedLogs() {
  return (console.error as ReturnType<typeof mock>).mock.calls;
}

test('confirmed persistence failure rolls back ownership and retains the upload for retry', async () => {
  const image = await upload();
  memory.faults.beforeCommit = true;
  expect(await failure(WishlistService.createItem(payload(image)))).toBeInstanceOf(Error);
  expect(record(image.publicId).state).toBe('ready');
  expect(cloudinary.deleteWishlistImage).not.toHaveBeenCalled();
  const id = await WishlistService.createItem(payload(image));
  expect(getItem(id).imagePublicId).toBe(image.publicId);
});

test('a lost create response does not delete a committed image and retry reuses the same item', async () => {
  const image = await upload();
  memory.faults.afterCommit = true;
  expect(await failure(WishlistService.createItem(payload(image)))).toMatchObject({
    message: 'Response lost after commit',
  });
  expect(record(image.publicId).state).toBe('attached');
  const id = await WishlistService.createItem(payload(image));
  expect([...memory.documents.keys()].filter((key) => key.startsWith('items/'))).toEqual([
    `items/${id}`,
  ]);
  expect(cloudinary.deleteWishlistImage).not.toHaveBeenCalled();
});

test('replacement persists the new reference before retiring and deleting the previous asset', async () => {
  const old = await upload();
  const id = await WishlistService.createItem(payload(old));
  const next = await upload();
  await WishlistService.updateItem(id, { name: 'Updated', ...mapImageMetadata(next) }, version(id));
  expect(getItem(id)).toMatchObject({ name: 'Updated', imagePublicId: next.publicId });
  expect(record(old.publicId).state).toBe('deleted');
  expect(record(next.publicId).state).toBe('attached');
  expect(cloudinary.deleteWishlistImage).toHaveBeenCalledTimes(1);
});

test('removal clears all metadata after commit; unrelated and unchanged-image updates never delete', async () => {
  const image = await upload();
  const id = await WishlistService.createItem(payload(image));
  await WishlistService.updateItem(id, { price: '10 EUR' });
  await WishlistService.updateItem(id, mapImageMetadata(image), version(id));
  expect(cloudinary.deleteWishlistImage).not.toHaveBeenCalled();
  await WishlistService.updateItem(id, { imageUrl: null, imagePublicId: null }, version(id));
  for (const key of Object.keys(mapImageMetadata(image)))
    expect(getItem(id)).not.toHaveProperty(key);
  expect(record(image.publicId).state).toBe('deleted');
});

test('legacy URL-only and untracked wishlist assets are removable but never automatically destroyed', async () => {
  for (const image of [
    { imageUrl: 'https://example.test/legacy.png' },
    { ...mapImageMetadata(metadata('wishlist/legacy')) },
  ]) {
    memory.documents.set('items/legacy', { ...item, ...image, createdAt: Timestamp.now() });
    await WishlistService.updateItem(
      'legacy',
      { imageUrl: null, imagePublicId: null },
      version('legacy')
    );
    expect(getItem('legacy')).not.toHaveProperty('imageUrl');
  }
  expect(cloudinary.deleteWishlistImage).not.toHaveBeenCalled();
});

test('failed replacement preserves the current asset and leaves the new upload ready', async () => {
  const old = await upload();
  const id = await WishlistService.createItem(payload(old));
  const next = await upload();
  memory.faults.beforeCommit = true;
  expect(
    await failure(WishlistService.updateItem(id, mapImageMetadata(next), version(id)))
  ).toMatchObject({ message: 'Persistence failed' });
  expect(getItem(id).imagePublicId).toBe(old.publicId);
  expect(record(old.publicId).state).toBe('attached');
  expect(record(next.publicId).state).toBe('ready');
  expect(cloudinary.deleteWishlistImage).not.toHaveBeenCalled();
});

test('stale image writes cannot remove a replacement, and missing versions fail safely', async () => {
  const old = await upload();
  const id = await WishlistService.createItem(payload(old));
  const stale = version(id);
  const next = await upload();
  await WishlistService.updateItem(id, mapImageMetadata(next), stale);
  expect(
    await failure(WishlistService.updateItem(id, { imageUrl: null, imagePublicId: null }, stale))
  ).toMatchObject({ status: 409 });
  expect(
    await failure(WishlistService.updateItem(id, { imageUrl: null, imagePublicId: null }))
  ).toMatchObject({ status: 428 });
  expect(getItem(id).imagePublicId).toBe(next.publicId);
});

test('concurrent replacements with the same version serialize to one winner', async () => {
  const old = await upload();
  const id = await WishlistService.createItem(payload(old));
  const expected = version(id);
  const a = await upload(),
    b = await upload();
  const results = await Promise.allSettled([
    WishlistService.updateItem(id, mapImageMetadata(a), expected),
    WishlistService.updateItem(id, mapImageMetadata(b), expected),
  ]);
  expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
  expect(record(b.publicId).state).toBe('ready');
  expect(getItem(id).imagePublicId).toBe(a.publicId);
});

test('lost update response retains the committed image, supports idempotent retry, and leaves retirement durable', async () => {
  const old = await upload();
  const id = await WishlistService.createItem(payload(old));
  const expected = version(id);
  const next = await upload();
  memory.faults.afterCommit = true;
  expect(
    await failure(WishlistService.updateItem(id, mapImageMetadata(next), expected))
  ).toMatchObject({ message: 'Response lost after commit' });
  expect(record(old.publicId).state).toBe('retired');
  expect(getItem(id).imagePublicId).toBe(next.publicId);
  await WishlistService.updateItem(id, mapImageMetadata(next), expected);
  expect(cloudinary.deleteWishlistImage).not.toHaveBeenCalled();
});

test('cleanup failure preserves successful update and deletion, logs safely, and leaves a durable retry record', async () => {
  const old = await upload();
  const id = await WishlistService.createItem(payload(old));
  spyOn(cloudinary, 'deleteWishlistImage').mockRejectedValueOnce(
    new Error('secret-provider-response')
  );
  await WishlistService.updateItem(id, { imageUrl: null, imagePublicId: null }, version(id));
  expect(getItem(id)).not.toHaveProperty('imageUrl');
  expect(record(old.publicId).state).toBe('deleting');
  expect(JSON.stringify(mockedLogs())).not.toContain('secret-provider-response');
  const next = await upload();
  await WishlistService.updateItem(id, mapImageMetadata(next), version(id));
  spyOn(cloudinary, 'deleteWishlistImage').mockRejectedValueOnce(new Error('failure'));
  await WishlistService.deleteItem(id);
  expect(memory.documents.has(`items/${id}`)).toBe(false);
  expect(record(next.publicId).state).toBe('deleting');
});

test('cleanup rejects references by ID or canonical URL, including legacy URL-only items', async () => {
  for (const urlOnly of [false, true]) {
    const image = await upload();
    record(image.publicId).state = 'retired';
    memory.documents.set(
      'items/reference',
      urlOnly ? { imageUrl: image.secureUrl } : { imagePublicId: image.publicId }
    );
    expect(await WishlistMediaService.cleanup(image.publicId)).toBe('retained');
    memory.documents.delete('items/reference');
  }
  expect(cloudinary.deleteWishlistImage).not.toHaveBeenCalled();
});

test('the deleting state blocks attachment while a provider deletion is in progress', async () => {
  const image = await upload();
  record(image.publicId).state = 'retired';
  let release!: () => void;
  spyOn(cloudinary, 'deleteWishlistImage').mockReturnValueOnce(
    new Promise((done) => {
      release = done;
    })
  );
  const cleanup = WishlistMediaService.cleanup(image.publicId);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(record(image.publicId).state).toBe('deleting');
  expect(await failure(WishlistService.createItem(payload(image)))).toMatchObject({ status: 409 });
  release();
  expect(await cleanup).toBe('deleted');
});

test('orphan inspection is dry-run, excludes recent uploads, and recovery rechecks references and ownership', async () => {
  const recent = await upload();
  const old = await upload();
  record(old.publicId).createdAt = Timestamp.fromMillis(Date.now() - ORPHAN_GRACE_MS - 1000);
  record(old.publicId).updatedAt = Timestamp.fromMillis(Date.now() - ORPHAN_GRACE_MS - 1000);
  const before = JSON.stringify([...memory.documents]);
  expect(await WishlistMediaRepository.inspectOrphans()).toEqual([
    { publicId: old.publicId, cloudName: 'test-cloud', state: 'ready', referenced: false },
  ]);
  expect(JSON.stringify([...memory.documents])).toBe(before);
  expect(cloudinary.deleteWishlistImage).not.toHaveBeenCalled();
  await WishlistService.createItem(payload(old));
  expect(await WishlistMediaService.cleanup(old.publicId, true)).toBe('retained');
  expect(await WishlistMediaService.cleanup(recent.publicId, true)).toBe('retained');
});

test('old abandoned uploads and failed deletions are recoverable after the grace period; tombstones prevent reuse', async () => {
  const image = await upload();
  const saved = record(image.publicId);
  saved.state = 'uploading';
  saved.createdAt = Timestamp.fromMillis(0);
  saved.updatedAt = Timestamp.fromMillis(0);
  expect(await WishlistMediaService.cleanup(image.publicId, true)).toBe('deleted');
  expect(await failure(WishlistService.createItem(payload(image)))).toMatchObject({ status: 409 });
  saved.state = 'deleting';
  saved.createdAt = Timestamp.fromMillis(0);
  saved.updatedAt = Timestamp.fromMillis(0);
  memory.documents.set(imagePath(image.publicId), saved);
  expect(await WishlistMediaService.cleanup(image.publicId, true)).toBe('deleted');
});

test('the non-media persistence path cannot bypass ownership checks', async () => {
  expect(
    await failure(WishlistRepository.update('anything', { imageUrl: null, imagePublicId: null }))
  ).toMatchObject({ message: 'Image updates require the transactional media path' });
});

test('Cloudinary upload uses a non-overwriting server ID, restricted decoder formats and a finite timeout', async () => {
  spyOn(cloudinary, 'uploadWishlistImage').mockRestore();
  const raw = {
    public_id: 'wishlist/test',
    secure_url: metadata('wishlist/test').secureUrl,
    resource_type: 'image',
    type: 'upload',
    width: 1,
    height: 1,
    format: 'png',
    bytes: png.length,
  };
  const stream = new PassThrough();
  const uploadStream = spyOn(cloudinarySdk.uploader, 'upload_stream').mockImplementation(
    (options?: UploadApiOptions | UploadResponseCallback, callback?: UploadResponseCallback) => {
      const complete = typeof options === 'function' ? options : callback;
      queueMicrotask(() => complete?.(undefined, raw as UploadApiResponse));
      return stream as ReturnType<typeof cloudinarySdk.uploader.upload_stream>;
    }
  );
  const originalKey = process.env.CLOUDINARY_API_KEY,
    originalSecret = process.env.CLOUDINARY_API_SECRET;
  process.env.CLOUDINARY_API_KEY = 'test-only';
  process.env.CLOUDINARY_API_SECRET = 'test-only';
  try {
    expect(await cloudinary.uploadWishlistImage(png, 'wishlist/test')).toEqual(
      metadata('wishlist/test')
    );
    expect(uploadStream.mock.calls[0][0]).toMatchObject({
      public_id: 'wishlist/test',
      overwrite: false,
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
      timeout: 10000,
    });
  } finally {
    if (originalKey === undefined) delete process.env.CLOUDINARY_API_KEY;
    else process.env.CLOUDINARY_API_KEY = originalKey;
    if (originalSecret === undefined) delete process.env.CLOUDINARY_API_SECRET;
    else process.env.CLOUDINARY_API_SECRET = originalSecret;
  }
});

test('Cloudinary deletion rejects foreign IDs and unconfirmed outcomes, accepting an already absent asset', async () => {
  spyOn(cloudinary, 'deleteWishlistImage').mockRestore();
  const destroy = spyOn(cloudinarySdk.uploader, 'destroy');
  expect(await failure(cloudinary.deleteWishlistImage('other/asset'))).toMatchObject({
    status: 400,
  });
  expect(destroy).not.toHaveBeenCalled();
  const originalKey = process.env.CLOUDINARY_API_KEY,
    originalSecret = process.env.CLOUDINARY_API_SECRET;
  process.env.CLOUDINARY_API_KEY = 'test-only';
  process.env.CLOUDINARY_API_SECRET = 'test-only';
  try {
    destroy.mockResolvedValueOnce({ result: 'error' });
    expect(await failure(cloudinary.deleteWishlistImage('wishlist/test'))).toMatchObject({
      message: 'Image deletion was not confirmed',
    });
    destroy.mockResolvedValueOnce({ result: 'not found' });
    expect(await cloudinary.deleteWishlistImage('wishlist/test')).toBeUndefined();
  } finally {
    if (originalKey === undefined) delete process.env.CLOUDINARY_API_KEY;
    else process.env.CLOUDINARY_API_KEY = originalKey;
    if (originalSecret === undefined) delete process.env.CLOUDINARY_API_SECRET;
    else process.env.CLOUDINARY_API_SECRET = originalSecret;
  }
});

test('legacy URL normalization produces the same edit version as the raw stored document', async () => {
  memory.documents.set('items/legacy', {
    ...item,
    imageUrl: 'https://EXAMPLE.test',
    createdAt: Timestamp.now(),
  });
  const mapped = await WishlistRepository.findById('legacy');
  expect(imageVersion(mapped!)).toBe(version('legacy'));
  await WishlistService.updateItem(
    'legacy',
    { imageUrl: null, imagePublicId: null },
    imageVersion(mapped!)
  );
  expect(getItem('legacy')).not.toHaveProperty('imageUrl');
});

test('recovery never deletes an asset through a different configured Cloudinary account', async () => {
  const image = await upload();
  record(image.publicId).state = 'retired';
  process.env.CLOUDINARY_CLOUD_NAME = 'other-cloud';
  expect(await WishlistMediaService.cleanup(image.publicId)).toBe('retained');
  expect(record(image.publicId).state).toBe('retired');
  expect(cloudinary.deleteWishlistImage).not.toHaveBeenCalled();
});

for (const first of ['attachment', 'cleanup'] as const) {
  test(`${first} wins a race between attachment and orphan cleanup without deleting a reference`, async () => {
    const image = await upload();
    record(image.publicId).createdAt = Timestamp.fromMillis(0);
    record(image.publicId).updatedAt = Timestamp.fromMillis(0);
    const operations = {
      attachment: () => WishlistService.createItem(payload(image)),
      cleanup: () => WishlistMediaService.cleanup(image.publicId, true),
    };
    const second = first === 'attachment' ? 'cleanup' : 'attachment';
    const results = await Promise.allSettled([operations[first](), operations[second]()]);
    if (first === 'attachment') {
      expect(results[0].status).toBe('fulfilled');
      expect(results[1]).toMatchObject({ status: 'fulfilled', value: 'retained' });
      expect(record(image.publicId).state).toBe('attached');
      expect(cloudinary.deleteWishlistImage).not.toHaveBeenCalled();
    } else {
      expect(results[0]).toMatchObject({ status: 'fulfilled', value: 'deleted' });
      expect(results[1]).toMatchObject({ status: 'rejected', reason: { status: 409 } });
      expect(record(image.publicId).state).toBe('deleted');
      expect([...memory.documents.keys()].some((path) => path.startsWith('items/'))).toBe(false);
    }
  });
}

test('duplicate recovery workers claim an abandoned asset only once during the grace window', async () => {
  const image = await upload();
  record(image.publicId).createdAt = Timestamp.fromMillis(0);
  record(image.publicId).updatedAt = Timestamp.fromMillis(0);
  const results = await Promise.all([
    WishlistMediaService.cleanup(image.publicId, true),
    WishlistMediaService.cleanup(image.publicId, true),
  ]);
  expect(results.sort()).toEqual(['deleted', 'retained']);
  expect(cloudinary.deleteWishlistImage).toHaveBeenCalledTimes(1);
});

test('occasion create/edit/remove preserves image ownership through both update paths and retries', async () => {
  const image = await upload();
  const occasion = { type: 'birthday', year: 2027, desire: 4 } as const;
  const id = await WishlistRepository.create({ ...payload(image), occasion });
  expect((await WishlistRepository.findById(id))?.occasion).toEqual(occasion);
  await WishlistService.updateItem(id, { occasion: { ...occasion, desire: 5 } });
  expect(getItem(id).imagePublicId).toBe(image.publicId);
  expect(record(image.publicId).itemId).toBe(id);
  await WishlistService.updateItem(id, { occasion: null });
  expect(getItem(id)).not.toHaveProperty('occasion');
  expect((await WishlistRepository.findById(id))?.name).toBe('Gift');
  const replacement = await upload();
  const expectedVersion = version(id);
  const update = { ...mapImageMetadata(replacement), occasion };
  await WishlistService.updateItem(id, update, expectedVersion);
  await WishlistService.updateItem(id, update, expectedVersion);
  expect(getItem(id).occasion).toEqual(occasion);
  expect(record(replacement.publicId).itemId).toBe(id);
  const removalVersion = version(id);
  const removal = { imageUrl: null, imagePublicId: null, occasion: null };
  await WishlistService.updateItem(id, removal, removalVersion);
  await WishlistService.updateItem(id, removal, removalVersion);
  expect(getItem(id)).not.toHaveProperty('occasion');
  expect(getItem(id)).not.toHaveProperty('imagePublicId');
});

test('occasion filtering precedes pagination for combined and owner feeds, with legacy compatibility', async () => {
  const timestamp = new Timestamp(1700000000, 123456789);
  for (let n = 0; n < 28; n++) {
    const id = String(n).padStart(2, '0');
    memory.documents.set(`items/${id}`, {
      ...item,
      owner: n % 2 ? 'her' : 'me',
      createdAt: timestamp,
      ...(n < 4
        ? {}
        : {
            occasion: {
              type: n < 24 ? 'birthday' : 'christmas',
              year: n < 20 ? 2027 : 2026,
              desire: 3,
            },
          }),
    });
  }
  expect((await WishlistRepository.findById('00'))?.occasion).toBeUndefined();
  expect((await WishlistRepository.findAll()).items).toHaveLength(6);
  for (const owner of [undefined, 'me', 'her'] as const) {
    const filters = { occasions: true, type: 'birthday', year: 2027 } as const;
    const ids: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await WishlistRepository.findAll(owner, cursor, filters);
      ids.push(...page.items.map((wish) => wish.id));
      expect(
        page.items.every(
          (wish) =>
            wish.occasion?.year === 2027 &&
            wish.occasion.type === 'birthday' &&
            (!owner || wish.owner === owner)
        )
      ).toBe(true);
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    const expected = [...memory.documents.entries()]
      .filter(([, data]) => {
        const o = data.occasion as { type: string; year: number } | undefined;
        return o?.type === 'birthday' && o.year === 2027 && (!owner || data.owner === owner);
      })
      .map(([path]) => path.split('/')[1])
      .sort()
      .reverse();
    expect(ids).toEqual(expected);
    expect(new Set(ids).size).toBe(ids.length);
  }
  expect(
    (await WishlistRepository.findAll(undefined, undefined, { occasions: true })).items.every(
      (wish) => wish.occasion
    )
  ).toBe(true);
  expect(
    (await WishlistRepository.findAll(undefined, undefined, { year: 2026 })).items.every(
      (wish) => wish.occasion?.year === 2026
    )
  ).toBe(true);
  const page = await WishlistRepository.findAll(undefined, undefined, { occasions: true });
  expect(
    await failure(WishlistRepository.findAll('me', page.nextCursor!, { occasions: true }))
  ).toBeInstanceOf(Error);
  expect(
    await failure(WishlistRepository.findAll(undefined, 'bad', { occasions: true }))
  ).toBeInstanceOf(Error);
});
