export type Owner = 'me' | 'her';
export type OwnerFilter = Owner | null;

export interface WishlistSpec {
  label: string;
  value: string;
}

export interface WishlistImageFields {
  imageUrl?: string;
  imagePublicId?: string;
  imageWidth?: number;
  imageHeight?: number;
  imageFormat?: string;
  imageBytes?: number;
}

export interface WishlistImageMetadata {
  secureUrl: string;
  publicId: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

export interface WishlistItem extends WishlistImageFields {
  id: string;
  topic: string;
  name: string;
  owner: Owner;
  price?: string;
  url?: string;
  description?: string;
  specs?: WishlistSpec[];
  createdAt: string;
}

export interface CreateItemDTO extends WishlistImageFields {
  topic: string;
  name: string;
  owner: Owner;
  price?: string;
  url?: string;
  description?: string;
  specs?: WishlistSpec[];
}

type NullableWishlistImageFields = {
  [Key in keyof WishlistImageFields]?: WishlistImageFields[Key] | null;
};

export type UpdateItemDTO = Partial<Omit<CreateItemDTO, keyof WishlistImageFields>> &
  NullableWishlistImageFields;
