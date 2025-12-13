import type { APIRoute } from 'astro';
import { WishlistService } from '@/modules/wishlist/wishlist.service';

export const DELETE: APIRoute = async ({ params }) => {
  const { id } = params;

  if (!id) {
    return new Response(JSON.stringify({ error: 'ID is required' }), { status: 400 });
  }

  try {
    await WishlistService.deleteItem(id);
    return new Response(JSON.stringify({ message: 'Item deleted' }), { status: 200 });
  } catch (error) {
    return new Response(JSON.stringify({ error: 'Failed to delete' }), { status: 500 });
  }
};

export const PUT: APIRoute = async ({ params, request }) => {
  const { id } = params;

  if (!id) {
    return new Response(JSON.stringify({ error: 'ID is required' }), { status: 400 });
  }

  try {
    const data = await request.json();

    const providedPin = request.headers.get('x-auth-pin');
    const secretPin = import.meta.env.PUBLIC_SECRET_PIN;

    if (providedPin !== secretPin) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    await WishlistService.updateItem(id, data);

    return new Response(JSON.stringify({ message: 'Item updated' }), { status: 200 });
  } catch (error) {
    console.error('Update Error:', error);
    return new Response(JSON.stringify({ error: 'Failed to update' }), { status: 500 });
  }
};
