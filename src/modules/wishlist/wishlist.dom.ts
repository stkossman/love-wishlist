import { WishlistClient } from './wishlist.client';
import type { Owner } from './wishlist.types';

export class WishlistFormHandler {
  private form: HTMLFormElement;
  private submitBtn: HTMLButtonElement;
  private pinInput: HTMLInputElement | null;
  private overlay: HTMLElement | null;
  private errorMsg: HTMLElement | null;
  private secretPin: string;
  private mode: 'create' | 'update';

  constructor(formId: string, mode: 'create' | 'update') {
    this.form = document.getElementById(formId) as HTMLFormElement;
    this.submitBtn = document.getElementById('submit-btn') as HTMLButtonElement;
    this.pinInput = document.getElementById('pin-input') as HTMLInputElement;
    this.overlay = document.getElementById('security-overlay');
    this.errorMsg = document.getElementById('error-msg');

    this.secretPin = import.meta.env.PUBLIC_SECRET_PIN;
    this.mode = mode;

    if (this.form) {
      this.init();
    }
  }

  private init() {
    this.setupAuth();
    this.setupSpecs();
    this.setupSubmit();
  }

  private setupAuth() {
    if (!this.pinInput || !this.overlay) return;

    if (sessionStorage.getItem('auth_token') === 'valid') {
      sessionStorage.removeItem('auth_token');
    }

    this.pinInput.addEventListener('input', (e) => {
      const val = (e.target as HTMLInputElement).value;
      if (!this.secretPin) return;

      if (val.length === this.secretPin.length) {
        if (val === this.secretPin) {
          this.form.dataset.authPin = val;
          this.unlockForm();
        } else {
          this.showError();
          this.pinInput!.value = '';
        }
      }
    });
  }

  private unlockForm() {
    if (this.overlay) {
      this.overlay.style.opacity = '0';
      setTimeout(() => {
        this.overlay!.style.display = 'none';
        this.form.classList.remove('blur-sm', 'pointer-events-none');
      }, 500);
    }
  }

  private showError() {
    if (this.errorMsg) {
      this.errorMsg.style.opacity = '1';
      setTimeout(() => {
        this.errorMsg!.style.opacity = '0';
      }, 2000);
    }
  }

  private setupSpecs() {
    const specsContainer = document.getElementById('specs-container');
    const addSpecBtn = document.getElementById('add-spec-btn');

    if (!specsContainer || !addSpecBtn) return;

    addSpecBtn.addEventListener('click', () => {
      const row = document.createElement('div');
      row.className = 'grid grid-cols-[1fr_2fr_auto] gap-4 items-end spec-row animate-fade-in';
      row.innerHTML = `
        <input type="text" placeholder="LABEL" class="bg-transparent border-b border-neutral-300 py-1 text-xs font-mono uppercase text-[#1a1a1a] focus:border-[#1a1a1a] focus:outline-none placeholder:text-neutral-400" />
        <input type="text" placeholder="VALUE" class="bg-transparent border-b border-neutral-300 py-1 text-sm text-[#1a1a1a] focus:border-[#1a1a1a] focus:outline-none placeholder:text-neutral-400" />
        <button type="button" class="remove-spec text-neutral-400 hover:text-red-700 pb-1 text-xl leading-none transition-colors cursor-pointer">&times;</button>
      `;
      specsContainer.appendChild(row);
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

      const pin = this.form.dataset.authPin || '';

      if (!pin && this.pinInput) {
        alert('Auth required');
        return;
      }

      this.setLoading(true);

      const formData = new FormData(this.form);
      const specs: { label: string; value: string }[] = [];

      this.form.querySelectorAll('.spec-row').forEach((row) => {
        const inputs = row.querySelectorAll('input');
        const label = inputs[0].value.trim();
        const value = inputs[1].value.trim();
        if (label && value) specs.push({ label, value });
      });

      const payload = {
        owner: formData.get('owner') as Owner,
        topic: (formData.get('topic') as string).trim(),
        name: (formData.get('name') as string).trim(),
        price: (formData.get('price') as string).trim(),
        url: (formData.get('url') as string).trim(),
        specs: specs,
      };

      try {
        if (this.mode === 'create') {
          await WishlistClient.create(payload, pin);
        } else {
          const id = this.form.dataset.id;
          if (id) {
            await fetch(`/api/items/${id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', 'x-auth-pin': pin },
              body: JSON.stringify(payload),
            });
          }
        }

        window.location.href = payload.owner === 'me' ? '/andrii' : '/juliette';
      } catch (err) {
        console.error(err);
        alert('Error operation failed');
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
