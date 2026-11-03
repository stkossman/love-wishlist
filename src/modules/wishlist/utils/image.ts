import type { WishlistImageFields, WishlistImageMetadata } from '../wishlist.types';

export function mapImageMetadata(image: WishlistImageMetadata): WishlistImageFields {
  return {
    imageUrl: image.secureUrl,
    imagePublicId: image.publicId,
    imageWidth: image.width,
    imageHeight: image.height,
    imageFormat: image.format,
    imageBytes: image.bytes,
  };
}
