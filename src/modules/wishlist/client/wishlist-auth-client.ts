const SESSION_URL = '/api/auth/session';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

export async function checkResponse(response: Response) {
  if (response.ok) return;
  let message = 'Operation failed';
  try {
    const body: unknown = await response.json();
    if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string')
      message = body.error;
  } catch {
    /* A proxy may return a non-JSON error. */
  }
  throw new ApiError(response.status, message);
}

export async function hasMutationSession(): Promise<boolean> {
  const response = await fetch(SESSION_URL, { credentials: 'same-origin', cache: 'no-store' });
  await checkResponse(response);
  const body: unknown = await response.json();
  return Boolean(
    body && typeof body === 'object' && 'authenticated' in body && body.authenticated === true
  );
}

export async function login(pin: string) {
  const response = await fetch(SESSION_URL, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin }),
  });
  await checkResponse(response);
}

export async function requestMutationAccess(): Promise<boolean> {
  if (await hasMutationSession()) return true;
  const dialog = document.getElementById('mutation-access-dialog');
  if (!(dialog instanceof HTMLDialogElement)) throw new Error('Access dialog is unavailable');
  const input = dialog.querySelector('input');
  const error = dialog.querySelector('[data-access-error]');
  if (!input || !error) throw new Error('Access dialog is incomplete');

  return new Promise((resolve) => {
    let authenticated = false;
    const onInput = async () => {
      if (input.value.length !== 4 || input.disabled) return;
      input.disabled = true;
      try {
        await login(input.value);
        authenticated = true;
        dialog.close();
      } catch (failure) {
        error.textContent =
          failure instanceof ApiError ? failure.message : 'Unable to verify access';
        input.value = '';
      } finally {
        input.disabled = false;
        if (dialog.open) input.focus();
      }
    };
    dialog.addEventListener(
      'close',
      () => {
        input.removeEventListener('input', onInput);
        input.value = '';
        resolve(authenticated);
      },
      { once: true }
    );
    input.value = '';
    error.textContent = '';
    input.addEventListener('input', onInput);
    dialog.showModal();
    input.focus();
  });
}
