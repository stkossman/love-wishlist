import { expect, test } from 'bun:test';
import { initAddRitual } from '../src/modules/wishlist/client/wishlist-add-ritual';

function fixture() {
  const view = new EventTarget();
  const document = Object.assign(new EventTarget(), { defaultView: view });
  const link = Object.assign(new EventTarget(), {
    dataset: {} as Record<string, string>,
    ownerDocument: document,
  });
  initAddRitual(link as unknown as HTMLAnchorElement);
  const press = (button = 0, isPrimary = true) => {
    const event = new Event('pointerdown', { cancelable: true });
    Object.assign(event, { button, isPrimary });
    link.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  };
  return { link, document, view, press };
}

test('primary contact shows a pressed pose without intercepting native behavior', () => {
  const f = fixture();
  f.press(2);
  expect(f.link.dataset.pressed).toBeUndefined();
  f.press(0, false);
  expect(f.link.dataset.pressed).toBeUndefined();
  f.press();
  expect(f.link.dataset.pressed).toBe('true');
  f.document.dispatchEvent(new Event('pointerup'));
  expect(f.link.dataset.pressed).toBeUndefined();
});

test('leaving, cancelling, losing focus or releasing outside the link clears contact', () => {
  const f = fixture();
  for (const [target, event] of [
    [f.link, 'pointerleave'],
    [f.link, 'pointercancel'],
    [f.link, 'blur'],
    [f.document, 'pointercancel'],
    [f.view, 'blur'],
  ] as const) {
    f.press();
    target.dispatchEvent(new Event(event));
    expect(f.link.dataset.pressed).toBeUndefined();
  }
});
