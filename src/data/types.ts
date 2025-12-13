export type Owner = "me" | "her";

export interface WishlistItem {
  id?: string;
  topic: string;
  name: string;
  owner: Owner;
  price?: string;
  url?: string;
  priority?: number;

  specs?: {
    label: string;
    value: string;
  }[];

  createdAt?: any;
}
