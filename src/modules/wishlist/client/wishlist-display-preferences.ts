export const DISPLAY_PREFERENCE_KEY = 'wishlist:view';
export type WishlistView = 'grid' | 'list';

export function initDisplayPreferences() {
  const controls = document.querySelectorAll<HTMLInputElement>('input[name="wishlist-view"]');
  const status = document.querySelector('[data-preference-status]');
  const sync = () => {
    const view = document.documentElement.dataset.wishlistView === 'list' ? 'list' : 'grid';
    controls.forEach((control) => {
      control.checked = control.value === view;
    });
  };
  sync();
  // A history restore can reuse the document painted before Settings changed.
  window.addEventListener('pageshow', () => {
    try {
      document.documentElement.dataset.wishlistView =
        localStorage.getItem(DISPLAY_PREFERENCE_KEY) === 'list' ? 'list' : 'grid';
      sync();
    } catch {
      // Keep the current view when browser storage is blocked.
    }
  });
  controls.forEach((control) =>
    control.addEventListener('change', () => {
      if (!control.checked || (control.value !== 'grid' && control.value !== 'list')) return;
      document.documentElement.dataset.wishlistView = control.value;
      try {
        localStorage.setItem(DISPLAY_PREFERENCE_KEY, control.value);
        if (status)
          status.textContent = `${control.value === 'grid' ? 'Grid' : 'List'} view saved.`;
      } catch {
        if (status)
          status.textContent =
            'View changed for this page. Browser storage is unavailable, so it could not be saved.';
      }
    })
  );
  window.addEventListener('storage', (event) => {
    if (event.key !== DISPLAY_PREFERENCE_KEY && event.key !== null) return;
    document.documentElement.dataset.wishlistView = event.newValue === 'list' ? 'list' : 'grid';
    sync();
  });
}
