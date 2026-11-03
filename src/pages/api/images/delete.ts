import type { APIRoute } from 'astro';
import { withMutationAuth } from '@/lib/server/auth';
import { HttpError, readJson } from '@/lib/server/http';
import { isWishlistImagePublicId } from '@/modules/wishlist/constants/image';
import { parseObject } from '@/modules/wishlist/wishlist.validation';

export const DELETE: APIRoute = withMutationAuth(async ({ request }) => {
  const body = parseObject(await readJson(request, 1024), ['publicId']);
  if (!isWishlistImagePublicId(body.publicId))
    throw new HttpError(400, 'Valid wishlist image publicId is required');
  throw new HttpError(
    410,
    'Direct image deletion is retired. Remove or replace the image on its item.'
  );
});
