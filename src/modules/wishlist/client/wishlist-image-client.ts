import type { WishlistImageMetadata } from '@/modules/wishlist/wishlist.types';
import { checkResponse } from './wishlist-auth-client';

const IMAGE_UPLOAD_URL = '/api/images/upload';
const IMAGE_DELETE_URL = '/api/images/delete';

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

  static async delete(publicId: string) {
    const res = await fetch(IMAGE_DELETE_URL, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ publicId }),
    });

    await checkResponse(res);
  }
}
