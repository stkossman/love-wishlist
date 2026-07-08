import type { APIRoute } from 'astro';
import { WishlistService } from '@/modules/wishlist/wishlist.service';
import { jsonResponse } from '@/modules/wishlist/utils/api';
import {
  getDescriptionValidationError,
  normalizePayloadDescription,
} from '@/modules/wishlist/utils/description';

export const DELETE: APIRoute = async ({ params }) => {
  const { id } = params;

  if (!id) {
    return jsonResponse({ error: 'ID is required' }, 400);
  }

  try {
    await WishlistService.deleteItem(id);
    return jsonResponse({ message: 'Item deleted' }, 200);
  } catch (error) {
    return jsonResponse({ error: 'Failed to delete' }, 500);
  }
};

export const PUT: APIRoute = async ({ params, request }) => {
  const { id } = params;

  if (!id) {
    return jsonResponse({ error: 'ID is required' }, 400);
  }

  try {
    const data = await request.json();
    const descriptionError = getDescriptionValidationError(
      data && typeof data === 'object' ? (data as Record<string, unknown>).description : undefined
    );

    const providedPin = request.headers.get('x-auth-pin');
    const secretPin = import.meta.env.PUBLIC_SECRET_PIN;

    if (providedPin !== secretPin) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    if (descriptionError) {
      return jsonResponse({ error: descriptionError }, 400);
    }

    await WishlistService.updateItem(id, normalizePayloadDescription(data));

    return jsonResponse({ message: 'Item updated' }, 200);
  } catch (error) {
    console.error('Update Error:', error);
    return jsonResponse({ error: 'Failed to update' }, 500);
  }
};
