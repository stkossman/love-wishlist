export const WISHLIST_IMAGE_MAX_SIZE_BYTES = 5 * 1024 * 1024;
export const WISHLIST_IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const WISHLIST_IMAGE_TYPES = new Set(WISHLIST_IMAGE_ACCEPT.split(','));

export function isWishlistImagePublicId(value: unknown): value is string {
  return typeof value === 'string' && /^wishlist\/[A-Za-z0-9_-][A-Za-z0-9_.-]{0,199}$/.test(value);
}
