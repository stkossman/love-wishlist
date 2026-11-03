import type { OccasionFilters, OwnerFilter } from '@/modules/wishlist/wishlist.types';
import { ApiError, checkResponse } from './wishlist-auth-client';
import { initWishlistMasonry } from './wishlist-masonry';

export class WishlistFeedHandler {
  private static readonly FRAGMENT_URL = '/api/items/fragment';

  private loadMoreBtn: HTMLButtonElement | null;
  private container: HTMLElement | null;
  private endMessage: HTMLElement | null;
  private ownerFilter: OwnerFilter;
  private loading = false;
  private refreshRequired = false;
  private observer?: IntersectionObserver;
  private intersecting = false;
  private failed = false;
  private suspended = false;
  private request?: AbortController;
  private sentinel: HTMLElement | null;
  private status: HTMLElement | null;

  constructor(
    ownerFilter: OwnerFilter = null,
    private filters: OccasionFilters = {}
  ) {
    this.loadMoreBtn = document.getElementById('load-more-btn') as HTMLButtonElement;
    this.container = document.getElementById('feed-container');
    this.endMessage = document.getElementById('end-message');
    this.sentinel = document.getElementById('feed-sentinel');
    this.status = document.getElementById('feed-status');
    this.ownerFilter = ownerFilter;

    this.container?.addEventListener('wishlist:item-deleted', () => this.updateEmptyState());
    if (this.container) {
      initWishlistMasonry(this.container);
      this.init();
    }
  }

  private init() {
    this.loadMoreBtn?.addEventListener('click', () => this.loadMore());
    this.loadMoreBtn?.addEventListener('focusout', () => this.updateButton());
    if (this.sentinel && typeof IntersectionObserver !== 'undefined') {
      this.observer = new IntersectionObserver(
        (entries) => {
          if (this.suspended || this.failed) return;
          for (const entry of entries) {
            if (entry.isIntersecting === this.intersecting) continue;
            this.intersecting = entry.isIntersecting;
            if (this.intersecting) void this.loadMore();
          }
          this.updateButton();
        },
        { rootMargin: '0px 0px 600px 0px' }
      );
      this.observe();
      this.updateButton();
    }
    window.addEventListener('pagehide', () => {
      this.suspended = true;
      this.observer?.disconnect();
      this.request?.abort();
    });
    window.addEventListener('pageshow', () => {
      this.suspended = false;
      this.observe();
    });
    this.updateEmptyState();
  }

  private observe() {
    if (
      !this.suspended &&
      !this.failed &&
      this.loadMoreBtn?.getAttribute('data-cursor') &&
      this.sentinel
    ) {
      this.observer?.observe(this.sentinel);
    }
  }

  private updateButton() {
    if (this.loading) return;
    // Keep observing across successful appends: only a fresh entrance can load
    // automatically. Short pages that leave the sentinel visible offer a button.
    this.loadMoreBtn?.classList.toggle(
      'hidden',
      Boolean(this.observer) &&
        !this.failed &&
        !this.intersecting &&
        document.activeElement !== this.loadMoreBtn
    );
  }

  private announce(message: string) {
    if (this.status) {
      this.status.textContent = message;
      this.status.classList.toggle('sr-only', !this.failed);
    }
  }

  private async loadMore() {
    if (!this.loadMoreBtn || this.loading || this.suspended) return;
    if (this.refreshRequired) {
      window.location.reload();
      return;
    }

    const cursor = this.loadMoreBtn.getAttribute('data-cursor');
    if (!cursor) return;

    const restoreFocus = document.activeElement === this.loadMoreBtn;
    this.loading = true;
    document.getElementById('feed-loader')?.classList.remove('hidden');
    this.container?.setAttribute('aria-busy', 'true');
    this.loadMoreBtn.textContent = 'Loading...';
    this.loadMoreBtn.disabled = true;
    const controller = new AbortController();
    this.request = controller;
    this.announce('Loading more wishes…');

    try {
      const params = new URLSearchParams();
      if (this.ownerFilter) params.append('owner', this.ownerFilter);
      if (this.filters.occasions) params.set('collection', 'occasions');
      if (this.filters.type) params.set('occasion', this.filters.type);
      if (this.filters.year) params.set('year', String(this.filters.year));
      params.append('cursor', cursor);

      const res = await fetch(`${WishlistFeedHandler.FRAGMENT_URL}?${params.toString()}`, {
        signal: controller.signal,
      });
      await checkResponse(res);

      const html = await res.text();
      const nextCursor = res.headers.get('X-Next-Cursor');
      if (controller.signal.aborted) return;
      // A non-advancing cursor would append the same page on the next request.
      if (nextCursor === cursor) throw new Error('Pagination cursor did not advance');

      if (html.trim()) {
        this.container?.insertAdjacentHTML('beforeend', html);
      }
      this.failed = false;
      this.announce(nextCursor ? 'More wishes loaded.' : 'All wishes loaded.');
      if (nextCursor) {
        this.loadMoreBtn.setAttribute('data-cursor', nextCursor);
        this.loadMoreBtn.textContent = 'Load More';
      } else {
        this.hideButton();
      }
      this.updateEmptyState();
      this.observe();
    } catch (e) {
      if (controller.signal.aborted) return;
      console.error(e);
      this.failed = true;
      this.observer?.disconnect();
      this.loadMoreBtn.textContent = 'Retry';
      if (e instanceof ApiError && e.status === 400) {
        this.refreshRequired = true;
      }
      this.announce(
        this.refreshRequired
          ? 'This feed has changed. Retry to refresh it.'
          : 'More wishes could not be loaded. Please retry.'
      );
    } finally {
      document.getElementById('feed-loader')?.classList.add('hidden');
      this.container?.removeAttribute('aria-busy');
      this.loading = false;
      this.loadMoreBtn.disabled = false;
      if (controller.signal.aborted) {
        this.loadMoreBtn.textContent = this.failed ? 'Retry' : 'Load More';
        this.announce('');
      }
      this.request = undefined;
      if (restoreFocus && !this.suspended && document.activeElement === document.body) {
        const target = this.loadMoreBtn.hasAttribute('data-cursor')
          ? this.loadMoreBtn
          : this.endMessage;
        target?.focus({ preventScroll: true });
      }
      this.updateButton();
    }
  }

  private hideButton() {
    this.observer?.disconnect();
    if (this.loadMoreBtn) this.loadMoreBtn.style.display = 'none';
    this.loadMoreBtn?.removeAttribute('data-cursor');
    if (this.endMessage) this.endMessage.classList.remove('hidden');
    if (document.activeElement === this.loadMoreBtn)
      this.endMessage?.focus({ preventScroll: true });
  }

  private updateEmptyState() {
    const empty = document.getElementById('empty-message');
    const hasItems = Boolean(this.container?.querySelector('article'));
    const hasMore = Boolean(this.loadMoreBtn?.getAttribute('data-cursor'));
    empty?.classList.toggle('hidden', hasItems || hasMore);
    if (!hasItems && !hasMore) this.endMessage?.classList.add('hidden');
  }
}
