import type { CreateItemDTO, Owner, UpdateItemDTO } from '@/modules/wishlist/wishlist.types';
import { checkResponse } from './wishlist-auth-client';

export class WishlistClient {
  private static BASE_URL = '/api/items';

  static async getAll(owner?: Owner, cursor?: string) {
    const params = new URLSearchParams();
    if (owner) params.append('owner', owner);
    if (cursor) params.append('cursor', cursor);

    const res = await fetch(`${this.BASE_URL}?${params.toString()}`);
    return res.json();
  }

  static async create(data: CreateItemDTO) {
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

  static async update(id: string, data: UpdateItemDTO) {
    const res = await fetch(`${this.BASE_URL}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    });

    await checkResponse(res);
    return res.json();
  }

  static async delete(id: string) {
    const res = await fetch(`${this.BASE_URL}/${id}`, { method: 'DELETE' });
    await checkResponse(res);
  }
}
