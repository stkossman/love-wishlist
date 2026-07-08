export const WISHLIST_DESCRIPTION_MAX_LENGTH = 1024;

export type DescriptionSegment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string; href: string };

const DESCRIPTION_URL_PATTERN = /(?:https?:\/\/[^\s<]+|www\.[^\s<]+)/gi;
const TRAILING_URL_PUNCTUATION_PATTERN = /[.,!?;:)]+$/;

export function getDescriptionValidationError(value: unknown) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return 'Description must be text';

  return value.trim().length > WISHLIST_DESCRIPTION_MAX_LENGTH
    ? `Description must be ${WISHLIST_DESCRIPTION_MAX_LENGTH} characters or less`
    : null;
}

export function normalizeDescription(value: unknown) {
  return typeof value === 'string' ? value.trim() : undefined;
}

export function normalizePayloadDescription<T>(payload: T): T {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;
  if (!Object.prototype.hasOwnProperty.call(payload, 'description')) return payload;

  return {
    ...payload,
    description: normalizeDescription((payload as Record<string, unknown>).description) ?? '',
  };
}

export function normalizeDescriptionUrl(value: string) {
  const candidate = value.startsWith('www.') ? `https://${value}` : value;

  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function isSafeDescriptionUrl(value: string) {
  return Boolean(normalizeDescriptionUrl(value));
}

export function parseDescriptionSegments(description: string): DescriptionSegment[] {
  const segments: DescriptionSegment[] = [];
  let lastIndex = 0;

  for (const match of description.matchAll(DESCRIPTION_URL_PATTERN)) {
    const rawMatch = match[0];
    const matchIndex = match.index ?? 0;
    const linkValue = rawMatch.replace(TRAILING_URL_PUNCTUATION_PATTERN, '');
    const trailingText = rawMatch.slice(linkValue.length);
    const href = normalizeDescriptionUrl(linkValue);

    if (matchIndex > lastIndex) {
      segments.push({ type: 'text', value: description.slice(lastIndex, matchIndex) });
    }

    if (href) {
      segments.push({ type: 'link', value: linkValue, href });
    } else {
      segments.push({ type: 'text', value: linkValue });
    }

    if (trailingText) {
      segments.push({ type: 'text', value: trailingText });
    }

    lastIndex = matchIndex + rawMatch.length;
  }

  if (lastIndex < description.length) {
    segments.push({ type: 'text', value: description.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: 'text', value: description }];
}
