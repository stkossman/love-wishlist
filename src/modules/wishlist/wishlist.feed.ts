export class WishlistFeedHandler {
  private loadMoreBtn: HTMLButtonElement | null;
  private container: HTMLElement | null;
  private endMessage: HTMLElement | null;
  private ownerFilter: 'me' | 'her' | null;

  constructor(ownerFilter: 'me' | 'her' | null = null) {
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

    this.container?.addEventListener('click', (e) => this.handleContainerClick(e));

    document.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const isMenuBtn = target.closest('.menu-btn');
      const isDropdown = target.closest('.menu-dropdown');

      if (!isMenuBtn && !isDropdown) {
        document.querySelectorAll('.menu-dropdown').forEach((el) => el.classList.add('hidden'));
      }
    });
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

      const res = await fetch(`/api/items?${params.toString()}`);
      const data = await res.json();

      if (data.items && data.items.length > 0) {
        data.items.forEach((item: any) => {
          const html = this.createItemHTML(item);
          this.container?.insertAdjacentHTML('beforeend', html);
        });

        if (data.nextCursor) {
          this.loadMoreBtn.setAttribute('data-cursor', data.nextCursor);
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

  private async handleContainerClick(e: MouseEvent) {
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

    const deleteBtn = target.closest('.delete-btn') as HTMLButtonElement;
    if (deleteBtn) {
      e.stopPropagation();

      if (!confirm('Are you sure you want to delete this item?')) return;

      const id = deleteBtn.dataset.id;
      const card = deleteBtn.closest('article') as HTMLElement;

      if (card) {
        card.style.opacity = '0.3';
        card.style.pointerEvents = 'none';
      }

      try {
        const res = await fetch(`/api/items/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Delete failed');

        card?.remove();
      } catch (err) {
        alert('Error deleting item');
        if (card) {
          card.style.opacity = '1';
          card.style.pointerEvents = 'auto';
        }
      }
    }
  }

  private createItemHTML(item: any): string {
    const ownerLabel = item.owner === 'me' ? 'A' : 'J';

    let specsHTML = '';
    if (item.specs && item.specs.length > 0) {
      const rows = item.specs
        .map(
          (s: any) => `
                <div class="flex flex-col">
                    <span class="text-[9px] md:text-[10px] uppercase tracking-wider opacity-50">${s.label}</span>
                    <span class="text-xs font-mono border-b border-[var(--color-theme-border)] pb-1">${s.value}</span>
                </div>
            `
        )
        .join('');

      specsHTML = `
            <div class="mt-auto pt-3 grid grid-cols-2 gap-y-2 gap-x-4 opacity-80 lg:opacity-60 lg:group-hover:opacity-100 transition-opacity">
                ${rows}
            </div>`;
    }

    const priceHTML = item.price
      ? `<p class="font-sans text-sm font-medium opacity-80">${item.price}</p>`
      : '';

    const nameHTML = item.url
      ? `<a href="${item.url}" target="_blank" rel="noopener noreferrer" class="underline decoration-1 underline-offset-4 decoration-[var(--color-theme-border)] hover:decoration-[var(--color-theme-accent)] transition-all">${item.name}</a>`
      : item.name;

    return `
        <article class="group relative flex flex-col gap-3 py-5 md:py-6 border-t border-[var(--color-theme-border)] hover:border-[var(--color-theme-text)] transition-colors duration-500 ease-out animate-fade-in">
            
            <div class="absolute top-3 right-0 z-20">
                <button class="menu-btn opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity duration-300 text-[var(--color-theme-text)] hover:bg-[var(--color-theme-text)] hover:text-[var(--color-theme-bg)] rounded-full w-8 h-8 flex items-center justify-center cursor-pointer">
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
                </button>
                 <div class="menu-dropdown hidden absolute right-0 mt-2 w-32 bg-white border border-[#1a1a1a] shadow-xl py-1 z-30">
                    <a href="/edit/${item.id}" class="block w-full text-left px-4 py-3 md:py-2 text-sm md:text-xs font-mono uppercase tracking-widest text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-colors">Edit</a>
                    <button class="delete-btn block w-full text-left px-4 py-3 md:py-2 text-sm md:text-xs font-mono uppercase tracking-widest text-red-700 hover:bg-red-700 hover:text-white transition-colors cursor-pointer" data-id="${item.id}">Delete</button>
                </div>
            </div>

            <div class="flex justify-between items-start text-[10px] md:text-xs font-sans tracking-widest opacity-60 uppercase pr-10">
                <div class="flex gap-2 items-center text-[var(--color-theme-text)]">
                    <span class="w-5 h-5 flex items-center justify-center border border-[var(--color-theme-text)] text-[10px] rounded-full opacity-60 font-serif italic">${ownerLabel}</span>
                    <span>${item.topic}</span>
                </div>
            </div>

            <div class="space-y-1">
                <h2 class="text-2xl md:text-3xl font-serif italic font-light leading-none text-[var(--color-theme-text)]">
                    ${nameHTML}
                </h2>
                ${priceHTML}
            </div>

            ${specsHTML}
        </article>
        `;
  }
}
