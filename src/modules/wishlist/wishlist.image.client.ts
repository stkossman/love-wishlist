import type { WishlistImageMetadata } from './wishlist.types';

const IMAGE_UPLOAD_URL = '/api/images/upload';
const IMAGE_DELETE_URL = '/api/images/delete';

export class WishlistImageClient {
  static async upload(file: File, pin: string): Promise<WishlistImageMetadata> {
    const formData = new FormData();
    formData.append('image', file);

    const res = await fetch(IMAGE_UPLOAD_URL, {
      method: 'POST',
      headers: {
        'x-auth-pin': pin,
      },
      body: formData,
    });

    if (!res.ok) throw new Error('Failed to upload image');

    const data = (await res.json()) as { image: WishlistImageMetadata };
    return data.image;
  }

  static async delete(publicId: string, pin: string) {
    const res = await fetch(IMAGE_DELETE_URL, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-pin': pin,
      },
      body: JSON.stringify({ publicId }),
    });

    if (!res.ok) throw new Error('Failed to delete image');
  }
}
