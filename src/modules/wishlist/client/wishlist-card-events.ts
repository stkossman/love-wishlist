import { WishlistClient } from './wishlist-api-client';
import { ApiError, requestMutationAccess } from './wishlist-auth-client';

export class WishlistCardEvents {
  private static initialized = false;
  private static pending = new Set<string>();
  static init() {
    if (this.initialized) return;
    this.initialized = true;
    document.addEventListener('click', (e) => this.handleClick(e));
    document.addEventListener('keydown', (e) => this.handleKeydown(e));
    document.addEventListener('focusin', (e) => {
      if (!(e.target instanceof Element) || !e.target.closest('.menu-dropdown, .menu-btn'))
        this.closeMenus();
    });
  }

  private static closeMenus(except?: Element | null) {
    document.querySelectorAll('.menu-btn').forEach((button) => {
      if (button === except) return;
      button.setAttribute('aria-expanded', 'false');
      button.nextElementSibling?.classList.add('hidden');
    });
  }

  private static handleKeydown(event: KeyboardEvent) {
    if (!(event.target instanceof Element)) return;
    const target = event.target;
    const button = target.closest('.menu-btn');
    const dropdown = target.closest('.menu-dropdown');
    if (event.key === 'Escape' && (button || dropdown)) {
      event.preventDefault();
      const trigger = button ?? dropdown?.previousElementSibling;
      this.closeMenus();
      if (trigger instanceof HTMLElement) trigger.focus();
      return;
    }
    if (button && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      this.closeMenus(button);
      button.setAttribute('aria-expanded', 'true');
      const panel = button.nextElementSibling;
      panel?.classList.remove('hidden');
      const actions = panel?.querySelectorAll<HTMLElement>('a, button');
      const index = event.key === 'ArrowUp' ? (actions?.length ?? 1) - 1 : 0;
      actions?.[index]?.focus();
    }
  }

  private static async handleClick(e: MouseEvent) {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const menuBtn = target.closest('.menu-btn');
    if (menuBtn) {
      e.stopPropagation();
      const dropdown = menuBtn.nextElementSibling;

      const opening = menuBtn.getAttribute('aria-expanded') !== 'true';
      this.closeMenus();
      menuBtn.setAttribute('aria-expanded', String(opening));
      dropdown?.classList.toggle('hidden', !opening);
      return;
    }

    const isDropdown = target.closest('.menu-dropdown');
    if (!menuBtn && !isDropdown) {
      this.closeMenus();
    }

    const deleteBtn = target.closest('.delete-btn') as HTMLButtonElement;
    if (deleteBtn) {
      e.stopPropagation();
      if (deleteBtn.disabled || (deleteBtn.dataset.id && this.pending.has(deleteBtn.dataset.id)))
        return;
      if (!confirm('Are you sure you want to delete this item?')) return;

      const id = deleteBtn.dataset.id;
      const redirectTo = deleteBtn.dataset.redirectTo;
      const card = deleteBtn.closest('article') as HTMLElement;

      if (!id) return;
      this.pending.add(id);
      const originalText = deleteBtn.textContent;
      deleteBtn.disabled = true;
      deleteBtn.textContent = 'Deleting...';
      const opacity = card?.style.opacity ?? '';
      const pointerEvents = card?.style.pointerEvents ?? '';
      let redirecting = false;

      if (card) {
        card.style.opacity = '0.3';
        card.style.pointerEvents = 'none';
      }

      try {
        if (!(await requestMutationAccess())) return;
        await WishlistClient.delete(id);
        if (redirectTo) {
          window.location.href = redirectTo;
          redirecting = true;
          return;
        }

        this.removeCard(card);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) {
          if (redirectTo) {
            window.location.href = redirectTo;
            redirecting = true;
          } else this.removeCard(card);
          return;
        }
        console.error('Error deleting:', error);
        alert(error instanceof ApiError ? error.message : 'Error deleting item');
      } finally {
        this.pending.delete(id);
        if (!redirecting) {
          deleteBtn.disabled = false;
          deleteBtn.textContent = originalText;
        }
        if (card?.isConnected) {
          card.style.opacity = opacity;
          card.style.pointerEvents = pointerEvents;
        }
      }
    }
  }

  private static removeCard(card: HTMLElement | null) {
    const feed = card?.closest('#feed-container');
    card?.remove();
    feed?.dispatchEvent(new Event('wishlist:item-deleted'));
  }
}
