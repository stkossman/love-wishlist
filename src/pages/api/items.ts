import type { APIRoute } from 'astro';
import { WishlistService } from '@/modules/wishlist/wishlist.service';
import {
  getDescriptionValidationError,
  normalizePayloadDescription,
} from '@/modules/wishlist/utils/description';
import { jsonResponse } from '@/modules/wishlist/utils/api';
import { isOwner } from '@/modules/wishlist/wishlist.utils';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const ownerParam = url.searchParams.get('owner');
  const owner = isOwner(ownerParam) ? ownerParam : undefined;
  const cursor = url.searchParams.get('cursor') || undefined;

  try {
    const result = await WishlistService.getItems(owner, cursor);
    return jsonResponse(result, 200);
  } catch (error) {
    return jsonResponse({ error: 'Server Error' }, 500);
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const providedPin = request.headers.get('x-auth-pin');
    if (providedPin !== import.meta.env.PUBLIC_SECRET_PIN) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await request.json();
    const descriptionError = getDescriptionValidationError(
      body && typeof body === 'object' ? (body as Record<string, unknown>).description : undefined
    );

    if (descriptionError) {
      return jsonResponse({ error: descriptionError }, 400);
    }

    const id = await WishlistService.createItem(normalizePayloadDescription(body));

    return jsonResponse({ message: 'Created', id }, 201);
  } catch (error) {
    return jsonResponse({ error: 'Server Error' }, 500);
  }
};
