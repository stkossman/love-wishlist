import type { WishlistImageMetadata } from '@/modules/wishlist/wishlist.types';
import { checkResponse } from './wishlist-auth-client';

const IMAGE_UPLOAD_URL = '/api/images/upload';

export class WishlistImageClient {
  static async upload(file: File): Promise<WishlistImageMetadata> {
    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch(IMAGE_UPLOAD_URL, {
      method: 'POST',
      body: formData,
    });

    await checkResponse(res);

    const data = (await res.json()) as { image: WishlistImageMetadata };
    return data.image;
  }
}
