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
                <div class="flex flex-col gap-1">
                    <span class="font-mono text-[9px] uppercase tracking-widest text-theme-text opacity-40">${s.label}</span>
                    <span class="font-mono text-xs text-theme-text">${s.value}</span>
                </div>
            `
        )
        .join('');

      specsHTML = `
            <div class="mt-2 flex flex-wrap gap-x-8 gap-y-4 opacity-70 transition-opacity lg:opacity-50 lg:group-hover:opacity-100">
                ${rows}
            </div>`;
    }

    const priceHTML = item.price
      ? `<p class="font-mono text-xs tracking-wide text-theme-text opacity-60 mt-1">${item.price}</p>`
      : '';

    const arrowIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="inline-block w-4 h-4 ml-0.5 mb-2 transition-transform duration-300 group-hover/link:-translate-y-0.5 group-hover/link:translate-x-0.5"><path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>`;

    const nameHTML = item.url
      ? `<a href="${item.url}" target="_blank" rel="noopener noreferrer" class="group/link hover:text-theme-accent transition-colors duration-300">
                ${item.name}
                ${arrowIcon}
               </a>`
      : item.name;

    return `
        <article class="group relative flex flex-col gap-6 py-8 transition-opacity duration-500 ease-out md:py-10 animate-fade-in">
            
            <div class="absolute top-0 left-0 w-full h-px bg-theme-border opacity-20 transition-opacity duration-300 group-hover:bg-theme-text group-hover:opacity-100"></div>

            <div class="absolute top-4 right-0 z-20">
                <button class="menu-btn text-theme-text hover:bg-theme-text hover:text-theme-bg active:bg-theme-text active:text-theme-bg flex h-8 w-8 cursor-pointer items-center justify-center rounded-full opacity-100 transition-opacity duration-300 lg:opacity-0 lg:group-hover:opacity-100">
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16"><path d="M3 9.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z"/></svg>
                </button>
                 <div class="menu-dropdown hidden absolute right-0 mt-2 w-32 bg-white border border-[#1a1a1a] shadow-xl py-1 z-30">
                    <a href="/edit/${item.id}" class="block w-full text-left px-4 py-3 md:py-2 text-sm md:text-xs font-mono uppercase tracking-widest text-[#1a1a1a] hover:bg-[#1a1a1a] hover:text-white transition-colors">Edit</a>
                    <button class="delete-btn block w-full text-left px-4 py-3 md:py-2 text-sm md:text-xs font-mono uppercase tracking-widest text-red-700 hover:bg-red-700 hover:text-white transition-colors cursor-pointer" data-id="${item.id}">Delete</button>
                </div>
            </div>

            <div class="flex items-center gap-3">
                <span class="flex h-5 w-5 items-center justify-center rounded-full border border-theme-text font-serif text-[10px] italic text-theme-text opacity-50">
                    ${ownerLabel}
                </span>
                <span class="font-mono text-[10px] uppercase tracking-[0.15em] text-theme-text opacity-40">
                    ${item.topic}
                </span>
            </div>

            <div class="flex flex-col gap-1">
                <h2 class="font-serif text-3xl font-light italic leading-tight text-theme-text md:text-4xl">
                    ${nameHTML}
                </h2>
                ${priceHTML}
            </div>

            ${specsHTML}
        </article>
        `;
  }
}
