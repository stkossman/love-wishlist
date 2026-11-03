import type { OccasionFilters, OwnerFilter } from '@/modules/wishlist/wishlist.types';
import { ApiError, checkResponse } from './wishlist-auth-client';

export class WishlistFeedHandler {
  private static readonly FRAGMENT_URL = '/api/items/fragment';

  private loadMoreBtn: HTMLButtonElement | null;
  private container: HTMLElement | null;
  private endMessage: HTMLElement | null;
  private ownerFilter: OwnerFilter;
  private loading = false;
  private refreshRequired = false;

  constructor(
    ownerFilter: OwnerFilter = null,
    private filters: OccasionFilters = {}
  ) {
    this.loadMoreBtn = document.getElementById('load-more-btn') as HTMLButtonElement;
    this.container = document.getElementById('feed-container');
    this.endMessage = document.getElementById('end-message');
    this.ownerFilter = ownerFilter;

    this.container?.addEventListener('wishlist:item-deleted', () => this.updateEmptyState());
    if (this.container) {
      this.init();
    }
  }

  private init() {
    this.loadMoreBtn?.addEventListener('click', () => this.loadMore());
  }

  private async loadMore() {
    if (!this.loadMoreBtn || this.loading) return;
    if (this.refreshRequired) {
      window.location.reload();
      return;
    }

    const cursor = this.loadMoreBtn.getAttribute('data-cursor');
    if (!cursor) return;

    document.getElementById('feed-loader')?.classList.remove('hidden');
    this.container?.setAttribute('aria-busy', 'true');
    this.loadMoreBtn.textContent = 'Loading...';
    this.loadMoreBtn.disabled = true;
    this.loading = true;

    try {
      const params = new URLSearchParams();
      if (this.ownerFilter) params.append('owner', this.ownerFilter);
      if (this.filters.occasions) params.set('collection', 'occasions');
      if (this.filters.type) params.set('occasion', this.filters.type);
      if (this.filters.year) params.set('year', String(this.filters.year));
      params.append('cursor', cursor);

      const res = await fetch(`${WishlistFeedHandler.FRAGMENT_URL}?${params.toString()}`);
      await checkResponse(res);

      const html = await res.text();
      const nextCursor = res.headers.get('X-Next-Cursor');

      if (html.trim()) {
        this.container?.insertAdjacentHTML('beforeend', html);
      }
      if (nextCursor) {
        this.loadMoreBtn.setAttribute('data-cursor', nextCursor);
        this.loadMoreBtn.textContent = 'Load More';
      } else {
        this.hideButton();
      }
      this.updateEmptyState();
    } catch (e) {
      console.error(e);
      this.loadMoreBtn.textContent =
        e instanceof ApiError && e.status === 400 ? 'Refresh feed' : 'Retry';
      if (e instanceof ApiError && e.status === 400) {
        this.refreshRequired = true;
      }
    } finally {
      document.getElementById('feed-loader')?.classList.add('hidden');
      this.container?.removeAttribute('aria-busy');
      this.loading = false;
      this.loadMoreBtn.disabled = false;
    }
  }

  private hideButton() {
    if (this.loadMoreBtn) this.loadMoreBtn.style.display = 'none';
    this.loadMoreBtn?.removeAttribute('data-cursor');
    if (this.endMessage) this.endMessage.classList.remove('hidden');
  }

  private updateEmptyState() {
    const empty = document.getElementById('empty-message');
    const hasItems = Boolean(this.container?.querySelector('article'));
    const hasMore = Boolean(this.loadMoreBtn?.getAttribute('data-cursor'));
    empty?.classList.toggle('hidden', hasItems || hasMore);
    if (!hasItems && !hasMore) this.endMessage?.classList.add('hidden');
  }
}
