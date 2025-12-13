import type { APIRoute } from 'astro';
import { WishlistService } from '../../modules/wishlist/wishlist.service';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const owner = url.searchParams.get('owner') || undefined;
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

    const id = await WishlistService.createItem(body);

    return new Response(JSON.stringify({ message: 'Created', id }), { status: 201 });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Server Error' }), { status: 500 });
  }
};
