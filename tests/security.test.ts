import { afterEach, beforeEach, describe, expect, mock, spyOn, test } from 'bun:test';
import type { APIContext, APIRoute } from 'astro';
import { createContext } from 'astro/middleware';
import * as cloudinary from '../src/lib/server/cloudinary';
import { WishlistMediaService } from '../src/modules/wishlist/wishlist-media.service';
import { WishlistService } from '../src/modules/wishlist/wishlist.service';
import type { CreateItemDTO } from '../src/modules/wishlist/wishlist.types';
import {
  createSession,
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  verifyPin,
  verifySession,
} from '../src/lib/server/auth';
import { HttpError } from '../src/lib/server/http';
import { LoginRateLimiter } from '../src/lib/server/login-rate-limit';
import { parseCreateItem, parseUpdateItem } from '../src/modules/wishlist/wishlist.validation';

const config = { pin: '2468', secret: 'test-only-signing-secret-'.repeat(3) };
process.env.SECRET_PIN = config.pin;
process.env.SESSION_SECRET = config.secret;
process.env.CLOUDINARY_CLOUD_NAME = 'test-cloud';

const createItem = mock(async (_data: unknown) => 'test-item');
const updateItem = mock(async (_id: string, _data: unknown) => {});
const deleteItem = mock(async (_id: string) => {});
const getItems = mock(async () => ({ items: [], nextCursor: null }));
const metadata = {
  secureUrl: 'https://res.cloudinary.com/test-cloud/image/upload/v1/wishlist/test.png',
  publicId: 'wishlist/test',
  width: 10,
  height: 20,
  format: 'png',
  bytes: 100,
};
const uploadImage = mock(async (_buffer: Buffer) => metadata);
const deleteImage = mock(async (_id: string) => ({ result: 'ok' }));

const items = await import('../src/pages/api/items');
const item = await import('../src/pages/api/items/[id]');
const upload = await import('../src/pages/api/images/upload');
const imageDelete = await import('../src/pages/api/images/delete');
const session = await import('../src/pages/api/auth/session');

const validItem: CreateItemDTO = {
  owner: 'her',
  topic: ' Brand ',
  name: ' Item ',
  price: '',
  url: '',
  description: '',
  specs: [],
};
const imageFields = {
  imageUrl: metadata.secureUrl,
  imagePublicId: metadata.publicId,
  imageWidth: 10,
  imageHeight: 20,
  imageFormat: 'png',
  imageBytes: 100,
};
let client = 0;

function context(
  path: string,
  method: string,
  body?: unknown,
  options: {
    token?: string;
    origin?: string | null;
    raw?: string;
    type?: string;
    fetchSite?: string;
  } = {}
) {
  const headers = new Headers();
  if (options.origin !== null) headers.set('Origin', options.origin ?? 'https://wishlist.test');
  if (options.token) headers.set('Cookie', `${SESSION_COOKIE}=${options.token}`);
  if (options.fetchSite) headers.set('Sec-Fetch-Site', options.fetchSite);
  let requestBody: BodyInit | undefined;
  if (body instanceof FormData) requestBody = body;
  else if (body !== undefined || options.raw !== undefined) {
    headers.set('Content-Type', options.type ?? 'application/json');
    requestBody = options.raw ?? JSON.stringify(body);
  }
  const request = new Request(`https://wishlist.test${path}`, {
    method,
    headers,
    body: requestBody,
  });
  const ctx = createContext({
    request,
    params: { id: 'test-item' },
    defaultLocale: 'en',
    locals: {},
  });
  Object.defineProperty(ctx, 'clientAddress', { value: `test-client-${++client}`, writable: true });
  return ctx;
}

async function invoke(route: APIRoute, ctx: APIContext) {
  return await route(ctx);
}
function signed() {
  return createSession(config);
}

test('occasion mutations retain PIN authorization and server validation', async () => {
  const occasion = { type: 'birthday', year: 2027, desire: 5 };
  expect(
    (await invoke(items.POST, context('/api/items', 'POST', { ...validItem, occasion }))).status
  ).toBe(401);
  expect(
    (await invoke(item.PUT, context('/api/items/test-item', 'PUT', { occasion: null }))).status
  ).toBe(401);
  expect(createItem).not.toHaveBeenCalled();
  expect(updateItem).not.toHaveBeenCalled();
  expect(
    (
      await invoke(
        items.POST,
        context('/api/items', 'POST', { ...validItem, occasion }, { token: signed() })
      )
    ).status
  ).toBe(201);
  expect(createItem).toHaveBeenCalledWith(expect.objectContaining({ occasion }));
  expect(
    (
      await invoke(
        item.PUT,
        context('/api/items/test-item', 'PUT', { occasion: null }, { token: signed() })
      )
    ).status
  ).toBe(200);
  expect(updateItem).toHaveBeenCalledWith('test-item', { occasion: null });
  expect(
    (
      await invoke(
        item.PUT,
        context(
          '/api/items/test-item',
          'PUT',
          { occasion: { ...occasion, desire: 6 } },
          { token: signed() }
        )
      )
    ).status
  ).toBe(400);
});

afterEach(() => mock.restore());

beforeEach(() => {
  spyOn(cloudinary, 'uploadWishlistImage').mockImplementation(uploadImage);
  spyOn(cloudinary, 'deleteWishlistImage').mockImplementation(async (id) => {
    await deleteImage(id);
  });
  spyOn(WishlistMediaService, 'upload').mockImplementation(async (buffer) => uploadImage(buffer));
  spyOn(WishlistService, 'createItem').mockImplementation(createItem);
  spyOn(WishlistService, 'updateItem').mockImplementation(updateItem);
  spyOn(WishlistService, 'deleteItem').mockImplementation(deleteItem);
  spyOn(WishlistService, 'getItems').mockImplementation(getItems);
  for (const stub of [createItem, updateItem, deleteItem, getItems, uploadImage, deleteImage])
    stub.mockClear();
  process.env.SECRET_PIN = config.pin;
  process.env.SESSION_SECRET = config.secret;
});

describe('PIN and session cryptography', () => {
  test('correct PIN succeeds and incorrect/non-text PINs fail', () => {
    expect(verifyPin(config.pin, config)).toBe(true);
    for (const value of ['0000', '246', '24680', 2468, null, {}, 'abcd'])
      expect(verifyPin(value, config)).toBe(false);
    expect(verifyPin('0123', { ...config, pin: '0123' })).toBe(true);
  });
  test('sessions expire at the signed deadline', () => {
    const now = 1_800_000_000_000;
    const token = createSession(config, now);
    expect(verifySession(token, config, now)).toBe(true);
    expect(verifySession(token, config, now + SESSION_TTL_SECONDS * 1000)).toBe(false);
  });
  test('missing, malformed, tampered, future, and rotated sessions fail', () => {
    const now = Date.now();
    const token = createSession(config, now);
    for (const value of [
      undefined,
      '',
      'valid',
      `${token}x`,
      token.replace('v1.', 'v2.'),
      token.slice(0, -1) + '!',
    ])
      expect(verifySession(value, config)).toBe(false);
    expect(verifySession(token, { ...config, pin: '0000' })).toBe(false);
    expect(verifySession(token, { ...config, secret: 'different'.repeat(8) })).toBe(false);
    expect(verifySession(createSession(config, now + 60_000), config, now)).toBe(false);
    const pieces = token.split('.');
    pieces[1] = String(Number(pieces[1]) - 1);
    expect(verifySession(pieces.join('.'), config)).toBe(false);
  });
  test('rate limit applies after five attempts and expires', () => {
    const limiter = new LoginRateLimiter();
    for (let index = 0; index < 5; index++) expect(limiter.consume('one', 1000)).toBe(0);
    expect(limiter.consume('one', 1000)).toBe(900);
    expect(limiter.consume('two', 1000)).toBe(0);
    expect(limiter.consume('one', 901_000)).toBe(0);
  });
});

describe('login route', () => {
  test('correct PIN sets an HttpOnly, host-only, SameSite cookie', async () => {
    const ctx = context('/api/auth/session', 'POST', { pin: config.pin });
    const response = await invoke(session.POST, ctx);
    expect(response.status).toBe(200);
    const cookie = [...ctx.cookies.headers()].join(';');
    expect(cookie).toContain('HttpOnly');
    expect(cookie.toLowerCase()).toContain('samesite=strict');
    expect(cookie).toContain('Path=/');
    expect(cookie.toLowerCase()).not.toContain('domain=');
    expect(cookie).toContain(`Max-Age=${SESSION_TTL_SECONDS}`);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
  test('production cookie is Secure', async () => {
    const previous = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const ctx = context('/api/auth/session', 'POST', { pin: config.pin });
      expect((await invoke(session.POST, ctx)).status).toBe(200);
      expect([...ctx.cookies.headers()].join(';')).toContain('Secure');
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
  test('incorrect PIN sets no cookie', async () => {
    const ctx = context('/api/auth/session', 'POST', { pin: '0000' });
    expect((await invoke(session.POST, ctx)).status).toBe(401);
    expect([...ctx.cookies.headers()]).toHaveLength(0);
  });
  test('malformed login JSON is a safe 400', async () => {
    expect(
      (await invoke(session.POST, context('/api/auth/session', 'POST', undefined, { raw: '{' })))
        .status
    ).toBe(400);
  });
  test('login is same-origin and throttled', async () => {
    expect(
      (
        await invoke(
          session.POST,
          context(
            '/api/auth/session',
            'POST',
            { pin: config.pin },
            { origin: 'https://attacker.test' }
          )
        )
      ).status
    ).toBe(403);
    const ctx = context('/api/auth/session', 'POST', { pin: '0000' });
    for (let index = 0; index < 5; index++) {
      const attempt = context('/api/auth/session', 'POST', { pin: '0000' });
      attempt.clientAddress = ctx.clientAddress;
      expect((await invoke(session.POST, attempt)).status).toBe(401);
    }
    const response = await invoke(session.POST, ctx);
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBeTruthy();
  });
  test('session status reports validity without exposing tokens', async () => {
    const token = signed();
    const valid = await invoke(
      session.GET,
      context('/api/auth/session', 'GET', undefined, { token })
    );
    expect(await valid.json()).toEqual({ authenticated: true });
    const absent = await invoke(session.GET, context('/api/auth/session', 'GET'));
    expect(await absent.json()).toEqual({ authenticated: false });
  });
});

const mutations = [
  {
    name: 'create',
    route: items.POST,
    path: '/api/items',
    method: 'POST',
    body: validItem,
    status: 201,
    stub: createItem,
  },
  {
    name: 'update',
    route: item.PUT,
    path: '/api/items/test-item',
    method: 'PUT',
    body: { name: 'Updated' },
    status: 200,
    stub: updateItem,
  },
  {
    name: 'delete',
    route: item.DELETE,
    path: '/api/items/test-item',
    method: 'DELETE',
    body: undefined,
    status: 200,
    stub: deleteItem,
  },
  {
    name: 'image delete',
    route: imageDelete.DELETE,
    path: '/api/images/delete',
    method: 'DELETE',
    body: { publicId: 'wishlist/test' },
    status: 410,
    stub: deleteImage,
  },
  {
    name: 'image upload',
    route: upload.POST,
    path: '/api/images/upload',
    method: 'POST',
    body: undefined,
    status: 201,
    stub: uploadImage,
  },
];
function mutationBody(entry: (typeof mutations)[number]) {
  if (entry.name !== 'image upload') return entry.body;
  const form = new FormData();
  form.set('image', new File([new Uint8Array([1, 2, 3])], 'test.png', { type: 'image/png' }));
  return form;
}

describe('all mutation boundaries', () => {
  for (const entry of mutations) {
    test(`${entry.name}: missing/forged/expired cookies cannot call providers`, async () => {
      for (const token of [
        undefined,
        'forged',
        createSession(config, Date.now() - (SESSION_TTL_SECONDS + 1) * 1000),
      ]) {
        const ctx = context(entry.path, entry.method, mutationBody(entry), { token });
        ctx.request.headers.set('x-auth-pin', config.pin);
        expect((await invoke(entry.route, ctx)).status).toBe(401);
        expect(entry.stub).not.toHaveBeenCalled();
      }
    });
    test(`${entry.name}: signed session reaches the expected mutation boundary`, async () => {
      expect(
        (
          await invoke(
            entry.route,
            context(entry.path, entry.method, mutationBody(entry), { token: signed() })
          )
        ).status
      ).toBe(entry.status);
      expect(entry.stub).toHaveBeenCalledTimes(entry.name === 'image delete' ? 0 : 1);
    });
    test(`${entry.name}: cross-origin or missing Origin fails with a valid session`, async () => {
      for (const origin of [
        null,
        'null',
        'https://attacker.test',
        'https://wishlist.test.attacker.test',
      ]) {
        expect(
          (
            await invoke(
              entry.route,
              context(entry.path, entry.method, mutationBody(entry), { token: signed(), origin })
            )
          ).status
        ).toBe(403);
      }
      expect(
        (
          await invoke(
            entry.route,
            context(entry.path, entry.method, mutationBody(entry), {
              token: signed(),
              fetchSite: 'cross-site',
            })
          )
        ).status
      ).toBe(403);
      expect(entry.stub).not.toHaveBeenCalled();
    });
    test(`${entry.name}: missing configuration fails closed`, async () => {
      const token = signed();
      process.env.SESSION_SECRET = '';
      expect(
        (
          await invoke(
            entry.route,
            context(entry.path, entry.method, mutationBody(entry), { token })
          )
        ).status
      ).toBe(503);
      expect(entry.stub).not.toHaveBeenCalled();
    });
  }
  test('authorization precedes malformed-body parsing', async () => {
    expect(
      (await invoke(items.POST, context('/api/items', 'POST', undefined, { raw: '{' }))).status
    ).toBe(401);
    expect(createItem).not.toHaveBeenCalled();
  });
  test('public GET retains its existing behavior', async () => {
    expect((await invoke(items.GET, context('/api/items', 'GET'))).status).toBe(200);
    expect(getItems).toHaveBeenCalledTimes(1);
  });
});

describe('validation', () => {
  test('current form payloads normalize and retain optional empty values', () => {
    expect(parseCreateItem(validItem)).toEqual({ ...validItem, topic: 'Brand', name: 'Item' });
    expect(parseCreateItem({ owner: 'me', topic: 'Brand', name: 'Name' })).toEqual({
      owner: 'me',
      topic: 'Brand',
      name: 'Name',
    });
    expect(parseUpdateItem({ description: null })).toEqual({ description: '' });
    expect(
      parseUpdateItem({
        description: ' notes ',
        specs: [{ label: ' SIZE ', value: ' M ' }],
        url: ' https://example.com/path ',
      })
    ).toEqual({
      description: 'notes',
      specs: [{ label: 'SIZE', value: 'M' }],
      url: 'https://example.com/path',
    });
  });
  for (const input of [
    null,
    [],
    'text',
    42,
    {},
    { ...validItem, owner: 'other' },
    { ...validItem, owner: 1 },
    { ...validItem, name: ' ' },
    { ...validItem, topic: false },
    { ...validItem, price: null },
    { ...validItem, description: {} },
    { ...validItem, description: 'x'.repeat(1025) },
    { ...validItem, specs: [{}] },
    { ...validItem, specs: [{ label: 'Size', value: 'M', extra: true }] },
  ]) {
    test(`invalid create body is rejected: ${JSON.stringify(input).slice(0, 70)}`, () =>
      expect(() => parseCreateItem(input)).toThrow(HttpError));
  }
  for (const field of ['id', 'createdAt', 'admin', '__proto__']) {
    test(`forbidden field ${field} cannot be persisted`, () => {
      const extra = JSON.parse(`{"${field}":"override"}`) as Record<string, unknown>;
      expect(() => parseCreateItem({ ...validItem, ...extra })).toThrow(HttpError);
      expect(() => parseUpdateItem(extra)).toThrow(HttpError);
    });
  }
  for (const url of [
    'javascript:alert(1)',
    'data:text/html,hello',
    'ftp://example.com',
    '//example.com',
    'not-a-url',
  ]) {
    test(`unsafe reference URL rejected: ${url}`, () =>
      expect(() => parseUpdateItem({ url })).toThrow(HttpError));
  }
  test('HTTP and HTTPS references remain supported', () => {
    expect(parseUpdateItem({ url: 'http://example.com' }).url).toBe('http://example.com/');
    expect(parseUpdateItem({ url: '' }).url).toBe('');
  });
  test('matching upload metadata and complete nullable removal are supported', () => {
    expect(parseCreateItem({ ...validItem, ...imageFields })).toMatchObject(imageFields);
    const removal = Object.fromEntries(Object.keys(imageFields).map((key) => [key, null]));
    expect(parseUpdateItem(removal)).toEqual(removal);
    expect(parseUpdateItem({ imageUrl: null, imagePublicId: null })).toEqual(removal);
  });
  for (const fields of [
    { imageUrl: null },
    { ...imageFields, imagePublicId: '../outside' },
    { ...imageFields, imageUrl: 'https://attacker.test/test.png' },
    { ...imageFields, imageUrl: metadata.secureUrl.replace('test-cloud', 'other-cloud') },
    { ...imageFields, imageWidth: -1 },
    { ...imageFields, imageBytes: 6 * 1024 * 1024 },
    { ...imageFields, imageFormat: 'svg' },
    { ...imageFields, imageFormat: 'webp' },
    { ...imageFields, imageHeight: 1.5 },
    { ...imageFields, imagePublicId: null },
  ]) {
    test(`invalid image payload rejected: ${JSON.stringify(fields).slice(0, 85)}`, () =>
      expect(() => parseUpdateItem(fields)).toThrow(HttpError));
  }
  test('malformed JSON, unsupported types, oversized bodies, and unknown fields have safe statuses', async () => {
    for (const options of [
      { raw: '{', expected: 400 },
      { raw: '{}', type: 'text/plain', expected: 415 },
      { raw: 'x'.repeat(64 * 1024 + 1), expected: 413 },
      { raw: JSON.stringify({ ...validItem, createdAt: 'override' }), expected: 400 },
    ]) {
      const response = await invoke(
        items.POST,
        context('/api/items', 'POST', undefined, { ...options, token: signed() })
      );
      expect(response.status).toBe(options.expected);
      expect(await response.json()).toHaveProperty('error');
    }
    expect(createItem).not.toHaveBeenCalled();
  });
  test('normalization reaches persistence and update nulls stay intact', async () => {
    await invoke(items.POST, context('/api/items', 'POST', validItem, { token: signed() }));
    expect(createItem).toHaveBeenCalledWith({ ...validItem, topic: 'Brand', name: 'Item' });
    await invoke(
      item.PUT,
      context(
        '/api/items/test-item',
        'PUT',
        { imageUrl: null, imagePublicId: null },
        { token: signed() }
      )
    );
    expect(updateItem).toHaveBeenCalledWith(
      'test-item',
      Object.fromEntries(Object.keys(imageFields).map((key) => [key, null]))
    );
  });
  test('invalid updates cannot bypass the API validator', async () => {
    for (const body of [
      {},
      { owner: 'other' },
      { createdAt: 'override' },
      { url: 'javascript:alert(1)' },
      { name: '' },
    ]) {
      const response = await invoke(
        item.PUT,
        context('/api/items/test-item', 'PUT', body, { token: signed() })
      );
      expect(response.status).toBe(400);
    }
    expect(updateItem).not.toHaveBeenCalled();
  });
  test('oversized uploads, duplicate files and malformed multipart data cannot call Cloudinary', async () => {
    const large = new FormData();
    large.set(
      'image',
      new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' })
    );
    expect(
      (await invoke(upload.POST, context('/api/images/upload', 'POST', large, { token: signed() })))
        .status
    ).toBe(413);
    const duplicate = new FormData();
    duplicate.append('image', new File(['x'], 'one.png', { type: 'image/png' }));
    duplicate.append('image', new File(['x'], 'two.png', { type: 'image/png' }));
    expect(
      (
        await invoke(
          upload.POST,
          context('/api/images/upload', 'POST', duplicate, { token: signed() })
        )
      ).status
    ).toBe(400);
    expect(
      (
        await invoke(
          upload.POST,
          context('/api/images/upload', 'POST', undefined, {
            token: signed(),
            type: 'multipart/form-data; boundary=missing',
            raw: 'invalid',
          })
        )
      ).status
    ).toBe(400);
    expect(uploadImage).not.toHaveBeenCalled();
  });
  test('unexpected provider errors return only a safe generic message', async () => {
    createItem.mockRejectedValueOnce(new Error('private-provider-detail'));
    const response = await invoke(
      items.POST,
      context('/api/items', 'POST', validItem, { token: signed() })
    );
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: 'Server Error' });
  });
  test('media rejects traversal, malformed JSON, unsupported/empty files and extra fields', async () => {
    for (const body of [
      { publicId: '../outside' },
      { publicId: 'wishlist/test', extra: true },
      {},
    ]) {
      expect(
        (
          await invoke(
            imageDelete.DELETE,
            context('/api/images/delete', 'DELETE', body, { token: signed() })
          )
        ).status
      ).toBe(400);
    }
    expect(
      (
        await invoke(
          imageDelete.DELETE,
          context('/api/images/delete', 'DELETE', undefined, { token: signed(), raw: '{' })
        )
      ).status
    ).toBe(400);
    for (const file of [
      new File(['x'], 'test.svg', { type: 'image/svg+xml' }),
      new File([], 'empty.png', { type: 'image/png' }),
    ]) {
      const form = new FormData();
      form.set('image', file);
      expect(
        (
          await invoke(
            upload.POST,
            context('/api/images/upload', 'POST', form, { token: signed() })
          )
        ).status
      ).toBe(400);
    }
    expect(uploadImage).not.toHaveBeenCalled();
    expect(deleteImage).not.toHaveBeenCalled();
  });
});

test('public pagination errors preserve safe 400s and conceal provider failures', async () => {
  getItems.mockRejectedValueOnce(new HttpError(400, 'Invalid pagination cursor'));
  const invalid = await invoke(items.GET, context('/api/items?cursor=bad', 'GET'));
  expect(invalid.status).toBe(400);
  expect(await invalid.json()).toEqual({ error: 'Invalid pagination cursor' });
  getItems.mockRejectedValueOnce(new Error('private-provider-detail'));
  const failed = await invoke(items.GET, context('/api/items', 'GET'));
  expect(failed.status).toBe(500);
  expect(await failed.json()).toEqual({ error: 'Server Error' });
});

test('update and delete surface missing-document 404s through authorized routes', async () => {
  for (const entry of [mutations[1], mutations[2]]) {
    entry.stub.mockRejectedValueOnce(new HttpError(404, 'Item not found'));
    const response = await invoke(
      entry.route,
      context(entry.path, entry.method, entry.body, { token: signed() })
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: 'Item not found' });
  }
});
