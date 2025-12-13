import type { Timestamp } from 'firebase/firestore';

export type Owner = 'me' | 'her';

// Те, що лежить в БД
export interface WishlistItem {
  id: string;
  topic: string;
  name: string;
  owner: Owner;
  price?: string;
  url?: string;
  specs?: { label: string; value: string }[];
  createdAt: string;
}

export interface CreateItemDTO {
  topic: string;
  name: string;
  owner: Owner;
  price?: string;
  url?: string;
  specs?: { label: string; value: string }[];
}

export interface UpdateItemDTO extends Partial<CreateItemDTO> {}
