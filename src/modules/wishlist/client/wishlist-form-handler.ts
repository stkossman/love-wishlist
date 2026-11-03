import { WishlistImageClient } from './wishlist-image-client';
import { WishlistClient } from './wishlist-api-client';
import { ApiError } from './wishlist-auth-client';
import { initFormAccess } from './wishlist-form-access';
import { initImageField, mapImageMetadata } from './wishlist-image-field';
import { getSpecsFromForm, initSpecsField } from './specs';
import { getOwnerPath, isOwner } from '../wishlist.utils';
import { getDescriptionValidationError, normalizeDescription } from '../utils/description';
import type { CreateItemDTO, UpdateItemDTO, WishlistSpec } from '../wishlist.types';

export function serializeWishlistForm(data: FormData, specs: WishlistSpec[]): CreateItemDTO {
  const text = (name: string) => {
    const value = data.get(name);
    return typeof value === 'string' ? value.trim() : '';
  };
  const owner = data.get('owner');
  if (!isOwner(owner)) throw new Error('Invalid owner');
  const description = normalizeDescription(data.get('description')) ?? '';
  const error = getDescriptionValidationError(description);
  if (error) throw new Error(error);
  return {
    owner,
    topic: text('topic'),
    name: text('name'),
    price: text('price'),
    url: text('url'),
    description,
    specs,
  };
}

async function cleanupImage(publicId: string): Promise<void> {
  try {
    await WishlistImageClient.delete(publicId);
  } catch (error) {
    console.error('Image cleanup failed:', error);
  }
}

const initialized = new WeakSet<HTMLElement>();

export function initWishlistForm(root: HTMLElement): void {
  if (initialized.has(root)) return;
  const form = root.querySelector('form');
  const submit = form?.querySelector('button[type="submit"]');
  const imageRoot = form?.querySelector('[data-image-field]');
  const specsRoot = form?.querySelector('[data-specs-field]');
  const mode = root.dataset.mode;
  if (
    !(form instanceof HTMLFormElement) ||
    !(submit instanceof HTMLButtonElement) ||
    !(imageRoot instanceof HTMLElement) ||
    !(specsRoot instanceof HTMLElement) ||
    (mode !== 'create' && mode !== 'update') ||
    (mode === 'update' && !form.dataset.id)
  ) {
    throw new Error('Wishlist form is incomplete');
  }
  initialized.add(root);
  const image = initImageField(imageRoot);
  initSpecsField(specsRoot);
  const access = initFormAccess(root, form);
  let submitting = false;
  let redirecting = false;
  const label = submit.textContent;
  const setLoading = (loading: boolean) => {
    submitting = loading;
    submit.disabled = loading;
    submit.textContent = loading ? 'Processing...' : label;
    submit.classList.toggle('opacity-70', loading);
    form.setAttribute('aria-busy', String(loading));
    image.setDisabled(loading);
  };
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submitting || redirecting) return;
    if (!access.isAuthenticated()) {
      access.lock('Enter Access Code');
      return;
    }
    setLoading(true);
    let uploadedPublicId = '';
    try {
      const payload = serializeWishlistForm(new FormData(form), getSpecsFromForm(form));
      const selection = image.getSelection();
      const imageFields = selection.file
        ? mapImageMetadata(await WishlistImageClient.upload(selection.file))
        : {};
      uploadedPublicId = imageFields.imagePublicId ?? '';
      if (mode === 'create') {
        await WishlistClient.create({ ...payload, ...imageFields });
      } else {
        const update: UpdateItemDTO = { ...payload, ...imageFields };
        if (!selection.file && selection.removeExisting) {
          Object.assign(update, {
            imageUrl: null,
            imagePublicId: null,
            imageWidth: null,
            imageHeight: null,
            imageFormat: null,
            imageBytes: null,
          });
        }
        const id = form.dataset.id;
        if (!id) throw new Error('Missing item ID');
        await WishlistClient.update(id, update);
        if (selection.initialPublicId && (selection.file || selection.removeExisting)) {
          void cleanupImage(selection.initialPublicId);
        }
      }
      redirecting = true;
      window.location.href = getOwnerPath(payload.owner);
    } catch (error) {
      if (uploadedPublicId) void cleanupImage(uploadedPublicId);
      if (error instanceof ApiError && error.status === 401) {
        access.lock('Session expired. Enter Access Code');
      } else {
        console.error('Wishlist form submission failed', error);
        alert(error instanceof Error ? error.message : 'Error operation failed');
      }
    } finally {
      if (!redirecting) setLoading(false);
    }
  });
}
