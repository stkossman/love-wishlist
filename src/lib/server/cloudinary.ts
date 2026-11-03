import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import { HttpError } from './http';
import { isWishlistImagePublicId } from '@/modules/wishlist/constants/image';
import { parseUpdateItem } from '@/modules/wishlist/wishlist.validation';
import { mapImageMetadata } from '@/modules/wishlist/utils/image';
import type { WishlistImageMetadata } from '@/modules/wishlist/wishlist.types';

const THUMBNAIL_TRANSFORMATION = {
  width: 768,
  height: 768,
  crop: 'limit',
  quality: 'auto',
  fetch_format: 'auto',
} as const;

function getRequiredEnv(name: string) {
  const value = process.env[name] ?? import.meta.env[name];

  if (!value) {
    throw new Error(`Missing required Cloudinary environment variable: ${name}`);
  }

  return value;
}

function configureCloudinary() {
  cloudinary.config({
    cloud_name: getRequiredEnv('CLOUDINARY_CLOUD_NAME'),
    api_key: getRequiredEnv('CLOUDINARY_API_KEY'),
    api_secret: getRequiredEnv('CLOUDINARY_API_SECRET'),
    secure: true,
  });
}

export function toImageMetadata(
  result: UploadApiResponse,
  publicId: string
): WishlistImageMetadata {
  if (
    result.public_id !== publicId ||
    result.resource_type !== 'image' ||
    result.type !== 'upload'
  ) {
    throw new Error('Unexpected image provider identity');
  }
  const image = {
    secureUrl: new URL(result.secure_url).href,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format === 'jpeg' ? 'jpg' : result.format,
    bytes: result.bytes,
  };
  parseUpdateItem(mapImageMetadata(image));
  return image;
}

export async function uploadWishlistImage(
  buffer: Buffer,
  publicId: string
): Promise<WishlistImageMetadata> {
  if (!isWishlistImagePublicId(publicId)) throw new HttpError(400, 'Invalid wishlist image ID');
  configureCloudinary();

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        tags: ['love-wishlist-managed'],
        timeout: 10000,
        resource_type: 'image',
        overwrite: false,
        use_filename: false,
        unique_filename: true,
        eager: [THUMBNAIL_TRANSFORMATION],
      },
      (error, result) => {
        if (error || !result) {
          reject(error ?? new Error('Cloudinary upload failed'));
          return;
        }

        resolve(result);
      }
    );

    uploadStream.end(buffer);
  });

  return toImageMetadata(result, publicId);
}

export async function deleteWishlistImage(publicId: string): Promise<void> {
  if (!isWishlistImagePublicId(publicId)) throw new HttpError(400, 'Invalid wishlist image ID');
  configureCloudinary();

  const options = {
    resource_type: 'image' as const,
    invalidate: true,
    timeout: 3000,
  };
  const result: unknown = await cloudinary.uploader.destroy(publicId, options);
  if (
    !result ||
    typeof result !== 'object' ||
    !('result' in result) ||
    (result.result !== 'ok' && result.result !== 'not found')
  )
    throw new Error('Image deletion was not confirmed');
}
