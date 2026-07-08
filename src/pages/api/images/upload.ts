import type { APIRoute } from 'astro';
import {
  WISHLIST_IMAGE_MAX_SIZE_BYTES,
  WISHLIST_IMAGE_TYPES,
} from '@/modules/wishlist/constants/image';
import { jsonResponse } from '@/modules/wishlist/utils/api';
import { uploadWishlistImage } from '@/lib/server/cloudinary';

export const POST: APIRoute = async ({ request }) => {
  const providedPin = request.headers.get('x-auth-pin');
  if (providedPin !== import.meta.env.PUBLIC_SECRET_PIN) {
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  try {
    const formData = await request.formData();
    const image = formData.get('image');

    if (!(image instanceof File)) {
      return jsonResponse({ error: 'Image file is required' }, 400);
    }

    if (!WISHLIST_IMAGE_TYPES.has(image.type)) {
      return jsonResponse({ error: 'Unsupported image type' }, 400);
    }

    if (image.size > WISHLIST_IMAGE_MAX_SIZE_BYTES) {
      return jsonResponse({ error: 'Image file is too large' }, 400);
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const metadata = await uploadWishlistImage(buffer);

    return jsonResponse({ image: metadata }, 201);
  } catch (error) {
    console.error('Cloudinary upload failed:', error);
    return jsonResponse({ error: 'Image upload failed' }, 500);
  }
};
