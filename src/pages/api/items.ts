import type { APIRoute } from 'astro';
import { WishlistService } from '@/modules/wishlist/wishlist.service';
import {
  getDescriptionValidationError,
  isOwner,
  normalizePayloadDescription,
} from '@/modules/wishlist/wishlist.utils';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const ownerParam = url.searchParams.get('owner');
  const owner = isOwner(ownerParam) ? ownerParam : undefined;
  const cursor = url.searchParams.get('cursor') || undefined;

  try {
    const result = await WishlistService.getItems(owner, cursor);
    return new Response(JSON.stringify(result), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Server Error' }), { status: 500 });
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    const providedPin = request.headers.get('x-auth-pin');
    if (providedPin !== import.meta.env.PUBLIC_SECRET_PIN) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const body = await request.json();
    const descriptionError = getDescriptionValidationError(
      body && typeof body === 'object' ? (body as Record<string, unknown>).description : undefined
    );

    if (descriptionError) {
      return new Response(JSON.stringify({ error: descriptionError }), { status: 400 });
    }

    const id = await WishlistService.createItem(normalizePayloadDescription(body));

    return new Response(JSON.stringify({ message: 'Created', id }), { status: 201 });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Server Error' }), { status: 500 });
  }
};
