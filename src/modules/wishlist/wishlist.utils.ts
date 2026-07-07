import type { Owner } from './wishlist.types';

export const WISHLIST_DESCRIPTION_MAX_LENGTH = 255;

const OWNER_META = {
  me: {
    initial: 'A',
    name: 'Andrii',
    path: '/andrii',
    telegramLabel: '🤵‍♂️ Andrii',
  },
  her: {
    initial: 'J',
    name: 'Juliette',
    path: '/juliette',
    telegramLabel: '💃 Juliette',
  },
} as const satisfies Record<
  Owner,
  {
    initial: string;
    name: string;
    path: string;
    telegramLabel: string;
  }
>;

export function isOwner(value: unknown): value is Owner {
  return value === 'me' || value === 'her';
}

export function getOwnerInitial(owner: Owner) {
  return OWNER_META[owner].initial;
}

export function getOwnerName(owner: Owner) {
  return OWNER_META[owner].name;
}

export function getOwnerPath(owner: Owner) {
  return OWNER_META[owner].path;
}

export function getOwnerItemPath(owner: Owner, itemId: string) {
  return `${getOwnerPath(owner)}/item/${itemId}`;
}

export function getOwnerTelegramLabel(owner: Owner) {
  return OWNER_META[owner].telegramLabel;
}

export function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function getSafeHttpUrl(value?: string) {
  if (!value) return '';

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : '';
  } catch {
    return '';
  }
}

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
