import type { APIRoute } from 'astro';
import { deleteWishlistImage, isWishlistImagePublicId } from '@/lib/server/cloudinary';

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const DELETE: APIRoute = async ({ request }) => {
  const providedPin = request.headers.get('x-auth-pin');
  if (providedPin !== import.meta.env.PUBLIC_SECRET_PIN) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const body = await request.json();
    const publicId = body?.publicId;

    if (!isWishlistImagePublicId(publicId)) {
      return jsonResponse({ error: 'Valid wishlist image publicId is required' }, 400);
    }

    await deleteWishlistImage(publicId);

    return jsonResponse({ message: 'Image deleted' }, 200);
  } catch (error) {
    console.error('Cloudinary delete failed:', error);
    return jsonResponse({ error: 'Image delete failed' }, 500);
  }
};
