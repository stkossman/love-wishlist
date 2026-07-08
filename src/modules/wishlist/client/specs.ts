import type { WishlistSpec } from '@/modules/wishlist/wishlist.types';

export function getSpecsFromForm(form: HTMLFormElement): WishlistSpec[] {
  const specs: WishlistSpec[] = [];

  form.querySelectorAll('.spec-row').forEach((row) => {
    const inputs = row.querySelectorAll('input');
    const label = inputs[0]?.value.trim();
    const value = inputs[1]?.value.trim();
    if (label && value) specs.push({ label, value });
  });

  return specs;
}

export function createEmptySpecRow() {
  const row = document.createElement('div');
  row.className = 'grid grid-cols-[1fr_2fr_auto] gap-4 items-end spec-row animate-fade-in';
  row.innerHTML = `
    <input type="text" placeholder="LABEL" class="bg-transparent border-b border-neutral-300 py-1 text-xs font-mono uppercase text-[#1a1a1a] focus:border-[#1a1a1a] focus:outline-none placeholder:text-neutral-400" />
    <input type="text" placeholder="VALUE" class="bg-transparent border-b border-neutral-300 py-1 text-sm text-[#1a1a1a] focus:border-[#1a1a1a] focus:outline-none placeholder:text-neutral-400" />
    <button type="button" class="remove-spec text-neutral-400 hover:text-red-700 pb-1 text-xl leading-none transition-colors cursor-pointer">&times;</button>
  `;

  return row;
}
