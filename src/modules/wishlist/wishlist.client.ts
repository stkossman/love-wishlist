import type { CreateItemDTO, Owner, UpdateItemDTO } from './wishlist.types';

export class WishlistClient {
  private static BASE_URL = '/api/items';

  static async getAll(owner?: Owner, cursor?: string) {
    const params = new URLSearchParams();
    if (owner) params.append('owner', owner);
    if (cursor) params.append('cursor', cursor);

    const res = await fetch(`${this.BASE_URL}?${params.toString()}`);
    return res.json();
  }

  static async create(data: CreateItemDTO, pin: string) {
    const res = await fetch(this.BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-pin': pin,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) throw new Error('Failed to create');
    return res.json();
  }

  static async update(id: string, data: UpdateItemDTO, pin: string) {
    const res = await fetch(`${this.BASE_URL}/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-auth-pin': pin,
      },
      body: JSON.stringify(data),
    });

    if (!res.ok) throw new Error('Failed to update');
    return res.json();
  }

  static async delete(id: string) {
    const res = await fetch(`${this.BASE_URL}/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Failed to delete');
  }
}
