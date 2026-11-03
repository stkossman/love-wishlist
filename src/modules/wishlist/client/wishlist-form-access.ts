import { ApiError, hasMutationSession, login } from './wishlist-auth-client';

export function initFormAccess(root: HTMLElement, form: HTMLFormElement) {
  const overlay = root.querySelector('[data-form-access]');
  const content = root.querySelector('[data-form-content]');
  const input = overlay?.querySelector('input');
  const error = overlay?.querySelector('[aria-live]');
  if (
    !(overlay instanceof HTMLElement) ||
    !(content instanceof HTMLElement) ||
    !(input instanceof HTMLInputElement) ||
    !(error instanceof HTMLElement)
  )
    throw new Error('Form access view is incomplete');

  let authenticated = false;
  let version = 0;
  let unlockTimer: ReturnType<typeof setTimeout> | undefined;
  const showError = (message: string) => {
    error.textContent = message;
    error.style.opacity = '1';
  };
  const lock = (message?: string) => {
    clearTimeout(unlockTimer);
    authenticated = false;
    version++;
    form.inert = true;
    content.inert = true;
    form.classList.add('blur-sm', 'pointer-events-none');
    overlay.hidden = false;
    overlay.style.display = 'flex';
    overlay.inert = false;
    overlay.style.opacity = '1';
    if (message) showError(message);
    input.focus();
  };
  const unlock = () => {
    authenticated = true;
    version++;
    error.textContent = '';
    error.style.opacity = '0';
    overlay.style.opacity = '0';
    clearTimeout(unlockTimer);
    const delay = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 500;
    unlockTimer = setTimeout(() => {
      overlay.hidden = true;
      overlay.style.display = 'none';
      overlay.inert = true;
      content.inert = false;
      form.inert = false;
      form.classList.remove('blur-sm', 'pointer-events-none');
      const topic = form.querySelector('[name="topic"]');
      if (topic instanceof HTMLInputElement) topic.focus();
    }, delay);
  };
  overlay.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      event.preventDefault();
      input.focus();
    }
  });
  input.addEventListener('input', async () => {
    if (input.value.length !== 4 || input.disabled) return;
    input.disabled = true;
    try {
      await login(input.value);
      unlock();
    } catch (failure) {
      showError(failure instanceof ApiError ? failure.message : 'Unable to verify access');
    } finally {
      input.value = '';
      input.disabled = false;
      if (!authenticated) input.focus();
    }
  });
  lock();
  const initialVersion = version;
  const ready = hasMutationSession()
    .then((valid) => {
      if (valid && !authenticated && version === initialVersion) unlock();
    })
    .catch(() => {
      if (!authenticated && version === initialVersion) showError('Unable to verify access');
    });

  return { ready, isAuthenticated: () => authenticated, lock };
}
