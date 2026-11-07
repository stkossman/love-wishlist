export type Owner = 'me' | 'her';
export type OwnerFilter = Owner | null;
export type DescriptionFormat = 'plain' | 'markdown';

export type OccasionType =
  'new-year' | 'birthday' | 'christmas' | 'valentines-day' | 'anniversary' | 'other';
export interface WishlistOccasion {
  type: OccasionType;
  year: number;
  desire: 1 | 2 | 3 | 4 | 5;
  customLabel?: string;
}
export interface OccasionFilters {
  occasions?: boolean;
  type?: OccasionType;
  year?: number;
}

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
  occasion?: WishlistOccasion;
  id: string;
  topic: string;
  name: string;
  owner: Owner;
  price?: string;
  url?: string;
  description?: string;
  descriptionFormat?: DescriptionFormat;
  specs?: WishlistSpec[];
  createdAt: string;
}

export interface CreateItemDTO extends WishlistImageFields {
  occasion?: WishlistOccasion;
  topic: string;
  name: string;
  owner: Owner;
  price?: string;
  url?: string;
  description?: string;
  descriptionFormat?: DescriptionFormat;
  specs?: WishlistSpec[];
}

type NullableWishlistImageFields = {
  [Key in keyof WishlistImageFields]?: WishlistImageFields[Key] | null;
};

export type UpdateItemDTO = Partial<Omit<CreateItemDTO, keyof WishlistImageFields | 'occasion'>> &
  NullableWishlistImageFields & { occasion?: WishlistOccasion | null };

export interface WishlistPage {
  items: WishlistItem[];
  nextCursor: string | null;
}

export interface MutationResult {
  message: string;
}

export interface CreateItemResult extends MutationResult {
  id: string;
}
