/** Mobile browsers may defer :active until release; show the same pose during contact. */
export function initAddRitual(link: HTMLAnchorElement): void {
  const release = () => {
    delete link.dataset.pressed;
  };
  link.addEventListener(
    'pointerdown',
    (event) => {
      if (event.isPrimary && event.button === 0) link.dataset.pressed = 'true';
    },
    { passive: true }
  );
  link.addEventListener('pointerleave', release);
  link.addEventListener('pointercancel', release);
  link.addEventListener('blur', release);
  link.ownerDocument.addEventListener('pointerup', release, { passive: true });
  link.ownerDocument.addEventListener('pointercancel', release, { passive: true });
  link.ownerDocument.defaultView?.addEventListener('blur', release);
}
