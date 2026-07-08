import type { OwnerFilter } from '@/modules/wishlist/wishlist.types';

export class WishlistFeedHandler {
  private static readonly FRAGMENT_URL = '/api/items/fragment';

  private loadMoreBtn: HTMLButtonElement | null;
  private container: HTMLElement | null;
  private endMessage: HTMLElement | null;
  private ownerFilter: OwnerFilter;

  constructor(ownerFilter: OwnerFilter = null) {
    this.loadMoreBtn = document.getElementById('load-more-btn') as HTMLButtonElement;
    this.container = document.getElementById('feed-container');
    this.endMessage = document.getElementById('end-message');
    this.ownerFilter = ownerFilter;

    if (this.loadMoreBtn && this.container) {
      this.init();
    }
  }

  private init() {
    this.loadMoreBtn?.addEventListener('click', () => this.loadMore());
  }

  private async loadMore() {
    if (!this.loadMoreBtn) return;

    const cursor = this.loadMoreBtn.getAttribute('data-cursor');
    if (!cursor) return;

    this.loadMoreBtn.textContent = 'Loading...';
    this.loadMoreBtn.disabled = true;

    try {
      const params = new URLSearchParams();
      if (this.ownerFilter) params.append('owner', this.ownerFilter);
      params.append('cursor', cursor);

      const res = await fetch(`${WishlistFeedHandler.FRAGMENT_URL}?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load items');

      const html = await res.text();
      const nextCursor = res.headers.get('X-Next-Cursor');

      if (html.trim()) {
        this.container?.insertAdjacentHTML('beforeend', html);

        if (nextCursor) {
          this.loadMoreBtn.setAttribute('data-cursor', nextCursor);
          this.loadMoreBtn.textContent = 'Load More';
          this.loadMoreBtn.disabled = false;
        } else {
          this.hideButton();
        }
      } else {
        this.hideButton();
      }
    } catch (e) {
      console.error(e);
      this.loadMoreBtn.textContent = 'Error';
    }
  }

  private hideButton() {
    if (this.loadMoreBtn) this.loadMoreBtn.style.display = 'none';
    if (this.endMessage) this.endMessage.classList.remove('hidden');
  }
}
