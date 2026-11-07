import { expect, test } from 'bun:test';
import { initDescriptionEditor } from '../src/modules/wishlist/client/wishlist-description-editor';
import { renderDescription } from '../src/modules/wishlist/utils/description-renderer';

class EditorControl extends EventTarget {
  value = '';
  textContent = '';
  innerHTML = '';
  hidden = false;
  checked = true;
  focused = false;
  selectionStart = 0;
  selectionEnd = 0;
  dataset: Record<string, string> = {};
  attributes = new Map<string, string>();
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  focus() {
    this.focused = true;
  }
  setSelectionRange(start: number, end: number) {
    this.selectionStart = start;
    this.selectionEnd = end;
  }
  setRangeText(value: string, start: number, end: number) {
    this.value = this.value.slice(0, start) + value + this.value.slice(end);
  }
}
function fixture() {
  const textarea = new EditorControl();
  const format = new EditorControl();
  const preview = new EditorControl();
  const counter = new EditorControl();
  const error = new EditorControl();
  const toolbar = new EditorControl();
  const reference = new EditorControl();
  const modes = ['write', 'preview'].map((mode) =>
    Object.assign(new EditorControl(), { dataset: { descriptionMode: mode } })
  );
  const actions = ['bold', 'italic', 'list', 'link'].map((action) =>
    Object.assign(new EditorControl(), { dataset: { descriptionAction: action } })
  );
  const controls = new Map([
    ['textarea', textarea],
    ['[name="descriptionFormat"]', format],
    ['[data-description-preview]', preview],
    ['[data-description-counter]', counter],
    ['[data-description-error]', error],
    ['[data-description-toolbar]', toolbar],
  ]);
  const field = {
    querySelector: (selector: string) => controls.get(selector),
    querySelectorAll: (selector: string) =>
      selector === '[data-description-mode]' ? modes : actions,
    closest: () => ({ querySelector: () => reference }),
  };
  initDescriptionEditor(field as unknown as HTMLElement);
  return { textarea, format, preview, counter, error, toolbar, reference, modes, actions };
}
test('editor preserves selection across preview, formats it, and matches the detail renderer', () => {
  const f = fixture();
  f.textarea.value = 'A chosen note';
  f.textarea.setSelectionRange(2, 8);
  f.textarea.dispatchEvent(new Event('input'));
  f.actions[0].dispatchEvent(new Event('click'));
  expect(f.textarea.value).toBe('A **chosen** note');
  expect([f.textarea.selectionStart, f.textarea.selectionEnd]).toEqual([4, 10]);
  f.modes[1].dispatchEvent(new Event('click'));
  expect(f.textarea.hidden).toBe(true);
  expect(f.preview.hidden).toBe(false);
  expect(f.preview.innerHTML).toBe(renderDescription(f.textarea.value, 'markdown'));
  expect(f.preview.innerHTML).toContain('<strong>chosen</strong>');
  expect(f.modes[1].attributes.get('aria-pressed')).toBe('true');
  f.modes[0].dispatchEvent(new Event('click'));
  expect(f.textarea.hidden).toBe(false);
  expect(f.textarea.focused).toBe(true);
  expect([f.textarea.selectionStart, f.textarea.selectionEnd]).toEqual([4, 10]);
});
test('editor keeps plain text literal, updates references and counters, and rejects over-limit formatting', () => {
  const f = fixture();
  f.textarea.value = '*literal*';
  f.format.checked = false;
  f.format.dispatchEvent(new Event('change'));
  expect(f.preview.innerHTML).toContain('*literal*');
  expect(f.toolbar.hidden).toBe(true);
  f.reference.value = 'https://example.test/product';
  f.reference.dispatchEvent(new Event('input'));
  expect(f.preview.innerHTML).toContain('>example.test</a>');
  f.format.checked = true;
  f.format.dispatchEvent(new Event('change'));
  expect(f.preview.innerHTML).toContain('<em>literal</em>');
  f.textarea.value = 'x'.repeat(1024);
  f.textarea.dispatchEvent(new Event('input'));
  f.actions[0].dispatchEvent(new Event('click'));
  expect(f.textarea.value).toHaveLength(1024);
  expect(f.counter.textContent).toBe('1024 / 1024');
  expect(f.error.textContent).toContain('Not enough space');
  f.textarea.value += 'x';
  f.textarea.dispatchEvent(new Event('input'));
  expect(f.textarea.attributes.get('aria-invalid')).toBe('true');
  expect(f.error.textContent).toBe('Description is too long');
});
