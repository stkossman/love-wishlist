export type Owner = "me" | "her";
export type ItemStatus = "wanted" | "ordered" | "acquired" | "archived";

export interface WishlistItem {
  id?: string;
  topic: string;
  name: string;
  owner: Owner;
  price?: string;
  url?: string;
  priority?: number;
  status: ItemStatus;

  specs?: {
    label: string;
    value: string;
  }[];

  createdAt?: any;
}
