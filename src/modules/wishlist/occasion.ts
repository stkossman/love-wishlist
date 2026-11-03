import type { OccasionFilters, OccasionType, WishlistOccasion } from './wishlist.types';

export const OCCASIONS = {
  'new-year': 'New Year',
  birthday: 'Birthday',
  christmas: 'Christmas',
  'valentines-day': "Valentine's Day",
  anniversary: 'Anniversary',
  other: 'Other',
} as const satisfies Record<OccasionType, string>;
export const MIN_OCCASION_YEAR = 1900;
export const MAX_OCCASION_YEAR = 9999;
export function isOccasionType(value: unknown): value is OccasionType {
  return typeof value === 'string' && Object.hasOwn(OCCASIONS, value);
}
export function occasionName(occasion: WishlistOccasion): string {
  return occasion.type === 'other' ? occasion.customLabel! : OCCASIONS[occasion.type];
}
export function readOccasion(value: unknown): WishlistOccasion | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return;
  const data = value as Record<string, unknown>;
  if (Object.keys(data).some((key) => !['type', 'year', 'desire', 'customLabel'].includes(key)))
    return;
  if (
    !isOccasionType(data.type) ||
    typeof data.year !== 'number' ||
    !Number.isInteger(data.year) ||
    data.year < MIN_OCCASION_YEAR ||
    data.year > MAX_OCCASION_YEAR ||
    typeof data.desire !== 'number' ||
    !Number.isInteger(data.desire) ||
    data.desire < 1 ||
    data.desire > 5
  )
    return;
  if (data.type === 'other') {
    if (
      typeof data.customLabel !== 'string' ||
      !data.customLabel.trim() ||
      data.customLabel.trim().length > 80
    )
      return;
  } else if (data.customLabel !== undefined) return;
  return {
    type: data.type,
    year: data.year,
    desire: data.desire as WishlistOccasion['desire'],
    ...(data.type === 'other' ? { customLabel: (data.customLabel as string).trim() } : {}),
  };
}
export function readOccasionFilters(params: URLSearchParams): OccasionFilters {
  const collection = params.get('collection');
  const type = params.get('occasion') || null;
  const year = params.get('year') || null;
  if (collection !== null && collection !== 'occasions') throw new Error('Invalid collection');
  if (type !== null && !isOccasionType(type)) throw new Error('Invalid occasion');
  if (
    year !== null &&
    (!/^\d{4}$/.test(year) || Number(year) < MIN_OCCASION_YEAR || Number(year) > MAX_OCCASION_YEAR)
  )
    throw new Error('Invalid occasion year');
  return {
    ...(collection || type || year ? { occasions: true } : {}),
    ...(isOccasionType(type) ? { type } : {}),
    ...(year !== null ? { year: Number(year) } : {}),
  };
}
