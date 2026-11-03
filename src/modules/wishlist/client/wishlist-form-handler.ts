import { WishlistImageClient } from './wishlist-image-client';
import { WishlistClient } from './wishlist-api-client';
import { ApiError, hasMutationSession, login } from './wishlist-auth-client';
import {
  WISHLIST_IMAGE_MAX_SIZE_BYTES,
  WISHLIST_IMAGE_TYPES,
} from '@/modules/wishlist/constants/image';
import type {
  CreateItemDTO,
  UpdateItemDTO,
  WishlistImageMetadata,
} from '@/modules/wishlist/wishlist.types';
import {
  getDescriptionValidationError,
  normalizeDescription,
} from '@/modules/wishlist/utils/description';
import { createEmptySpecRow, getSpecsFromForm } from './specs';
import { getOwnerPath, isOwner } from '@/modules/wishlist/wishlist.utils';

export class WishlistFormHandler {
  private form: HTMLFormElement;
  private submitBtn: HTMLButtonElement;
  private pinInput: HTMLInputElement | null;
  private overlay: HTMLElement | null;
  private errorMsg: HTMLElement | null;
  private imageField: HTMLElement | null;
  private imageInput: HTMLInputElement | null;
  private imagePreview: HTMLImageElement | null;
  private imagePlaceholder: HTMLElement | null;
  private clearImageBtn: HTMLButtonElement | null;
  private imageError: HTMLElement | null;
  private selectedImageFile: File | null = null;
  private previewObjectUrl: string | null = null;
  private shouldRemoveExistingImage = false;
  private authenticated = false;
  private mode: 'create' | 'update';

  constructor(formId: string, mode: 'create' | 'update') {
    this.form = document.getElementById(formId) as HTMLFormElement;
    this.submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
    this.pinInput = document.getElementById('pin-input') as HTMLInputElement;
    this.overlay = document.getElementById('security-overlay');
    this.errorMsg = document.getElementById('error-msg');
    this.imageField = document.getElementById('image-upload-field');
    this.imageInput = document.getElementById('image-input') as HTMLInputElement;
    this.imagePreview = document.getElementById('image-preview') as HTMLImageElement;
    this.imagePlaceholder = document.getElementById('image-placeholder');
    this.clearImageBtn = document.getElementById('clear-image-btn') as HTMLButtonElement;
    this.imageError = document.getElementById('image-error');

    this.mode = mode;

    if (this.form) {
      this.init();
    }
  }

  private init() {
    this.setupAuth();
    this.setupImageInput();
    this.setupSpecs();
    this.setupSubmit();
  }

  private async setupAuth() {
    if (!this.pinInput || !this.overlay) return;
    this.form.inert = true;
    this.pinInput.addEventListener('input', async () => {
      const input = this.pinInput;
      if (!input || input.value.length !== 4 || input.disabled) return;
      input.disabled = true;
      try {
        await login(input.value);
        this.unlockForm();
      } catch (error) {
        this.showError(error instanceof ApiError ? error.message : 'Unable to verify access');
      } finally {
        input.value = '';
        input.disabled = false;
        if (!this.authenticated) input.focus();
      }
    });
    try {
      if (await hasMutationSession()) this.unlockForm();
    } catch {
      this.showError('Unable to verify access');
    }
  }

  private unlockForm() {
    this.authenticated = true;
    if (this.overlay) {
      this.overlay.style.opacity = '0';
      setTimeout(() => {
        this.overlay!.style.display = 'none';
        this.form.classList.remove('blur-sm', 'pointer-events-none');
        this.form.inert = false;
      }, 500);
    }
  }

  private showError(message = 'INVALID CREDENTIALS') {
    if (this.errorMsg) {
      this.errorMsg.textContent = message;
      this.errorMsg.style.opacity = '1';
      setTimeout(() => {
        this.errorMsg!.style.opacity = '0';
      }, 2000);
    }
  }

  private setupImageInput() {
    if (!this.imageInput) return;

    this.imageInput.addEventListener('change', () => {
      const file = this.imageInput?.files?.[0];
      if (!file) return;

      if (!this.isValidImage(file)) {
        this.showImageError('Invalid image');
        if (this.imageInput) this.imageInput.value = '';
        return;
      }

      this.selectedImageFile = file;
      this.shouldRemoveExistingImage = false;
      this.showImagePreview(URL.createObjectURL(file));
      this.hideImageError();
    });

    this.clearImageBtn?.addEventListener('click', () => {
      this.selectedImageFile = null;
      this.shouldRemoveExistingImage = Boolean(this.getInitialImagePublicId());
      if (this.imageInput) this.imageInput.value = '';
      this.clearImagePreview();
      this.hideImageError();
    });
  }

  private isValidImage(file: File) {
    return WISHLIST_IMAGE_TYPES.has(file.type) && file.size <= WISHLIST_IMAGE_MAX_SIZE_BYTES;
  }

  private showImagePreview(src: string) {
    if (this.previewObjectUrl) URL.revokeObjectURL(this.previewObjectUrl);
    this.previewObjectUrl = src.startsWith('blob:') ? src : null;

    if (this.imagePreview) {
      this.imagePreview.src = src;
      this.imagePreview.classList.remove('hidden');
    }

    this.imagePlaceholder?.classList.add('hidden');
    this.clearImageBtn?.classList.remove('hidden');
  }

  private clearImagePreview() {
    if (this.previewObjectUrl) {
      URL.revokeObjectURL(this.previewObjectUrl);
      this.previewObjectUrl = null;
    }

    if (this.imagePreview) {
      this.imagePreview.removeAttribute('src');
      this.imagePreview.classList.add('hidden');
    }

    this.imagePlaceholder?.classList.remove('hidden');
    this.clearImageBtn?.classList.add('hidden');
  }

  private showImageError(message: string) {
    if (!this.imageError) return;
    this.imageError.textContent = message;
    this.imageError.style.opacity = '1';
  }

  private hideImageError() {
    if (this.imageError) this.imageError.style.opacity = '0';
  }

  private getInitialImagePublicId() {
    return this.imageField?.dataset.initialImagePublicId || '';
  }

  private mapImageMetadata(metadata: WishlistImageMetadata) {
    return {
      imageUrl: metadata.secureUrl,
      imagePublicId: metadata.publicId,
      imageWidth: metadata.width,
      imageHeight: metadata.height,
      imageFormat: metadata.format,
      imageBytes: metadata.bytes,
    };
  }

  private getRemovedImageFields() {
    return {
      imageUrl: null,
      imagePublicId: null,
      imageWidth: null,
      imageHeight: null,
      imageFormat: null,
      imageBytes: null,
    };
  }

  private async deleteImageAfterSave(publicId: string) {
    try {
      await WishlistImageClient.delete(publicId);
    } catch (error) {
      console.error('Image cleanup failed:', error);
    }
  }

  private setupSpecs() {
    const specsContainer = document.getElementById('specs-container');
    const addSpecBtn = document.getElementById('add-spec-btn');

    if (!specsContainer || !addSpecBtn) return;

    addSpecBtn.addEventListener('click', () => {
      specsContainer.appendChild(createEmptySpecRow());
    });

    specsContainer.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('remove-spec')) {
        target.closest('.spec-row')?.remove();
      }
    });
  }

  private setupSubmit() {
    this.form.addEventListener('submit', async (e) => {
      e.preventDefault();

      if (!this.authenticated) {
        alert('Auth required');
        return;
      }

      this.setLoading(true);

      const formData = new FormData(this.form);
      const ownerValue = formData.get('owner');
      const owner = isOwner(ownerValue) ? ownerValue : 'me';
      const description = normalizeDescription(formData.get('description')) ?? '';
      const descriptionError = getDescriptionValidationError(description);
      const specs = getSpecsFromForm(this.form);

      if (descriptionError) {
        alert(descriptionError);
        this.setLoading(false);
        return;
      }

      const payload: CreateItemDTO = {
        owner,
        topic: (formData.get('topic') as string).trim(),
        name: (formData.get('name') as string).trim(),
        price: (formData.get('price') as string).trim(),
        url: (formData.get('url') as string).trim(),
        description,
        specs: specs,
      };

      let uploadedPublicId = '';

      try {
        if (this.mode === 'create') {
          if (this.selectedImageFile) {
            const image = await WishlistImageClient.upload(this.selectedImageFile);
            uploadedPublicId = image.publicId;
            Object.assign(payload, this.mapImageMetadata(image));
          }

          await WishlistClient.create(payload);
        } else {
          const id = this.form.dataset.id;
          if (id) {
            const oldPublicId = this.getInitialImagePublicId();
            const updatePayload: UpdateItemDTO = { ...payload };

            if (this.selectedImageFile) {
              const image = await WishlistImageClient.upload(this.selectedImageFile);
              uploadedPublicId = image.publicId;
              Object.assign(updatePayload, this.mapImageMetadata(image));
            } else if (this.shouldRemoveExistingImage) {
              Object.assign(updatePayload, this.getRemovedImageFields());
            }

            await WishlistClient.update(id, updatePayload);

            if (oldPublicId && (this.selectedImageFile || this.shouldRemoveExistingImage)) {
              void this.deleteImageAfterSave(oldPublicId);
            }
          }
        }

        window.location.href = getOwnerPath(payload.owner);
      } catch (err) {
        console.error(err);
        if (uploadedPublicId) {
          void this.deleteImageAfterSave(uploadedPublicId);
        }
        if (err instanceof ApiError && err.status === 401) {
          this.authenticated = false;
          this.form.inert = true;
          this.form.classList.add('blur-sm', 'pointer-events-none');
          if (this.overlay) {
            this.overlay.style.display = 'flex';
            this.overlay.style.opacity = '1';
          }
          this.pinInput?.focus();
          this.showError('Session expired. Enter Access Code');
        } else {
          alert(err instanceof ApiError ? err.message : 'Error operation failed');
        }
        this.setLoading(false);
      }
    });
  }

  private setLoading(isLoading: boolean) {
    if (!this.submitBtn) return;
    this.submitBtn.disabled = isLoading;
    this.submitBtn.textContent = isLoading
      ? 'Processing...'
      : this.mode === 'create'
        ? 'Confirm Entry'
        : 'Update Entry';
    if (isLoading) this.submitBtn.classList.add('opacity-70');
    else this.submitBtn.classList.remove('opacity-70');
  }
}
