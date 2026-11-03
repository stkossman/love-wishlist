import type { APIRoute } from 'astro';
import { withMutationAuth } from '@/lib/server/auth';
import { HttpError, readJson } from '@/lib/server/http';
import { deleteWishlistImage, isWishlistImagePublicId } from '@/lib/server/cloudinary';
import { jsonResponse } from '@/modules/wishlist/utils/api';
import { parseObject } from '@/modules/wishlist/wishlist.validation';

export const DELETE: APIRoute = withMutationAuth(async ({ request }) => {
  const body = parseObject(await readJson(request, 1024), ['publicId']);
  if (!isWishlistImagePublicId(body.publicId))
    throw new HttpError(400, 'Valid wishlist image publicId is required');
  await deleteWishlistImage(body.publicId);
  return jsonResponse({ message: 'Image deleted' }, 200);
});
