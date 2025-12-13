import { WishlistRepository } from './wishlist.repository';
import type { CreateItemDTO } from './wishlist.types';
import { Telegraf } from 'telegraf';

export class WishlistService {
  private static async sendTelegramNotification(item: CreateItemDTO) {
    const token = import.meta.env.TELEGRAM_BOT_TOKEN;
    const chatId = import.meta.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) return;

    try {
      const bot = new Telegraf(token);
      const ownerEmoji = item.owner === 'me' ? '🤵‍♂️ Andrii' : '💃 Juliette';
      const message = `<b>New Item!</b>\n👤 ${ownerEmoji}\n🏷 ${item.name}`;

      await bot.telegram.sendMessage(chatId, message, { parse_mode: 'HTML' });
    } catch (e) {
      console.error('Telegram failed', e);
    }
  }

  static async createItem(data: CreateItemDTO) {
    const id = await WishlistRepository.create(data);

    void this.sendTelegramNotification(data);

    return id;
  }

  static async getItems(owner?: string, cursor?: string) {
    return await WishlistRepository.findAll(owner, cursor);
  }

  static async deleteItem(id: string) {
    return await WishlistRepository.delete(id);
  }

  static async updateItem(id: string, data: Partial<CreateItemDTO>) {
    return await WishlistRepository.update(id, data);
  }
}
