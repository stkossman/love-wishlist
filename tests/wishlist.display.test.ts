import { afterEach, expect, test } from 'bun:test';
import {
  initDisplayPreferences,
  DISPLAY_PREFERENCE_KEY,
} from '../src/modules/wishlist/client/wishlist-display-preferences';

const originalDocument = globalThis.document;
const originalWindow = globalThis.window;
const originalStorage = globalThis.localStorage;
afterEach(() => {
  globalThis.document = originalDocument;
  globalThis.window = originalWindow;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage });
});

function fixture(savedView?: string, storageUnavailable = false) {
  const controls = ['grid', 'list'].map((value) =>
    Object.assign(new EventTarget(), { value, checked: false })
  );
  const root = { dataset: { wishlistView: savedView } };
  const status = { textContent: '' };
  const values = new Map<string, string>();
  globalThis.document = {
    documentElement: root,
    querySelectorAll: () => controls,
    querySelector: () => status,
  } as unknown as Document;
  const browser = new EventTarget();
  globalThis.window = browser as unknown as Window & typeof globalThis;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem(key: string) {
        if (storageUnavailable) throw new Error('Storage blocked');
        return values.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        if (storageUnavailable) throw new Error('Storage blocked');
        values.set(key, value);
      },
    },
  });
  initDisplayPreferences();
  return { controls, root, status, values, browser };
}

test('default grid, saved list and switching update the selected control and browser preference', () => {
  expect(fixture().controls[0].checked).toBe(true);
  const f = fixture('list');
  expect(f.controls[1].checked).toBe(true);
  f.controls[0].checked = true;
  f.controls[0].dispatchEvent(new Event('change'));
  expect(f.root.dataset.wishlistView).toBe('grid');
  expect(f.values.get(DISPLAY_PREFERENCE_KEY)).toBe('grid');
  expect(f.status.textContent).toBe('Grid view saved.');
});

test('blocked storage preserves the chosen view and explains that it was not saved', () => {
  const f = fixture(undefined, true);
  f.controls[1].checked = true;
  f.controls[1].dispatchEvent(new Event('change'));
  expect(f.root.dataset.wishlistView).toBe('list');
  expect(f.status.textContent).toContain('could not be saved');
});

test('cross-tab changes and storage clearing sync controls; unrelated keys are ignored', () => {
  const f = fixture();
  const change = (key: string | null, newValue: string | null) => {
    const event = new Event('storage');
    Object.defineProperties(event, { key: { value: key }, newValue: { value: newValue } });
    f.browser.dispatchEvent(event);
  };
  change(DISPLAY_PREFERENCE_KEY, 'list');
  expect(f.controls[1].checked).toBe(true);
  change('other', 'grid');
  expect(f.root.dataset.wishlistView).toBe('list');
  change(null, null);
  expect(f.controls[0].checked).toBe(true);
  change(DISPLAY_PREFERENCE_KEY, 'invalid');
  expect(f.root.dataset.wishlistView).toBe('grid');
});

test('history restores reread the preference and update the selected option', () => {
  const f = fixture();
  f.values.set(DISPLAY_PREFERENCE_KEY, 'list');
  f.browser.dispatchEvent(new Event('pageshow'));
  expect(f.root.dataset.wishlistView).toBe('list');
  expect(f.controls[1].checked).toBe(true);
  f.values.clear();
  f.browser.dispatchEvent(new Event('pageshow'));
  expect(f.controls[0].checked).toBe(true);
});
