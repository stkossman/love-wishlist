import { HttpError } from '@/lib/server/http';
import { readOccasion, readOccasionFilters } from './occasion';
import { getServerEnv } from '@/lib/server/env';
import { isWishlistImagePublicId, WISHLIST_IMAGE_MAX_SIZE_BYTES } from './constants/image';
import { getDescriptionValidationError, normalizeDescription } from './utils/description';
import { getSafeHttpUrl, isOwner } from './wishlist.utils';
import type { CreateItemDTO, UpdateItemDTO, WishlistSpec } from './wishlist.types';

const IMAGE_FIELDS = [
  'imageUrl',
  'imagePublicId',
  'imageWidth',
  'imageHeight',
  'imageFormat',
  'imageBytes',
] as const;
const ITEM_FIELDS = [
  'owner',
  'topic',
  'name',
  'price',
  'url',
  'description',
  'specs',
  'occasion',
  ...IMAGE_FIELDS,
];

export function parseObject(input: unknown, allowed: readonly string[]): Record<string, unknown> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Expected a JSON object');
  }
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => !allowed.includes(key))) {
    throw new HttpError(400, 'Unknown or forbidden field');
  }
  return record;
}

function text(value: unknown, field: string, max: number, required = false): string {
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text`);
  const normalized = value.trim();
  if ((required && !normalized) || normalized.length > max) {
    throw new HttpError(400, `${field} is empty or too long`);
  }
  return normalized;
}

function parseSpecs(value: unknown): WishlistSpec[] {
  if (!Array.isArray(value) || value.length > 50) {
    throw new HttpError(400, 'Specifications must be an array of at most 50 entries');
  }
  return value.map((entry: unknown) => {
    const spec = parseObject(entry, ['label', 'value']);
    return {
      label: text(spec.label, 'Specification label', 100, true),
      value: text(spec.value, 'Specification value', 500, true),
    };
  });
}

function parseImage(body: Record<string, unknown>, update: boolean): UpdateItemDTO {
  const present = IMAGE_FIELDS.filter((key) => Object.hasOwn(body, key));
  if (!present.length) return {};
  if (present.some((key) => body[key] === null)) {
    if (
      !update ||
      body.imageUrl !== null ||
      body.imagePublicId !== null ||
      present.some((key) => body[key] !== null)
    ) {
      throw new HttpError(400, 'Remove the image with null imageUrl and imagePublicId');
    }
    return Object.fromEntries(IMAGE_FIELDS.map((key) => [key, null]));
  }
  if (!isWishlistImagePublicId(body.imagePublicId))
    throw new HttpError(400, 'Invalid wishlist image publicId');
  const imageUrl = text(body.imageUrl, 'Image URL', 2048, true);
  const cloudName = getServerEnv('CLOUDINARY_CLOUD_NAME');
  if (!cloudName) throw new HttpError(503, 'Image configuration is unavailable');
  let url: URL;
  try {
    url = new URL(imageUrl);
  } catch {
    throw new HttpError(400, 'Invalid image URL');
  }
  const prefix = `/${cloudName}/image/upload/`;
  const assetPath = url.pathname.slice(prefix.length).replace(/^v\d+\//, '');
  const publicId = body.imagePublicId;
  const matchesAsset = ['jpg', 'jpeg', 'png', 'webp'].some(
    (format) => assetPath === `${publicId}.${format}`
  );
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'res.cloudinary.com' ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !url.pathname.startsWith(prefix) ||
    !matchesAsset
  ) {
    throw new HttpError(
      400,
      'Image URL must match a wishlist upload in the configured Cloudinary account'
    );
  }
  const result: UpdateItemDTO = { imageUrl: url.href, imagePublicId: publicId };
  for (const field of ['imageWidth', 'imageHeight', 'imageBytes'] as const) {
    if (!Object.hasOwn(body, field)) continue;
    const value = body[field];
    const max = field === 'imageBytes' ? WISHLIST_IMAGE_MAX_SIZE_BYTES : 100_000;
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0 || value > max)
      throw new HttpError(400, `Invalid ${field}`);
    result[field] = value;
  }
  if (Object.hasOwn(body, 'imageFormat')) {
    if (
      typeof body.imageFormat !== 'string' ||
      !['jpg', 'jpeg', 'png', 'webp'].includes(body.imageFormat)
    )
      throw new HttpError(400, 'Invalid image format');
    const extension = assetPath.slice(assetPath.lastIndexOf('.') + 1);
    const normalizeFormat = (format: string) => (format === 'jpeg' ? 'jpg' : format);
    if (normalizeFormat(body.imageFormat) !== normalizeFormat(extension)) {
      throw new HttpError(400, 'Image format does not match the URL');
    }
    result.imageFormat = body.imageFormat;
  }
  return result;
}

function parseFields(input: unknown, update: boolean): UpdateItemDTO {
  const body = parseObject(input, ITEM_FIELDS);
  if (update && !Object.keys(body).length) throw new HttpError(400, 'No changes supplied');
  const result: UpdateItemDTO = {};
  if (!update || Object.hasOwn(body, 'owner')) {
    if (!isOwner(body.owner)) throw new HttpError(400, 'Invalid owner');
    result.owner = body.owner;
  }
  for (const [field, max] of [
    ['topic', 200],
    ['name', 300],
    ['price', 100],
  ] as const) {
    if ((!update && field !== 'price') || Object.hasOwn(body, field))
      result[field] = text(body[field], field, max, field !== 'price');
  }
  if (Object.hasOwn(body, 'url')) {
    const value = text(body.url, 'Reference URL', 2048);
    const safeUrl = getSafeHttpUrl(value);
    if (value && !safeUrl) throw new HttpError(400, 'Reference URL must use HTTP or HTTPS');
    result.url = safeUrl;
  }
  if (Object.hasOwn(body, 'description')) {
    const error = getDescriptionValidationError(body.description);
    if (error) throw new HttpError(400, error);
    result.description = normalizeDescription(body.description) ?? '';
  }
  if (Object.hasOwn(body, 'specs')) result.specs = parseSpecs(body.specs);
  if (Object.hasOwn(body, 'occasion')) {
    if (update && body.occasion === null) result.occasion = null;
    else {
      const occasion = readOccasion(body.occasion);
      if (!occasion)
        throw new HttpError(
          400,
          'Invalid occasion: choose a type, year and desire from 1 to 5; Other requires a label'
        );
      result.occasion = occasion;
    }
  }
  return { ...result, ...parseImage(body, update) };
}

export function parseOccasionFilters(params: URLSearchParams) {
  try {
    return readOccasionFilters(params);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Invalid occasion filters');
  }
}

export function parseCreateItem(input: unknown): CreateItemDTO {
  // The create branch validates required fields and disallows null images.
  return parseFields(input, false) as CreateItemDTO;
}

export function parseUpdateItem(input: unknown): UpdateItemDTO {
  return parseFields(input, true);
}

export function parseItemId(id: string | undefined): string {
  if (!id || id === '.' || id === '..' || id.includes('/') || Buffer.byteLength(id) > 1500)
    throw new HttpError(400, 'Invalid item ID');
  return id;
}
