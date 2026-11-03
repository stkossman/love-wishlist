import type { APIRoute } from 'astro';
import { withMutationAuth } from '@/lib/server/auth';
import { readJson } from '@/lib/server/http';
import { WishlistService } from '@/modules/wishlist/wishlist.service';
import { parseItemId, parseUpdateItem } from '@/modules/wishlist/wishlist.validation';
import { jsonResponse } from '@/modules/wishlist/utils/api';

export const DELETE: APIRoute = withMutationAuth(async ({ params }) => {
  await WishlistService.deleteItem(parseItemId(params.id));
  return jsonResponse({ message: 'Item deleted' }, 200);
});

export const PUT: APIRoute = withMutationAuth(async ({ params, request }) => {
  const id = parseItemId(params.id);
  const data = parseUpdateItem(await readJson(request));
  const version = request.headers.get('X-Wishlist-Image-Version');
  if (version !== null) await WishlistService.updateItem(id, data, version);
  else await WishlistService.updateItem(id, data);
  return jsonResponse({ message: 'Item updated' }, 200);
});
