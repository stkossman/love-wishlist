import { type MeasurementKey } from '@/data/sizes';
import {
  ApiError,
  checkResponse,
  requestMutationAccess,
} from '@/modules/wishlist/client/wishlist-auth-client';
import { isPerson, isMeasurementValue, type MeasurementUpdates } from './sizes.validation';

let pendingAccess: Promise<boolean> | undefined;
function requestAccess() {
  pendingAccess ??= requestMutationAccess().finally(() => {
    pendingAccess = undefined;
  });
  return pendingAccess;
}

export function initSizesEditor(root: HTMLElement) {
  const person = root.dataset.sizesPerson;
  if (!isPerson(person)) return;
  const form = root.querySelector<HTMLFormElement>('[data-sizes-form]')!;
  const edit = root.querySelector<HTMLButtonElement>('[data-sizes-edit]')!;
  const cancel = root.querySelector<HTMLButtonElement>('[data-sizes-cancel]')!;
  const controls = root.querySelector<HTMLElement>('[data-sizes-controls]')!;
  const status = root.querySelector<HTMLElement>('[data-sizes-status]')!;
  const fieldset = form.querySelector('fieldset')!;
  const inputs = [...form.querySelectorAll('input')];
  const values = [...form.querySelectorAll<HTMLElement>('[data-sizes-value]')];
  const save = form.querySelector<HTMLButtonElement>('[type="submit"]')!;
  let baseline = inputs.map((input) => input.value);
  let editing = false;
  let busy = false;

  function setEditing(value: boolean) {
    editing = value;
    edit.hidden = value;
    edit.setAttribute('aria-expanded', String(value));
    controls.hidden = !value;
    inputs.forEach((input, index) => {
      input.hidden = !value;
      input.disabled = !value;
      values[index].hidden = value;
    });
    if (value) inputs[0]?.focus();
    else edit.focus();
  }

  edit.addEventListener('click', async () => {
    if (busy) return;
    busy = true;
    edit.disabled = true;
    status.textContent = 'Checking access…';
    try {
      if (await requestAccess()) setEditing(true);
      status.textContent = '';
    } catch {
      status.textContent = 'Could not verify access. Try Edit again.';
    } finally {
      busy = false;
      edit.disabled = false;
    }
  });

  cancel.addEventListener('click', () => {
    if (busy) return;
    inputs.forEach((input, index) => {
      input.value = baseline[index];
    });
    status.textContent = '';
    setEditing(false);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!editing || busy) return;
    const updates: MeasurementUpdates = {};
    for (const [index, input] of inputs.entries()) {
      const value = input.value.trim();
      if (!isMeasurementValue(value)) {
        status.textContent = 'Use a positive number or ascending range up to 300, e.g. 17.5-18.';
        input.focus();
        return;
      }
      if (value !== baseline[index]) updates[input.name as MeasurementKey] = value;
    }
    if (!Object.keys(updates).length) {
      setEditing(false);
      status.textContent = 'No changes to save.';
      return;
    }
    busy = true;
    fieldset.disabled = true;
    save.disabled = true;
    cancel.disabled = true;
    save.textContent = 'Saving…';
    form.setAttribute('aria-busy', 'true');
    status.textContent = 'Saving measurements…';
    try {
      if (!(await requestAccess())) {
        status.textContent = 'Save cancelled. Your edits are still here.';
        return;
      }
      const response = await fetch(`/api/sizes/${person}`, {
        method: 'PATCH',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      await checkResponse(response);
      baseline = inputs.map(
        (input, index) => updates[input.name as MeasurementKey] ?? baseline[index]
      );
      inputs.forEach((input, index) => {
        input.value = baseline[index];
        values[index].textContent = baseline[index];
      });
      setEditing(false);
      status.textContent = 'Measurements saved.';
    } catch (error) {
      status.textContent =
        error instanceof ApiError && error.status === 401
          ? 'Your session expired. Save again to enter the access code. Your edits are still here.'
          : 'Could not save measurements. Your edits are still here. Try Save again.';
    } finally {
      busy = false;
      fieldset.disabled = false;
      save.disabled = false;
      cancel.disabled = false;
      save.textContent = 'Save';
      form.removeAttribute('aria-busy');
    }
  });
}
