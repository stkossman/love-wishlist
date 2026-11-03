import { jsonResponse } from '@/modules/wishlist/utils/api';

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly headers?: Record<string, string>
  ) {
    super(message);
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    const response = jsonResponse({ error: error.message }, error.status);
    for (const [key, value] of Object.entries(error.headers ?? {})) {
      response.headers.set(key, value);
    }
    response.headers.set('Cache-Control', 'no-store');
    return response;
  }

  console.error('API operation failed', error instanceof Error ? error.name : 'Unknown error');
  return jsonResponse({ error: 'Server Error' }, 500);
}

export async function readBody(
  request: Request,
  maxBytes: number
): Promise<Uint8Array<ArrayBuffer>> {
  const contentLength = Number(request.headers.get('content-length'));
  if (contentLength > maxBytes) throw new HttpError(413, 'Request is too large');

  const reader = request.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, 'Request is too large');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readJson(request: Request, maxBytes = 64 * 1024): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json') {
    throw new HttpError(415, 'Content-Type must be application/json');
  }
  const bytes = await readBody(request, maxBytes);
  try {
    return JSON.parse(new TextDecoder().decode(bytes)) as unknown;
  } catch {
    throw new HttpError(400, 'Malformed JSON');
  }
}
