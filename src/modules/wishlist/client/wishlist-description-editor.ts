import { renderDescription } from '../utils/description-renderer';
import { WISHLIST_DESCRIPTION_MAX_LENGTH } from '../utils/description';

export type FormattingAction = 'bold' | 'italic' | 'list' | 'link';
export function formatSelection(
  value: string,
  start: number,
  end: number,
  action: FormattingAction
) {
  if (action === 'list') {
    start = start === 0 ? 0 : value.lastIndexOf('\n', start - 1) + 1;
    const lineEnd = value.indexOf('\n', end);
    end = lineEnd === -1 ? value.length : lineEnd;
  }
  const selected = value.slice(start, end);
  const marker = action === 'bold' ? '**' : '*';
  const replacement =
    action === 'list'
      ? (selected || 'List item')
          .split('\n')
          .map((line) => `- ${line}`)
          .join('\n')
      : action === 'link'
        ? `[${selected || 'Link text'}](https://)`
        : `${marker}${selected || 'text'}${marker}`;
  const offset = action === 'list' ? 2 : action === 'link' ? 1 : marker.length;
  return {
    value: value.slice(0, start) + replacement + value.slice(end),
    start: start + offset,
    end:
      start +
      (action === 'link'
        ? replacement.indexOf(']')
        : action === 'list'
          ? replacement.length
          : replacement.length - marker.length),
  };
}

export function initDescriptionEditor(field: HTMLElement) {
  const textarea = field.querySelector<HTMLTextAreaElement>('textarea')!;
  const format = field.querySelector<HTMLInputElement>('[name="descriptionFormat"]')!;
  const preview = field.querySelector<HTMLElement>('[data-description-preview]')!;
  const counter = field.querySelector<HTMLElement>('[data-description-counter]')!;
  const error = field.querySelector<HTMLElement>('[data-description-error]')!;
  const toolbar = field.querySelector<HTMLElement>('[data-description-toolbar]')!;
  const modes = field.querySelectorAll<HTMLButtonElement>('[data-description-mode]');
  const reference = field.closest('form')?.querySelector<HTMLInputElement>('[name="url"]');
  let selection = { start: textarea.selectionStart, end: textarea.selectionEnd };
  const remember = () => {
    selection = { start: textarea.selectionStart, end: textarea.selectionEnd };
  };
  const update = () => {
    counter.textContent = `${textarea.value.length} / ${WISHLIST_DESCRIPTION_MAX_LENGTH}`;
    const invalid = textarea.value.length > WISHLIST_DESCRIPTION_MAX_LENGTH;
    textarea.setAttribute('aria-invalid', String(invalid));
    error.textContent = invalid ? 'Description is too long' : '';
    preview.innerHTML =
      renderDescription(textarea.value, format.checked ? 'markdown' : 'plain', reference?.value) ||
      '<p>No notes yet.</p>';
    toolbar.hidden = !format.checked || textarea.hidden;
  };
  textarea.addEventListener('input', () => {
    remember();
    update();
  });
  ['select', 'keyup', 'click', 'blur'].forEach((event) =>
    textarea.addEventListener(event, remember)
  );
  format.addEventListener('change', update);
  reference?.addEventListener('input', update);
  modes.forEach((button) =>
    button.addEventListener('click', () => {
      const writing = button.dataset.descriptionMode === 'write';
      textarea.hidden = !writing;
      preview.hidden = writing;
      modes.forEach((mode) => mode.setAttribute('aria-pressed', String(mode === button)));
      update();
      if (writing) {
        textarea.focus();
        textarea.setSelectionRange(selection.start, selection.end);
      }
    })
  );
  field.querySelectorAll<HTMLButtonElement>('[data-description-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const edit = formatSelection(
        textarea.value,
        selection.start,
        selection.end,
        button.dataset.descriptionAction as FormattingAction
      );
      if (edit.value.length > WISHLIST_DESCRIPTION_MAX_LENGTH) {
        error.textContent = 'Not enough space for formatting. Shorten the notes first.';
        textarea.focus();
        return;
      }
      textarea.setRangeText(edit.value, 0, textarea.value.length, 'select');
      textarea.focus();
      textarea.setSelectionRange(edit.start, edit.end);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  update();
}
