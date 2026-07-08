import type { Owner } from './wishlist.types';

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
