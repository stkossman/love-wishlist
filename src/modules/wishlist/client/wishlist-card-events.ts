import { WishlistClient } from './wishlist-api-client';

export class WishlistCardEvents {
  static init() {
    document.addEventListener('click', (e) => this.handleClick(e));
  }

  private static async handleClick(e: MouseEvent) {
    const target = e.target as HTMLElement;

    const menuBtn = target.closest('.menu-btn');
    if (menuBtn) {
      e.stopPropagation();
      const dropdown = menuBtn.nextElementSibling;

      document.querySelectorAll('.menu-dropdown').forEach((el) => {
        if (el !== dropdown) el.classList.add('hidden');
      });

      dropdown?.classList.toggle('hidden');
      return;
    }

    const isDropdown = target.closest('.menu-dropdown');
    if (!menuBtn && !isDropdown) {
      document.querySelectorAll('.menu-dropdown').forEach((el) => el.classList.add('hidden'));
    }

    const deleteBtn = target.closest('.delete-btn') as HTMLButtonElement;
    if (deleteBtn) {
      e.stopPropagation();
      if (!confirm('Are you sure you want to delete this item?')) return;

      const id = deleteBtn.dataset.id;
      const redirectTo = deleteBtn.dataset.redirectTo;
      const card = deleteBtn.closest('article') as HTMLElement;

      if (!id) return;

      if (card) {
        card.style.opacity = '0.3';
        card.style.pointerEvents = 'none';
      }

      try {
        await WishlistClient.delete(id);
        if (redirectTo) {
          window.location.href = redirectTo;
          return;
        }

        card?.remove();
      } catch (error) {
        console.error('Error deleting:', error);
        alert('Error deleting item');
        if (card) {
          card.style.opacity = '1';
          card.style.pointerEvents = 'auto';
        }
      }
    }
  }
}
