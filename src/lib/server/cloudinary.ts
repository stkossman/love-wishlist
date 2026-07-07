import { v2 as cloudinary, type UploadApiResponse } from 'cloudinary';
import type { WishlistImageMetadata } from '@/modules/wishlist/wishlist.types';

const WISHLIST_IMAGE_FOLDER = 'wishlist';
const THUMBNAIL_TRANSFORMATION = {
  width: 768,
  height: 768,
  crop: 'limit',
  quality: 'auto',
  fetch_format: 'auto',
} as const;

function getRequiredEnv(name: string) {
  const value = import.meta.env[name];

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

function toImageMetadata(result: UploadApiResponse): WishlistImageMetadata {
  return {
    secureUrl: result.secure_url,
    publicId: result.public_id,
    width: result.width,
    height: result.height,
    format: result.format,
    bytes: result.bytes,
  };
}

export function isWishlistImagePublicId(value: unknown): value is string {
  return typeof value === 'string' && /^wishlist\/[A-Za-z0-9_.-]+$/.test(value);
}

export async function uploadWishlistImage(buffer: Buffer): Promise<WishlistImageMetadata> {
  configureCloudinary();

  const result = await new Promise<UploadApiResponse>((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: WISHLIST_IMAGE_FOLDER,
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

  return toImageMetadata(result);
}

export async function deleteWishlistImage(publicId: string) {
  configureCloudinary();

  return cloudinary.uploader.destroy(publicId, {
    resource_type: 'image',
    invalidate: true,
  });
}

export function getWishlistThumbnailUrl(publicId: string) {
  configureCloudinary();

  return cloudinary.url(publicId, {
    secure: true,
    transformation: [THUMBNAIL_TRANSFORMATION],
  });
}
