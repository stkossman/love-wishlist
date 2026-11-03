/** Enhance the existing grid without moving cards or changing their intrinsic heights. */
export function initWishlistMasonry(feed: HTMLElement) {
  if (typeof ResizeObserver === 'undefined') return;

  const cards = new Set<HTMLElement>();
  const dirty = new Set<HTMLElement>();
  let frame: number | undefined;

  const flush = () => {
    frame = undefined;
    if (document.documentElement.dataset.wishlistView === 'list' || cards.size === 0) {
      delete feed.dataset.masonry;
      for (const card of cards) card.style.removeProperty('grid-row-end');
      dirty.clear();
      return;
    }

    const activating = !feed.hasAttribute('data-masonry');
    feed.dataset.masonry = '';
    if (activating) for (const card of cards) dirty.add(card);
    const rowHeight = Number.parseFloat(getComputedStyle(feed).gridAutoRows);

    // Read every intrinsic height before writing spans. items-start prevents spans
    // from stretching cards, so these writes cannot create a ResizeObserver loop.
    const spans = Array.from(dirty, (card) => ({
      card,
      span: Math.max(1, Math.ceil(card.getBoundingClientRect().height / rowHeight)),
    }));
    dirty.clear();
    for (const { card, span } of spans) {
      const value = `span ${span}`;
      if (card.style.gridRowEnd !== value) card.style.gridRowEnd = value;
    }
  };

  const schedule = () => {
    if (frame === undefined) frame = requestAnimationFrame(flush);
  };

  // Includes image loads, font changes, responsive widths, and expanding copy.
  const sizes = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const card = entry.target as HTMLElement;
      if (cards.has(card)) dirty.add(card);
    }
    schedule();
  });

  const syncCards = () => {
    const current = new Set(feed.querySelectorAll<HTMLElement>(':scope > .wish-card'));
    for (const card of cards) {
      if (current.has(card)) continue;
      sizes.unobserve(card);
      cards.delete(card);
      dirty.delete(card);
      card.style.removeProperty('grid-row-end');
    }
    for (const card of current) {
      if (cards.has(card)) continue;
      cards.add(card);
      dirty.add(card);
      sizes.observe(card, { box: 'border-box' });
    }
  };

  const children = new MutationObserver(() => {
    syncCards();
    schedule();
  });
  children.observe(feed, { childList: true });

  const preference = new MutationObserver(() => schedule());
  preference.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-wishlist-view'],
  });

  syncCards();
  flush();

  return () => {
    if (frame !== undefined) cancelAnimationFrame(frame);
    sizes.disconnect();
    children.disconnect();
    preference.disconnect();
    delete feed.dataset.masonry;
    for (const card of cards) card.style.removeProperty('grid-row-end');
  };
}
