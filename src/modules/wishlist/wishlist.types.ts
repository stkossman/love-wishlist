export type Owner = 'me' | 'her';
export type OwnerFilter = Owner | null;

export interface WishlistSpec {
  label: string;
  value: string;
}

export interface WishlistItem {
  id: string;
  topic: string;
  name: string;
  owner: Owner;
  price?: string;
  url?: string;
  specs?: WishlistSpec[];
  createdAt: string;
}

export interface CreateItemDTO {
  topic: string;
  name: string;
  owner: Owner;
  price?: string;
  url?: string;
  specs?: WishlistSpec[];
}

export interface UpdateItemDTO extends Partial<CreateItemDTO> {}
