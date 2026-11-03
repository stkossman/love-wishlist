import { MEASUREMENT_KEYS, type MeasurementKey, type Person } from '@/data/sizes';
import { HttpError } from '@/lib/server/http';

export const MAX_MEASUREMENT_LENGTH = 20;
export const MEASUREMENT_PATTERN = '[0-9]+(?:[.][0-9]+)?(?:-[0-9]+(?:[.][0-9]+)?)?';
export type MeasurementUpdates = Partial<Record<MeasurementKey, string>>;

export function isPerson(value: unknown): value is Person {
  return value === 'andrii' || value === 'juliette';
}

export function isMeasurementValue(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_MEASUREMENT_LENGTH) return false;
  if (!new RegExp(`^${MEASUREMENT_PATTERN}$`).test(value)) return false;
  const [start, end = start] = value.split('-').map(Number);
  return start > 0 && end >= start && end <= 300;
}

export function parseMeasurementUpdates(body: unknown): MeasurementUpdates {
  if (!body || typeof body !== 'object' || Array.isArray(body))
    throw new HttpError(400, 'Provide measurement values');
  const entries = Object.entries(body);
  if (!entries.length) throw new HttpError(400, 'Provide at least one measurement');
  const updates: MeasurementUpdates = {};
  for (const [key, raw] of entries) {
    if (!MEASUREMENT_KEYS.some((field) => field === key))
      throw new HttpError(400, 'Unknown measurement');
    const value = typeof raw === 'string' ? raw.trim() : raw;
    if (typeof raw === 'string' && raw.length > MAX_MEASUREMENT_LENGTH)
      throw new HttpError(400, 'Measurement values must be at most 20 characters');
    if (!isMeasurementValue(value))
      throw new HttpError(400, 'Use a positive number or ascending range up to 300, e.g. 17.5-18');
    updates[key as MeasurementKey] = value;
  }
  return updates;
}
