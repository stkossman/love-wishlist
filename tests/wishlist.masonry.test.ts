import { afterEach, expect, test } from 'bun:test';
import { initWishlistMasonry } from '../src/modules/wishlist/client/wishlist-masonry';

const restore: (() => void)[] = [];
afterEach(() => {
  for (const reset of restore.splice(0).reverse()) reset();
});

function replaceGlobal(name: string, value: unknown) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, name);
  Object.defineProperty(globalThis, name, { configurable: true, value });
  restore.push(() => {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  });
}

function fixture(heights = [200, 401.5, 100]) {
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  const root = { dataset: { wishlistView: 'grid' } };
  const dataset: { masonry?: string } = {};
  const makeCard = (height: number) => {
    let span = '';
    const card = {
      height,
      reads: 0,
      writes: 0,
      style: {
        get gridRowEnd() {
          return span;
        },
        set gridRowEnd(value: string) {
          span = value;
          card.writes++;
        },
        removeProperty() {
          span = '';
        },
      },
      getBoundingClientRect() {
        card.reads++;
        // The Tailwind masonry padding reserves the existing 44px card gap.
        return { height: card.height + ('masonry' in dataset ? 44 : 0) };
      },
    };
    return card;
  };
  const cards = heights.map(makeCard);
  const feed = {
    dataset,
    hasAttribute: () => 'masonry' in dataset,
    querySelectorAll: () => cards,
  };
  const observed = new Set<unknown>();
  let resize: (entries: { target: unknown }[]) => void;
  let children: () => void;
  let preference: () => void;
  let disconnected = 0;
  replaceGlobal('document', { documentElement: root });
  replaceGlobal('getComputedStyle', () => ({ gridAutoRows: '4px' }));
  replaceGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++nextFrame, callback);
    return nextFrame;
  });
  replaceGlobal('cancelAnimationFrame', (id: number) => frames.delete(id));
  replaceGlobal(
    'ResizeObserver',
    class {
      constructor(callback: typeof resize) {
        resize = callback;
      }
      observe(card: unknown) {
        observed.add(card);
      }
      unobserve(card: unknown) {
        observed.delete(card);
      }
      disconnect() {
        observed.clear();
        disconnected++;
      }
    }
  );
  replaceGlobal(
    'MutationObserver',
    class {
      constructor(private callback: () => void) {}
      observe(target: unknown) {
        if (target === root) preference = this.callback;
        else children = this.callback;
      }
      disconnect() {
        disconnected++;
      }
    }
  );
  const cleanup = initWishlistMasonry(feed as unknown as HTMLElement)!;
  return {
    cards,
    dataset,
    root,
    frames,
    observed,
    cleanup,
    makeCard,
    disconnected: () => disconnected,
    resize: (...targets: unknown[]) => resize(targets.map((target) => ({ target }))),
    children: () => children(),
    preference: () => preference(),
    flush() {
      const pending = Array.from(frames.values());
      frames.clear();
      for (const callback of pending) callback(0);
    },
  };
}

test('natural card heights reserve spacing and round spans up without truncating content', () => {
  const f = fixture();
  expect(f.cards.map((card) => card.style.gridRowEnd)).toEqual(['span 61', 'span 112', 'span 36']);
  expect(f.observed.size).toBe(3);
});

test('image and responsive size notifications are batched and only changed cards are measured', () => {
  const f = fixture();
  const card = f.cards[1]!;
  card.height = 802;
  f.resize(card);
  f.resize(card);
  expect(f.frames.size).toBe(1);
  f.flush();
  expect(card.style.gridRowEnd).toBe('span 212');
  expect(f.cards.map((c) => c.reads)).toEqual([1, 2, 1]);
  f.resize(card);
  f.flush();
  expect(card.writes).toBe(2);
  expect(f.frames.size).toBe(0);
});

test('pagination observes appended cards without remeasuring or changing earlier spans or DOM order', () => {
  const f = fixture();
  const original = [...f.cards];
  const appended = f.makeCard(600);
  f.cards.push(appended);
  f.children();
  f.flush();
  expect(f.cards.slice(0, 3)).toEqual(original);
  expect(original.map((c) => c.reads)).toEqual([1, 1, 1]);
  expect(appended.style.gridRowEnd).toBe('span 161');
  expect(f.observed.has(appended)).toBe(true);
});

test('List mode clears masonry and Grid restores every span, including cards appended in List', () => {
  const f = fixture();
  f.root.dataset.wishlistView = 'list';
  f.preference();
  f.flush();
  expect(f.dataset.masonry).toBeUndefined();
  expect(f.cards.every((c) => c.style.gridRowEnd === '')).toBe(true);
  f.cards.push(f.makeCard(300));
  f.children();
  f.flush();
  expect(f.cards[3]!.reads).toBe(0);
  f.root.dataset.wishlistView = 'grid';
  f.preference();
  f.flush();
  expect(f.dataset.masonry).toBe('');
  expect(f.cards.map((c) => c.style.gridRowEnd)).toEqual([
    'span 61',
    'span 112',
    'span 36',
    'span 86',
  ]);
});

test('deletion unobserves cards, ignores stale notifications, and restores the empty feed', () => {
  const f = fixture([200]);
  const removed = f.cards.pop()!;
  f.children();
  f.resize(removed);
  f.flush();
  expect(f.observed.size).toBe(0);
  expect(removed.reads).toBe(1);
  expect(removed.style.gridRowEnd).toBe('');
  expect(f.dataset.masonry).toBeUndefined();
});

test('cleanup cancels pending work and disconnects all observers', () => {
  const f = fixture();
  f.resize(f.cards[0]);
  f.cleanup();
  expect(f.frames.size).toBe(0);
  expect(f.disconnected()).toBe(3);
  expect(f.dataset.masonry).toBeUndefined();
  expect(f.cards.every((c) => c.style.gridRowEnd === '')).toBe(true);
});

test('browsers without ResizeObserver retain the CSS-only grid', () => {
  replaceGlobal('ResizeObserver', undefined);
  expect(initWishlistMasonry({} as HTMLElement)).toBeUndefined();
});
