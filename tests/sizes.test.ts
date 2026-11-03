import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { createContext } from 'astro/middleware';
import { Timestamp } from 'firebase-admin/firestore';
import * as firebase from '../src/lib/server/firebase';
import { createSession, SESSION_COOKIE } from '../src/lib/server/auth';
import { sizes, type Person } from '../src/data/sizes';
import { SizesRepository } from '../src/modules/sizes/sizes.repository';
import { parseMeasurementUpdates } from '../src/modules/sizes/sizes.validation';
import { GET, PATCH } from '../src/pages/api/sizes/[person]';
import { createMemoryFirestore } from './helpers/firestore';

const config = { pin: '2468', secret: 'sizes-test-secret-'.repeat(4) };
const previousPin = process.env.SECRET_PIN;
const previousSecret = process.env.SESSION_SECRET;
let memory: ReturnType<typeof createMemoryFirestore>;

beforeEach(() => {
  memory = createMemoryFirestore();
  spyOn(firebase, 'getDatabase').mockImplementation(() => memory.db);
  spyOn(console, 'error').mockImplementation(() => {});
  process.env.SECRET_PIN = config.pin;
  process.env.SESSION_SECRET = config.secret;
});

afterEach(() => {
  mock.restore();
  if (previousPin === undefined) delete process.env.SECRET_PIN;
  else process.env.SECRET_PIN = previousPin;
  if (previousSecret === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = previousSecret;
});

function context(
  person = 'andrii',
  options: {
    method?: string;
    body?: unknown;
    token?: string;
    origin?: string | null;
    fetchSite?: string;
    raw?: string;
    contentType?: string;
  } = {}
) {
  const headers = new Headers();
  if (options.token) headers.set('Cookie', `${SESSION_COOKIE}=${options.token}`);
  if (options.origin !== null) headers.set('Origin', options.origin ?? 'https://wishlist.test');
  if (options.fetchSite) headers.set('Sec-Fetch-Site', options.fetchSite);
  headers.set('Content-Type', options.contentType ?? 'application/json');
  return createContext({
    request: new Request(`https://wishlist.test/api/sizes/${person}`, {
      method: options.method ?? 'PATCH',
      headers,
      body:
        options.method === 'GET'
          ? undefined
          : (options.raw ?? JSON.stringify(options.body ?? { chest: '94.5' })),
    }),
    params: { person },
    defaultLocale: 'en',
    locals: {},
  });
}

for (const person of ['andrii', 'juliette'] as const) {
  test(`${person}: missing document reads defaults without writing`, async () => {
    expect(await SizesRepository.find(person)).toEqual(sizes[person]);
    expect(memory.documents.size).toBe(0);
  });

  test(`${person}: public GET combines stored fields with defaults`, async () => {
    memory.documents.set(`sizes/${person}`, { values: { chest: '94.5' } });
    const response = await GET(context(person, { method: 'GET' }));
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    const { measurements } = await response.json();
    expect(measurements).toEqual(
      sizes[person].map((item) => (item.key === 'chest' ? { ...item, value: '94.5' } : item))
    );
  });

  test(`${person}: authorized patch persists across fresh reads without changing the other person`, async () => {
    const other: Person = person === 'andrii' ? 'juliette' : 'andrii';
    const otherData = { values: { waist: '66.5' }, preserved: 'yes' };
    memory.documents.set(`sizes/${other}`, otherData);
    const response = await PATCH(
      context(person, {
        token: createSession(config),
        body: { ringSize: '17.5-18', height: '172-174' },
      })
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(memory.documents.get(`sizes/${person}`)?.updatedAt).toBeInstanceOf(Timestamp);
    expect(memory.documents.get(`sizes/${other}`)).toEqual(otherData);
    const reload = await GET(context(person, { method: 'GET' }));
    expect((await reload.json()).measurements).toEqual(
      sizes[person].map((item) => ({
        ...item,
        value: item.key === 'ringSize' ? '17.5-18' : item.key === 'height' ? '172-174' : item.value,
      }))
    );
  });
}

test('updates preserve untouched values, unknown stored fields and concurrent changes', async () => {
  memory.documents.set('sizes/andrii', {
    values: { waist: '80', futureMeasurement: 'kept' },
    note: 'kept',
  });
  await Promise.all([
    SizesRepository.update('andrii', { chest: '94' }),
    SizesRepository.update('andrii', { height: '173' }),
    SizesRepository.update('juliette', { chest: '86' }),
  ]);
  expect(memory.documents.get('sizes/andrii')).toMatchObject({
    values: { waist: '80', futureMeasurement: 'kept', chest: '94', height: '173' },
    note: 'kept',
  });
  expect(memory.documents.get('sizes/juliette')?.values).toEqual({ chest: '86' });
});

for (const options of [
  {},
  { token: 'forged' },
  { token: createSession(config, Date.now() - 9 * 60 * 60 * 1000) },
  { token: createSession(config), origin: null },
  { token: createSession(config), origin: 'https://other.test' },
  { token: createSession(config), fetchSite: 'cross-site' },
]) {
  test(`rejects unauthorized/origin edit ${JSON.stringify(options).slice(0, 50)}`, async () => {
    const response = await PATCH(context('andrii', options));
    expect([401, 403]).toContain(response.status);
    expect(memory.documents.size).toBe(0);
  });
}

for (const body of [
  null,
  [],
  {},
  { height: 173 },
  { height: '' },
  { height: '0' },
  { height: '-1' },
  { height: '301' },
  { height: '174-172' },
  { chest: 'NaN' },
  { chest: '1e2' },
  { chest: '<script>' },
  { chest: '9'.repeat(21) },
  { chest: '94', label: 'New label' },
  { person: 'juliette', waist: '65' },
  { height: '172', unit: 'in' },
  { height: '1-2-3' },
]) {
  test(`rejects invalid update ${JSON.stringify(body)}`, () => {
    expect(() => parseMeasurementUpdates(body)).toThrow();
  });
}

test('accepts decimals and ranges, trims input, limits raw input length', () => {
  expect(
    parseMeasurementUpdates({ chest: ' 94.5 ', ringSize: '17.5-18', height: '172-174' })
  ).toEqual({ chest: '94.5', ringSize: '17.5-18', height: '172-174' });
  expect(() => parseMeasurementUpdates({ chest: ' '.repeat(20) + '94' })).toThrow();
});

test('API rejects invalid people, invalid body, non-JSON and oversized requests without writes', async () => {
  const token = createSession(config);
  expect((await GET(context('someone', { method: 'GET' }))).status).toBe(404);
  expect((await PATCH(context('someone', { token }))).status).toBe(404);
  expect((await PATCH(context('andrii', { token, body: { chest: 'invalid' } }))).status).toBe(400);
  expect((await PATCH(context('andrii', { token, raw: '{' }))).status).toBe(400);
  expect((await PATCH(context('andrii', { token, contentType: 'text/plain' }))).status).toBe(415);
  expect((await PATCH(context('andrii', { token, raw: ' '.repeat(2049) }))).status).toBe(413);
  expect(memory.documents.size).toBe(0);
});

test('failed persistence preserves data and retry succeeds', async () => {
  memory.documents.set('sizes/andrii', { values: { chest: '92' } });
  memory.faults.beforeCommit = true;
  const token = createSession(config);
  expect((await PATCH(context('andrii', { token }))).status).toBe(500);
  expect(memory.documents.get('sizes/andrii')?.values).toEqual({ chest: '92' });
  expect((await PATCH(context('andrii', { token }))).status).toBe(200);
  expect(memory.documents.get('sizes/andrii')?.values).toEqual({ chest: '94.5' });
});

test('corrupt stored data fails clearly without replacing it with defaults', async () => {
  for (const values of ['corrupt', { chest: '<script>' }]) {
    memory.documents.set('sizes/andrii', { values });
    expect((await GET(context('andrii', { method: 'GET' }))).status).toBe(500);
    expect(memory.documents.get('sizes/andrii')?.values).toEqual(values);
  }
});
