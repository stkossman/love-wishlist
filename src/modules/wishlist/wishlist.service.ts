import { deleteWishlistImage, isWishlistImagePublicId } from '@/lib/server/cloudinary';
import { WishlistRepository } from './wishlist.repository';
import type { CreateItemDTO, Owner, WishlistItem } from './wishlist.types';
import { escapeHtml, getOwnerTelegramLabel, getSafeHttpUrl } from './wishlist.utils';
import { Telegraf } from 'telegraf';

export class WishlistService {
  private static getBot() {
    const token = import.meta.env.TELEGRAM_BOT_TOKEN;
    const chatId = import.meta.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return null;
    return { bot: new Telegraf(token), chatId };
  }

  private static async sendTelegramCreateNotification(item: CreateItemDTO) {
    const config = this.getBot();
    if (!config) return;

    try {
      const ownerEmoji = getOwnerTelegramLabel(item.owner);
      const safeUrl = getSafeHttpUrl(item.url);
      const linkText = safeUrl ? `\n🔗 <a href="${escapeHtml(safeUrl)}">Link</a>` : '';
      const itemName = escapeHtml(item.name);

      const message = `<b>New Item!</b> 🎁\n\n👤 <b>For:</b> ${ownerEmoji}\n🏷 <b>Item:</b> ${itemName}${linkText}`;

      await config.bot.telegram.sendMessage(config.chatId, message, { parse_mode: 'HTML' });
    } catch (e) {
      console.error('Telegram create notify failed', e);
    }
  }

  private static async sendTelegramDeleteNotification(item: WishlistItem) {
    const config = this.getBot();
    if (!config) return;

    try {
      const ownerEmoji = getOwnerTelegramLabel(item.owner);
      const itemName = escapeHtml(item.name);

      const message = `
<b>Item Removed!</b> 🗑️

👤 <b>From:</b> ${ownerEmoji}
❌ <b>Item:</b> <s>${itemName}</s>
      `;

      await config.bot.telegram.sendMessage(config.chatId, message, { parse_mode: 'HTML' });
    } catch (e) {
      console.error('Telegram delete notify failed', e);
    }
  }

  static async createItem(data: CreateItemDTO) {
    const id = await WishlistRepository.create(data);
    void this.sendTelegramCreateNotification(data);
    return id;
  }

  static async getItems(owner?: Owner, cursor?: string) {
    return await WishlistRepository.findAll(owner, cursor);
  }

  static async getItem(id: string) {
    return await WishlistRepository.findById(id);
  }

  static async deleteItem(id: string) {
    const item = await WishlistRepository.findById(id);
    await WishlistRepository.delete(id);
    if (item) {
      void this.sendTelegramDeleteNotification(item);
      if (isWishlistImagePublicId(item.imagePublicId)) {
        void deleteWishlistImage(item.imagePublicId).catch((error) => {
          console.error('Cloudinary image delete failed after item deletion', error);
        });
      }
    }
  }

  static async updateItem(id: string, data: Partial<CreateItemDTO>) {
    return await WishlistRepository.update(id, data);
  }
}
