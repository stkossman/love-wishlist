import { createHash } from 'node:crypto';
import { getSafeHttpUrl } from './wishlist.utils';

export function imageVersion(item: { imagePublicId?: unknown; imageUrl?: unknown }): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        typeof item.imagePublicId === 'string' ? item.imagePublicId : null,
        typeof item.imageUrl === 'string' ? getSafeHttpUrl(item.imageUrl) || null : null,
      ])
    )
    .digest('hex');
}
