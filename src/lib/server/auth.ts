import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { APIRoute, AstroCookies } from 'astro';
import { errorResponse, HttpError } from './http';

export const SESSION_COOKIE = 'wishlist_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

export interface AuthConfig {
  pin: string;
  secret: string;
}

export function getAuthConfig(): AuthConfig {
  const pin = process.env.SECRET_PIN;
  const secret = process.env.SESSION_SECRET;
  if (!pin || !/^\d{4}$/.test(pin) || !secret || Buffer.byteLength(secret) < 32) {
    throw new HttpError(503, 'Authentication is unavailable');
  }
  return { pin, secret };
}

export function verifyPin(value: unknown, config: AuthConfig): boolean {
  if (typeof value !== 'string' || !/^\d{4}$/.test(value)) return false;
  const digest = (text: string) => createHash('sha256').update(text).digest();
  return timingSafeEqual(digest(value), digest(config.pin));
}

function sign(payload: string, config: AuthConfig) {
  return createHmac('sha256', config.secret).update(`${config.pin}:${payload}`).digest('base64url');
}

export function createSession(config: AuthConfig, now = Date.now()): string {
  const expires = Math.floor(now / 1000) + SESSION_TTL_SECONDS;
  const payload = `v1.${expires}.${randomBytes(16).toString('base64url')}`;
  return `${payload}.${sign(payload, config)}`;
}

export function verifySession(token: string | undefined, config: AuthConfig, now = Date.now()) {
  if (!token || token.length > 256) return false;
  const match = /^(v1\.(\d{1,12})\.[A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const expires = Number(match[2]);
  const current = Math.floor(now / 1000);
  if (expires <= current || expires > current + SESSION_TTL_SECONDS) return false;
  return timingSafeEqual(Buffer.from(match[3]), Buffer.from(sign(match[1], config)));
}

export function hasSession(cookies: AstroCookies) {
  return verifySession(cookies.get(SESSION_COOKIE)?.value, getAuthConfig());
}

export function setSession(cookies: AstroCookies, config: AuthConfig) {
  cookies.set(SESSION_COOKIE, createSession(config), {
    httpOnly: true,
    secure: import.meta.env.PROD || process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function requireSameOrigin(request: Request) {
  if (request.headers.get('origin') !== new URL(request.url).origin) {
    throw new HttpError(403, 'Same-origin request required');
  }
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    throw new HttpError(403, 'Same-origin request required');
  }
}

export function withMutationAuth(handler: APIRoute): APIRoute {
  return async (context) => {
    try {
      requireSameOrigin(context.request);
      if (!hasSession(context.cookies)) throw new HttpError(401, 'Unauthorized');
      const response = await handler(context);
      response.headers.set('Cache-Control', 'no-store');
      return response;
    } catch (error) {
      return errorResponse(error);
    }
  };
}
