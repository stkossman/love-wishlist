import { afterEach, expect, test } from 'bun:test';
import { getServerEnv } from '../src/lib/server/env';

const name = 'WISHLIST_ENV_READER_TEST';
const original = process.env[name];

afterEach(() => {
  if (original === undefined) delete process.env[name];
  else process.env[name] = original;
});

test('server configuration reads runtime changes instead of capturing build values', () => {
  process.env[name] = 'first-runtime-value';
  expect(getServerEnv(name)).toBe('first-runtime-value');
  process.env[name] = 'updated-runtime-value';
  expect(getServerEnv(name)).toBe('updated-runtime-value');
});

test('an explicitly empty runtime value stays empty so validation can fail closed', () => {
  process.env[name] = '';
  expect(getServerEnv(name)).toBe('');
});

test('missing runtime configuration remains undefined outside Astro development', () => {
  delete process.env[name];
  expect(getServerEnv(name)).toBeUndefined();
});
