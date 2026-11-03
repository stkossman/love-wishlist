import { WISHLIST_IMAGE_MAX_SIZE_BYTES, WISHLIST_IMAGE_TYPES } from '../constants/image';
import type { WishlistImageFields, WishlistImageMetadata } from '../wishlist.types';

export function mapImageMetadata(image: WishlistImageMetadata): WishlistImageFields {
  return {
    imageUrl: image.secureUrl,
    imagePublicId: image.publicId,
    imageWidth: image.width,
    imageHeight: image.height,
    imageFormat: image.format,
    imageBytes: image.bytes,
  };
}

export function initImageField(root: HTMLElement) {
  const input = root.querySelector('input');
  const preview = root.querySelector('img');
  const placeholder = root.querySelector('[data-image-placeholder]');
  const clearButton = root.querySelector('button');
  const error = root.querySelector('[data-image-error]');
  if (
    !(input instanceof HTMLInputElement) ||
    !(preview instanceof HTMLImageElement) ||
    !(placeholder instanceof HTMLElement) ||
    !(clearButton instanceof HTMLButtonElement) ||
    !(error instanceof HTMLElement)
  )
    throw new Error('Image field is incomplete');

  const initialPublicId = root.dataset.initialImagePublicId ?? '';
  const hasInitialImage = Boolean(root.dataset.initialImageUrl || initialPublicId);
  let file: File | null = null;
  let removeExisting = false;
  let previewUrl: string | null = null;
  const releasePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  };
  const showPreview = () => {
    releasePreview();
    if (!file) return;
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    preview.classList.remove('hidden');
    placeholder.classList.add('hidden');
    clearButton.classList.remove('hidden');
  };
  const showError = (message = '') => {
    error.textContent = message;
    error.classList.toggle('opacity-0', !message);
    input.setAttribute('aria-invalid', String(Boolean(message)));
  };
  input.addEventListener('change', () => {
    const selected = input.files?.[0];
    if (!selected) return;
    if (
      !WISHLIST_IMAGE_TYPES.has(selected.type) ||
      selected.size <= 0 ||
      selected.size > WISHLIST_IMAGE_MAX_SIZE_BYTES
    ) {
      input.value = '';
      showError('Invalid image');
      return;
    }
    file = selected;
    removeExisting = false;
    showPreview();
    showError();
  });
  clearButton.addEventListener('click', () => {
    file = null;
    removeExisting = hasInitialImage;
    input.value = '';
    releasePreview();
    preview.removeAttribute('src');
    preview.classList.add('hidden');
    placeholder.classList.remove('hidden');
    clearButton.classList.add('hidden');
    showError();
    input.focus();
  });
  window.addEventListener('pagehide', releasePreview);
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && file) showPreview();
  });

  return {
    getSelection: () => ({ file, removeExisting, initialPublicId }),
    setDisabled(disabled: boolean) {
      input.disabled = disabled;
      clearButton.disabled = disabled;
    },
  };
}
