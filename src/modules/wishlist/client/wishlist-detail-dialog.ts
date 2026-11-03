/** Enhance real detail links; direct visits and modified clicks remain ordinary navigation. */
export function initWishlistDetailDialog() {
  const dialog = document.getElementById('wishlist-detail-dialog');
  if (!(dialog instanceof HTMLDialogElement)) return;
  const content = dialog.querySelector<HTMLElement>('[data-detail-content]')!;
  const loading = dialog.querySelector<HTMLTemplateElement>('[data-detail-loading]')!;
  const closeButton = dialog.querySelector<HTMLButtonElement>('[data-detail-close]')!;
  const toolbar = dialog.querySelector<HTMLElement>('[data-detail-toolbar]')!;
  const owner = dialog.querySelector<HTMLElement>('[data-detail-owner]')!;
  let request: AbortController | undefined;
  let trigger: HTMLElement | null = null;
  let itemId: string | undefined;
  let previousOverflow = '';
  let previousTitle = '';

  const close = () => {
    request?.abort();
    if (!dialog.open) return;
    dialog.close();
    document.body.style.overflow = previousOverflow;
    document.title = previousTitle;
    content.replaceChildren();
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    else document.getElementById('main-content')?.focus({ preventScroll: true });
  };
  const dismiss = () => {
    close();
    if (history.state?.wishlistDetail) history.back();
  };
  const open = async (url: string) => {
    request?.abort();
    const controller = new AbortController();
    request = controller;
    toolbar.replaceChildren();
    owner.textContent = 'Wish details';
    itemId = undefined;
    dialog.removeAttribute('aria-labelledby');
    content.replaceChildren(loading.content.cloneNode(true));
    content.setAttribute('aria-busy', 'true');
    if (!dialog.open) {
      previousOverflow = document.body.style.overflow;
      previousTitle = document.title;
      dialog.showModal();
      document.body.style.overflow = 'hidden';
    }
    closeButton.focus({ preventScroll: true });
    dialog.scrollTop = 0;
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('Unable to load wish');
      const page = new DOMParser().parseFromString(await response.text(), 'text/html');
      if (controller.signal.aborted) return;
      const detail = page.querySelector<HTMLElement>('[data-item-detail]');
      if (!detail) throw new Error('Wish details unavailable');
      detail.querySelectorAll('[data-standalone-only]').forEach((element) => element.remove());
      detail
        .querySelectorAll('[data-redirect-to]')
        .forEach((element) => element.removeAttribute('data-redirect-to'));
      itemId = detail.dataset.itemDetail;
      // Card actions remain in the collection behind the dialog: keep IDs unique.
      detail.querySelectorAll('[id], [aria-controls]').forEach((element) => {
        if (element.id) element.id = `detail-${element.id}`;
        const controls = element.getAttribute('aria-controls');
        if (controls) element.setAttribute('aria-controls', `detail-${controls}`);
      });
      const actions = detail.querySelector('[data-detail-actions]');
      if (actions) toolbar.replaceChildren(actions);
      owner.textContent = detail.dataset.detailOwnerName ?? 'Wish details';
      detail.querySelector('[data-detail-header]')?.remove();
      const heading = detail.querySelector('h1');
      if (heading) {
        heading.id = 'wishlist-detail-title';
        dialog.setAttribute('aria-labelledby', heading.id);
      }
      document.title = page.title;
      content.replaceChildren(detail);
    } catch {
      if (controller.signal.aborted) return;
      const message = document.createElement('p');
      message.textContent = 'This wish could not be loaded. ';
      const link = document.createElement('a');
      link.href = url;
      link.textContent = 'Open detail page';
      link.className = 'underline underline-offset-4';
      message.append(link);
      content.replaceChildren(message);
    } finally {
      if (!controller.signal.aborted) content.removeAttribute('aria-busy');
    }
  };
  document.addEventListener('click', (event) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;
    if (!(event.target instanceof Element)) return;
    const link =
      event.target.closest<HTMLAnchorElement>('a[data-wish-detail]') ??
      (!event.target.closest('a, button, input, select, textarea')
        ? event.target
            .closest('[data-wishlist-item-id]')
            ?.querySelector<HTMLAnchorElement>('a[data-wish-detail]')
        : null);
    if (!link || link.target || dialog.open) return;
    event.preventDefault();
    trigger = link;
    history.pushState({ ...history.state, wishlistDetail: link.href }, '', link.href);
    void open(link.href);
  });
  closeButton.addEventListener('click', dismiss);
  dialog.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'a[href], button, input, select, textarea, [tabindex="0"]'
      )
    ).filter((element) => !element.matches(':disabled') && element.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    // Escape dismisses an open action menu before dismissing its parent dialog.
    if (!dialog.querySelector('.menu-btn[aria-expanded="true"]')) dismiss();
  });
  let backdropPointer = false;
  const outside = (event: PointerEvent | MouseEvent) => {
    const bounds = dialog.getBoundingClientRect();
    return (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    );
  };
  dialog.addEventListener('pointerdown', (event) => {
    backdropPointer = outside(event);
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && backdropPointer && outside(event)) dismiss();
  });
  window.addEventListener('popstate', () => {
    if (history.state?.wishlistDetail) void open(history.state.wishlistDetail);
    else close();
  });
  document.addEventListener('wishlist:detail-deleted', (event) => {
    if (!(event instanceof CustomEvent) || typeof event.detail?.id !== 'string') return;
    const deletedId = event.detail.id;
    const card = Array.from(document.querySelectorAll<HTMLElement>('[data-wishlist-item-id]')).find(
      (element) => element.dataset.wishlistItemId === deletedId
    );
    const feed = card?.closest('#feed-container');
    card?.remove();
    feed?.dispatchEvent(new Event('wishlist:item-deleted'));
    if (dialog.open && itemId === deletedId) dismiss();
  });
}
