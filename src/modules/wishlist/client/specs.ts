import type { WishlistSpec } from '../wishlist.types';

export function getSpecsFromForm(form: HTMLFormElement): WishlistSpec[] {
  return Array.from(form.querySelectorAll('.spec-row')).flatMap((row) => {
    const labelInput = row.querySelector('[data-spec-label]');
    const valueInput = row.querySelector('[data-spec-value]');
    if (!(labelInput instanceof HTMLInputElement) || !(valueInput instanceof HTMLInputElement))
      return [];
    const label = labelInput.value.trim();
    const value = valueInput.value.trim();
    return label && value ? [{ label, value }] : [];
  });
}

export function initSpecsField(root: HTMLElement): void {
  const container = root.querySelector('[data-specs-container]');
  const addButton = root.querySelector('[data-add-spec]');
  const template = root.querySelector('template');
  if (
    !(container instanceof HTMLElement) ||
    !(addButton instanceof HTMLButtonElement) ||
    !(template instanceof HTMLTemplateElement)
  )
    throw new Error('Specifications field is incomplete');

  addButton.addEventListener('click', () => {
    const fragment = template.content.cloneNode(true);
    if (!(fragment instanceof DocumentFragment)) return;
    const input = fragment.querySelector('input');
    container.append(fragment);
    input?.focus();
  });
  container.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const button = event.target.closest('.remove-spec');
    if (!(button instanceof HTMLButtonElement)) return;
    const row = button.closest('.spec-row');
    const next = row?.nextElementSibling ?? row?.previousElementSibling;
    row?.remove();
    const input = next?.querySelector('input');
    (input ?? addButton).focus();
  });
}
