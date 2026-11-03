import type { APIRoute } from 'astro';
import { WishlistService } from '@/modules/wishlist/wishlist.service';
import { withMutationAuth } from '@/lib/server/auth';
import { errorResponse, readJson } from '@/lib/server/http';
import { parseCreateItem, parseOccasionFilters } from '@/modules/wishlist/wishlist.validation';
import { jsonResponse } from '@/modules/wishlist/utils/api';
import { isOwner } from '@/modules/wishlist/wishlist.utils';

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const ownerParam = url.searchParams.get('owner');
  const owner = isOwner(ownerParam) ? ownerParam : undefined;
  const cursor = url.searchParams.get('cursor') ?? undefined;

  try {
    const result = await WishlistService.getItems(
      owner,
      cursor,
      parseOccasionFilters(url.searchParams)
    );
    return jsonResponse(result, 200);
  } catch (error) {
    return errorResponse(error);
  }
};

export const POST: APIRoute = withMutationAuth(async ({ request }) => {
  const id = await WishlistService.createItem(parseCreateItem(await readJson(request)));
  return jsonResponse({ message: 'Created', id }, 201);
});
