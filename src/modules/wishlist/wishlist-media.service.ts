import { randomUUID } from 'node:crypto';
import { HttpError } from '@/lib/server/http';
import { uploadWishlistImage, deleteWishlistImage } from '@/lib/server/cloudinary';
import { WishlistMediaRepository } from './wishlist-media.repository';
import { WISHLIST_IMAGE_MAX_SIZE_BYTES } from './constants/image';

export function validateImageContents(buffer: Buffer, mime: string): void {
  let format: string | undefined;
  if (
    buffer.length >= 33 &&
    buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    buffer.readUInt32BE(8) === 13 &&
    buffer.toString('ascii', 12, 16) === 'IHDR' &&
    buffer.readUInt32BE(16) > 0 &&
    buffer.readUInt32BE(20) > 0
  )
    format = 'image/png';
  else if (
    buffer.length >= 4 &&
    buffer[0] === 255 &&
    buffer[1] === 216 &&
    buffer[2] === 255 &&
    buffer[buffer.length - 2] === 255 &&
    buffer[buffer.length - 1] === 217
  )
    format = 'image/jpeg';
  else if (
    buffer.length >= 20 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.readUInt32LE(4) + 8 === buffer.length &&
    buffer.toString('ascii', 8, 12) === 'WEBP' &&
    ['VP8 ', 'VP8L', 'VP8X'].includes(buffer.toString('ascii', 12, 16))
  )
    format = 'image/webp';
  if (!format || format !== mime)
    throw new HttpError(400, 'Image contents do not match a supported image format');
  if (buffer.length > WISHLIST_IMAGE_MAX_SIZE_BYTES)
    throw new HttpError(413, 'Image file is too large');
}

export class WishlistMediaService {
  private static cloudName(): string {
    const name = process.env.CLOUDINARY_CLOUD_NAME;
    if (!name) throw new HttpError(503, 'Image configuration is unavailable');
    return name;
  }

  static async upload(buffer: Buffer, mime: string) {
    validateImageContents(buffer, mime);
    const publicId = `wishlist/${randomUUID()}`;
    await WishlistMediaRepository.reserve(publicId, this.cloudName());
    try {
      const image = await uploadWishlistImage(buffer, publicId);
      await WishlistMediaRepository.ready(publicId, image);
      return image;
    } catch (error) {
      console.error('Wishlist image upload incomplete', {
        publicId,
        error: error instanceof Error ? error.name : 'ProviderError',
      });
      throw new HttpError(502, 'Image upload could not be confirmed. Please retry.');
    }
  }

  static async cleanup(
    publicId: string,
    recovery = false
  ): Promise<'deleted' | 'retained' | 'failed'> {
    try {
      if (!(await WishlistMediaRepository.claimCleanup(publicId, this.cloudName(), recovery)))
        return 'retained';
      await deleteWishlistImage(publicId);
      await WishlistMediaRepository.markDeleted(publicId);
      return 'deleted';
    } catch (error) {
      console.error('Wishlist image cleanup deferred', {
        publicId,
        error: error instanceof Error ? error.name : 'ProviderError',
      });
      return 'failed';
    }
  }
}
