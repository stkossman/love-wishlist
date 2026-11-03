import type { APIRoute } from 'astro';
import { withMutationAuth } from '@/lib/server/auth';
import { HttpError, readBody } from '@/lib/server/http';
import {
  WISHLIST_IMAGE_MAX_SIZE_BYTES,
  WISHLIST_IMAGE_TYPES,
} from '@/modules/wishlist/constants/image';
import { jsonResponse } from '@/modules/wishlist/utils/api';
import { WishlistMediaService } from '@/modules/wishlist/wishlist-media.service';

export const POST: APIRoute = withMutationAuth(async ({ request }) => {
  const contentType = request.headers.get('content-type') ?? '';
  if (!contentType.startsWith('multipart/form-data;'))
    throw new HttpError(415, 'Content-Type must be multipart/form-data');
  const bytes = await readBody(request, WISHLIST_IMAGE_MAX_SIZE_BYTES + 64 * 1024);
  let formData: FormData;
  try {
    formData = await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData();
  } catch {
    throw new HttpError(400, 'Invalid multipart form');
  }
  const entries = [...formData.entries()];
  const image = formData.get('image');
  if (entries.length !== 1 || !(image instanceof File))
    throw new HttpError(400, 'One image file is required');
  if (!WISHLIST_IMAGE_TYPES.has(image.type) || !image.size)
    throw new HttpError(400, 'Unsupported or empty image');
  if (image.size > WISHLIST_IMAGE_MAX_SIZE_BYTES)
    throw new HttpError(413, 'Image file is too large');
  const metadata = await WishlistMediaService.upload(
    Buffer.from(await image.arrayBuffer()),
    image.type
  );
  return jsonResponse({ image: metadata }, 201);
});
