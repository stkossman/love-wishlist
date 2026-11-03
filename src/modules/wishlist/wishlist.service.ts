import { deleteWishlistImage, isWishlistImagePublicId } from '@/lib/server/cloudinary';
import { WishlistRepository } from './wishlist.repository';
import type {
  CreateItemDTO,
  Owner,
  UpdateItemDTO,
  WishlistItem,
  WishlistPage,
} from './wishlist.types';
import { HttpError } from '@/lib/server/http';
import { escapeHtml, getOwnerTelegramLabel, getSafeHttpUrl } from './wishlist.utils';

export class WishlistService {
  private static getTelegramConfig() {
    const token = process.env.TELEGRAM_BOT_TOKEN ?? import.meta.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID ?? import.meta.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return null;
    return { token, chatId };
  }

  private static async sendTelegramCreateNotification(item: CreateItemDTO) {
    try {
      const ownerEmoji = getOwnerTelegramLabel(item.owner);
      const safeUrl = getSafeHttpUrl(item.url);
      const linkText = safeUrl ? `\n🔗 <a href="${escapeHtml(safeUrl)}">Link</a>` : '';
      const itemName = escapeHtml(item.name);

      const message = `<b>New Item!</b> 🎁\n\n👤 <b>For:</b> ${ownerEmoji}\n🏷 <b>Item:</b> ${itemName}${linkText}`;

      await this.sendTelegramMessage(message);
    } catch (e) {
      console.error(
        'Telegram create notification failed',
        e instanceof Error ? e.name : 'Unknown error'
      );
    }
  }

  private static async sendTelegramDeleteNotification(item: WishlistItem) {
    try {
      const ownerEmoji = getOwnerTelegramLabel(item.owner);
      const itemName = escapeHtml(item.name);

      const message = `
<b>Item Removed!</b> 🗑️

👤 <b>From:</b> ${ownerEmoji}
❌ <b>Item:</b> <s>${itemName}</s>
      `;

      await this.sendTelegramMessage(message);
    } catch (e) {
      console.error(
        'Telegram delete notification failed',
        e instanceof Error ? e.name : 'Unknown error'
      );
    }
  }

  private static async sendTelegramMessage(text: string): Promise<void> {
    const config = this.getTelegramConfig();
    if (!config) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    try {
      const response = await fetch(`https://api.telegram.org/bot${config.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: config.chatId, text, parse_mode: 'HTML' }),
        signal: controller.signal,
      });
      const result: unknown = await response.json();
      if (
        !response.ok ||
        !result ||
        typeof result !== 'object' ||
        !('ok' in result) ||
        result.ok !== true
      ) {
        throw new Error('Telegram notification rejected');
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  static async createItem(data: CreateItemDTO): Promise<string> {
    const id = await WishlistRepository.create(data);
    await this.sendTelegramCreateNotification(data);
    return id;
  }

  static async getItems(owner?: Owner, cursor?: string): Promise<WishlistPage> {
    return await WishlistRepository.findAll(owner, cursor);
  }

  static async getItem(id: string): Promise<WishlistItem | null> {
    return await WishlistRepository.findById(id);
  }

  static async deleteItem(id: string): Promise<void> {
    const item = await WishlistRepository.findById(id);
    if (!item) throw new HttpError(404, 'Item not found');
    await WishlistRepository.delete(id);
    await Promise.all([
      this.sendTelegramDeleteNotification(item),
      isWishlistImagePublicId(item.imagePublicId)
        ? deleteWishlistImage(item.imagePublicId).catch((error: unknown) => {
            console.error(
              'Cloudinary image delete failed after item deletion',
              error instanceof Error ? error.name : 'Unknown error'
            );
          })
        : Promise.resolve(),
    ]);
  }

  static async updateItem(id: string, data: UpdateItemDTO): Promise<void> {
    if (!(await WishlistRepository.update(id, data))) throw new HttpError(404, 'Item not found');
  }
}
