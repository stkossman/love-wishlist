import type {
  CreateItemDTO,
  CreateItemResult,
  MutationResult,
  Owner,
  UpdateItemDTO,
  WishlistPage,
} from '@/modules/wishlist/wishlist.types';
import { checkResponse } from './wishlist-auth-client';

export class WishlistClient {
  private static BASE_URL = '/api/items';

  static async getAll(owner?: Owner, cursor?: string): Promise<WishlistPage> {
    const params = new URLSearchParams();
    if (owner) params.append('owner', owner);
    if (cursor) params.append('cursor', cursor);

    const res = await fetch(`${this.BASE_URL}?${params.toString()}`);
    await checkResponse(res);
    return res.json();
  }

  static async create(data: CreateItemDTO): Promise<CreateItemResult> {
    const res = await fetch(this.BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    await checkResponse(res);
    return res.json();
  }

  static async update(id: string, data: UpdateItemDTO): Promise<MutationResult> {
    const res = await fetch(`${this.BASE_URL}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    await checkResponse(res);
    return res.json();
  }

  static async delete(id: string): Promise<void> {
    const res = await fetch(`${this.BASE_URL}/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await checkResponse(res);
  }
}
