import type { APIRoute } from 'astro';
import { withMutationAuth } from '@/lib/server/auth';
import { errorResponse, HttpError, readJson } from '@/lib/server/http';
import { jsonResponse } from '@/modules/wishlist/utils/api';
import { SizesRepository } from '@/modules/sizes/sizes.repository';
import { isPerson, parseMeasurementUpdates } from '@/modules/sizes/sizes.validation';

export const GET: APIRoute = async ({ params }) => {
  try {
    if (!isPerson(params.person)) throw new HttpError(404, 'Person not found');
    const response = jsonResponse({ measurements: await SizesRepository.find(params.person) }, 200);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    return errorResponse(error);
  }
};

export const PATCH: APIRoute = withMutationAuth(async ({ params, request }) => {
  if (!isPerson(params.person)) throw new HttpError(404, 'Person not found');
  const updates = parseMeasurementUpdates(await readJson(request, 2048));
  await SizesRepository.update(params.person, updates);
  return jsonResponse({ message: 'Measurements saved' }, 200);
});
