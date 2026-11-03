import type { APIRoute } from 'astro';
import {
  getAuthConfig,
  hasSession,
  requireSameOrigin,
  setSession,
  verifyPin,
} from '@/lib/server/auth';
import { errorResponse, HttpError, readJson } from '@/lib/server/http';
import { loginRateLimiter } from '@/lib/server/login-rate-limit';
import { jsonResponse } from '@/modules/wishlist/utils/api';

export const GET: APIRoute = ({ cookies }) => {
  try {
    const response = jsonResponse({ authenticated: hasSession(cookies) }, 200);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return errorResponse(error);
  }
};

export const POST: APIRoute = async (context) => {
  const { request, cookies } = context;
  try {
    requireSameOrigin(request);
    const retryAfter = loginRateLimiter.consume(context.clientAddress);
    if (retryAfter) {
      throw new HttpError(429, 'Too many attempts. Try again later.', {
        'Retry-After': String(retryAfter),
      });
    }
    const config = getAuthConfig();
    const body = await readJson(request, 1024);
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      Object.keys(body).length !== 1 ||
      !Object.hasOwn(body, 'pin') ||
      !verifyPin((body as Record<string, unknown>).pin, config)
    ) {
      throw new HttpError(401, 'Invalid credentials');
    }
    setSession(cookies, config);
    const response = jsonResponse({ authenticated: true }, 200);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return errorResponse(error);
  }
};
