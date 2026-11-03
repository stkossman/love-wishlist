import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { WishlistFeedHandler } from '../src/modules/wishlist/client/wishlist-feed-handler';
import { WishlistCardEvents } from '../src/modules/wishlist/client/wishlist-card-events';
import { WishlistClient } from '../src/modules/wishlist/client/wishlist-api-client';

// Only the DOM operations used by the handlers are stubbed; requests use real Responses.
class TestElement extends EventTarget {
  disabled = false;
  textContent = 'Delete';
  dataset: Record<string, string> = {};
  style = { opacity: '', pointerEvents: '', display: '' };
  isConnected = true;
  attributes = new Map<string, string>();
  classes = new Set<string>();
  classList = {
    add: (name: string) => this.classes.add(name),
    remove: (name: string) => this.classes.delete(name),
    toggle: (name: string, force?: boolean) => {
      const add = force ?? !this.classes.has(name);
      if (add) this.classes.add(name);
      else this.classes.delete(name);
      return add;
    },
  };
  matches = new Map<string, TestElement>();
  article: TestElement | null = null;
  nextElementSibling: TestElement | null = null;
  previousElementSibling: TestElement | null = null;
  actions: TestElement[] = [];
  focused = false;
  focus() {
    this.focused = true;
    Object.assign(doc, { activeElement: this });
  }
  querySelectorAll() {
    return this.actions;
  }
  fragments: string[] = [];
  closest(selector: string) {
    return this.matches.get(selector) ?? null;
  }
  querySelector() {
    return this.article;
  }
  getAttribute(name: string) {
    return this.attributes.get(name) ?? null;
  }
  hasAttribute(name: string) {
    return this.attributes.has(name);
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
  }
  insertAdjacentHTML(_position: string, html: string) {
    this.fragments.push(html);
    this.article = new TestElement();
  }
  remove() {
    this.isConnected = false;
    const feed = this.closest('#feed-container');
    if (feed) feed.article = null;
  }
}

const originalDocument = globalThis.document;
const originalElement = globalThis.Element;
const originalHTMLElement = globalThis.HTMLElement;
const originalConfirm = globalThis.confirm;
const originalAlert = globalThis.alert;
const originalWindow = globalThis.window;
const originalIntersectionObserver = globalThis.IntersectionObserver;
let elements: Map<string, TestElement>;
let doc: EventTarget;
let browser: EventTarget & { location: { reload: ReturnType<typeof mock> } };
let menuButtons: TestElement[];
let fetchMock: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

test('dynamic cards retain occasion, year and owner filters', async () => {
  new WishlistFeedHandler('her', { occasions: true, type: 'birthday', year: 2027 });
  fetchMock.mockResolvedValueOnce(new Response('<article>Birthday 2027</article>'));
  elements.get('load-more-btn')!.dispatchEvent(new Event('click'));
  await tick();
  const url = new URL(String(fetchMock.mock.calls[0][0]), 'https://wishlist.test');
  expect(Object.fromEntries(url.searchParams)).toEqual({
    owner: 'her',
    collection: 'occasions',
    occasion: 'birthday',
    year: '2027',
    cursor: 'original-cursor',
  });
  expect(elements.get('feed-container')!.fragments).toEqual(['<article>Birthday 2027</article>']);
});

beforeEach(() => {
  Reflect.set(WishlistCardEvents, 'initialized', false);
  menuButtons = [];
  elements = new Map(
    [
      'load-more-btn',
      'feed-container',
      'end-message',
      'empty-message',
      'feed-sentinel',
      'feed-status',
    ].map((id) => [id, new TestElement()])
  );
  elements.get('load-more-btn')!.setAttribute('data-cursor', 'original-cursor');
  elements.get('empty-message')!.classes.add('hidden');
  doc = Object.assign(new EventTarget(), {
    getElementById: (id: string) => elements.get(id) ?? null,
    querySelectorAll: (selector: string) => (selector === '.menu-btn' ? menuButtons : []),
  });
  globalThis.document = doc as unknown as Document;
  browser = Object.assign(new EventTarget(), { location: { reload: mock(() => {}) } });
  globalThis.window = browser as unknown as Window & typeof globalThis;
  globalThis.IntersectionObserver = undefined as unknown as typeof IntersectionObserver;
  globalThis.Element = TestElement as unknown as typeof Element;
  globalThis.HTMLElement = TestElement as unknown as typeof HTMLElement;
  globalThis.confirm = () => true;
  globalThis.alert = mock(() => {});
  fetchMock = spyOn(globalThis, 'fetch');
  spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  mock.restore();
  globalThis.document = originalDocument;
  globalThis.Element = originalElement;
  globalThis.HTMLElement = originalHTMLElement;
  globalThis.confirm = originalConfirm;
  globalThis.alert = originalAlert;
  globalThis.window = originalWindow;
  globalThis.IntersectionObserver = originalIntersectionObserver;
});

function intersectionObserver() {
  let callback: IntersectionObserverCallback;
  let options: IntersectionObserverInit | undefined;
  const observe = mock((_target: Element) => {});
  const disconnect = mock(() => {});
  globalThis.IntersectionObserver = class {
    constructor(cb: IntersectionObserverCallback, init?: IntersectionObserverInit) {
      callback = cb;
      options = init;
    }
    observe = observe;
    disconnect = disconnect;
  } as unknown as typeof IntersectionObserver;
  return {
    observe,
    disconnect,
    options: () => options,
    enter(isIntersecting = true) {
      callback([{ isIntersecting } as IntersectionObserverEntry], {} as IntersectionObserver);
    },
  };
}

test('infinite scrolling preloads at 600px and requires a fresh entrance for successive pages', async () => {
  const observer = intersectionObserver();
  new WishlistFeedHandler();
  const button = elements.get('load-more-btn')!;
  expect(observer.options()?.rootMargin).toBe('0px 0px 600px 0px');
  expect(observer.observe).toHaveBeenCalledTimes(1);
  expect(button.classes.has('hidden')).toBe(true);
  fetchMock.mockResolvedValueOnce(
    new Response('<article>Page two</article>', {
      headers: { 'X-Next-Cursor': 'second-cursor' },
    })
  );
  observer.enter();
  observer.enter();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  await tick();
  expect(button.getAttribute('data-cursor')).toBe('second-cursor');
  observer.enter();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(button.classes.has('hidden')).toBe(false);
  observer.enter(false);
  expect(button.classes.has('hidden')).toBe(true);
  fetchMock.mockResolvedValueOnce(new Response('<article>Last page</article>'));
  observer.enter();
  await tick();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(String(fetchMock.mock.calls[1][0])).toContain('cursor=second-cursor');
  expect(elements.get('feed-container')!.fragments).toHaveLength(2);
  expect(observer.disconnect).toHaveBeenCalled();
  observer.enter(false);
  observer.enter();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

test('automatic failures suspend observation until a successful manual retry with the same cursor', async () => {
  const observer = intersectionObserver();
  new WishlistFeedHandler('her');
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  observer.enter();
  await tick();
  const button = elements.get('load-more-btn')!;
  expect(observer.disconnect).toHaveBeenCalledTimes(1);
  expect(button.textContent).toBe('Retry');
  expect(button.classes.has('hidden')).toBe(false);
  expect(elements.get('feed-status')!.textContent).toContain('could not be loaded');
  observer.enter(false);
  observer.enter();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockResolvedValueOnce(
    new Response('<article>Recovered</article>', {
      headers: { 'X-Next-Cursor': 'recovered-cursor' },
    })
  );
  button.dispatchEvent(new Event('click'));
  button.dispatchEvent(new Event('click'));
  await tick();
  expect(fetchMock.mock.calls[0][0]).toBe(fetchMock.mock.calls[1][0]);
  expect(observer.observe).toHaveBeenCalledTimes(2);
  observer.enter();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(button.getAttribute('data-cursor')).toBe('recovered-cursor');
});

test('empty pages with advancing cursors never drain the feed while the sentinel stays visible', async () => {
  const observer = intersectionObserver();
  new WishlistFeedHandler();
  fetchMock.mockResolvedValueOnce(new Response('', { headers: { 'X-Next-Cursor': 'next' } }));
  observer.enter();
  await tick();
  observer.enter();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(elements.get('load-more-btn')!.classes.has('hidden')).toBe(false);
  expect(elements.get('empty-message')!.classes.has('hidden')).toBe(true);
});

test('a repeated cursor is rejected before appending duplicate cards', async () => {
  new WishlistFeedHandler();
  fetchMock.mockResolvedValueOnce(
    new Response('<article>Duplicate</article>', {
      headers: { 'X-Next-Cursor': 'original-cursor' },
    })
  );
  elements.get('load-more-btn')!.dispatchEvent(new Event('click'));
  await tick();
  expect(elements.get('feed-container')!.fragments).toHaveLength(0);
  expect(elements.get('load-more-btn')!.textContent).toBe('Retry');
  expect(elements.get('load-more-btn')!.getAttribute('data-cursor')).toBe('original-cursor');
});

test('history suspension aborts pending requests without consuming a cursor and restores observation', async () => {
  const observer = intersectionObserver();
  new WishlistFeedHandler();
  let resolve!: (response: Response) => void;
  fetchMock.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    })
  );
  observer.enter();
  const signal = fetchMock.mock.calls[0][1]?.signal;
  browser.dispatchEvent(new Event('pagehide'));
  expect(signal?.aborted).toBe(true);
  resolve(new Response('<article>Stale</article>', { headers: { 'X-Next-Cursor': 'stale' } }));
  await tick();
  expect(elements.get('feed-container')!.fragments).toHaveLength(0);
  expect(elements.get('load-more-btn')!.getAttribute('data-cursor')).toBe('original-cursor');
  browser.dispatchEvent(new Event('pageshow'));
  expect(observer.observe).toHaveBeenCalledTimes(2);
  observer.enter();
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('invalid cursors offer a deliberate refresh through Retry', async () => {
  const observer = intersectionObserver();
  new WishlistFeedHandler();
  fetchMock.mockResolvedValueOnce(new Response('{}', { status: 400 }));
  observer.enter();
  await tick();
  const button = elements.get('load-more-btn')!;
  expect(button.textContent).toBe('Retry');
  button.dispatchEvent(new Event('click'));
  expect(browser.location.reload).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('initially exhausted feeds do not observe or request', () => {
  const observer = intersectionObserver();
  elements.get('load-more-btn')!.removeAttribute('data-cursor');
  new WishlistFeedHandler();
  expect(observer.observe).not.toHaveBeenCalled();
  expect(fetchMock).not.toHaveBeenCalled();
  expect(elements.get('empty-message')!.classes.has('hidden')).toBe(false);
});

test('manual recovery keeps keyboard focus until the pagination button is left', async () => {
  const observer = intersectionObserver();
  new WishlistFeedHandler();
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  observer.enter();
  await tick();
  const button = elements.get('load-more-btn')!;
  const body = new TestElement();
  Object.assign(doc, { activeElement: button, body });
  fetchMock.mockResolvedValueOnce(
    new Response('<article>Recovered</article>', {
      headers: { 'X-Next-Cursor': 'recovered' },
    })
  );
  button.dispatchEvent(new Event('click'));
  // Disabling a focused native button moves focus to the document body.
  Object.assign(doc, { activeElement: body });
  await tick();
  expect(button.focused).toBe(true);
  observer.enter(false);
  expect(button.classes.has('hidden')).toBe(false);
  Object.assign(doc, { activeElement: null });
  button.dispatchEvent(new Event('focusout'));
  expect(button.classes.has('hidden')).toBe(true);
});

for (const owner of ['me', 'her'] as const) {
  test(`${owner}: failed pagination restores controls, preserves cursor and supports retry`, async () => {
    new WishlistFeedHandler(owner);
    const button = elements.get('load-more-btn')!;
    const feed = elements.get('feed-container')!;
    fetchMock.mockResolvedValueOnce(new Response('failure', { status: 503 }));
    button.dispatchEvent(new Event('click'));
    expect(button.disabled).toBe(true);
    await tick();
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Retry');
    expect(button.getAttribute('data-cursor')).toBe('original-cursor');
    expect(feed.fragments).toHaveLength(0);
    fetchMock.mockResolvedValueOnce(
      new Response('<article>Next card</article>', { headers: { 'X-Next-Cursor': 'next-cursor' } })
    );
    button.dispatchEvent(new Event('click'));
    await tick();
    expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
      `/api/items/fragment?owner=${owner}&cursor=original-cursor`,
      `/api/items/fragment?owner=${owner}&cursor=original-cursor`,
    ]);
    expect(button.getAttribute('data-cursor')).toBe('next-cursor');
    expect(feed.fragments).toHaveLength(1);
  });
}

test('duplicate pagination requests are ignored and exhausted empty feeds show the empty state', async () => {
  new WishlistFeedHandler('me');
  const button = elements.get('load-more-btn')!;
  let resolve!: (response: Response) => void;
  fetchMock.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    })
  );
  button.dispatchEvent(new Event('click'));
  button.dispatchEvent(new Event('click'));
  expect(fetchMock).toHaveBeenCalledTimes(1);
  resolve(new Response(''));
  await tick();
  expect(button.disabled).toBe(false);
  expect(button.style.display).toBe('none');
  expect(button.getAttribute('data-cursor')).toBeNull();
  expect(elements.get('empty-message')!.classes.has('hidden')).toBe(false);
  expect(elements.get('end-message')!.classes.has('hidden')).toBe(true);
});

test('network and body-read failures leave the original cursor available', async () => {
  new WishlistFeedHandler('her');
  const button = elements.get('load-more-btn')!;
  for (const failure of [new Error('offline'), new Error('body interrupted')]) {
    if (failure.message === 'offline') fetchMock.mockRejectedValueOnce(failure);
    else {
      const response = new Response('');
      spyOn(response, 'text').mockRejectedValueOnce(failure);
      fetchMock.mockResolvedValueOnce(response);
    }
    button.dispatchEvent(new Event('click'));
    await tick();
    expect(button.disabled).toBe(false);
    expect(button.getAttribute('data-cursor')).toBe('original-cursor');
  }
});

test('delegated deletion restores failed detail actions, prevents duplicates and updates the final-card empty state', async () => {
  new WishlistFeedHandler('me');
  WishlistCardEvents.init();
  WishlistCardEvents.init();
  const feed = elements.get('feed-container')!;
  const button = new TestElement();
  button.dataset.id = 'dynamic-item';
  button.matches.set('.delete-btn', button);
  const click = () => {
    const event = new Event('click');
    Object.defineProperty(event, 'target', { value: button });
    doc.dispatchEvent(event);
  };
  let resolve!: (response: Response) => void;
  fetchMock.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    })
  );
  click();
  expect(button.disabled).toBe(true);
  expect(button.textContent).toBe('Deleting...');
  click();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  resolve(new Response(JSON.stringify({ error: 'Try again' }), { status: 503 }));
  await tick();
  expect(button.disabled).toBe(false);
  expect(button.textContent).toBe('Delete');
  expect(globalThis.alert).toHaveBeenCalledWith('Try again');

  const card = new TestElement();
  card.matches.set('#feed-container', feed);
  button.matches.set('article', card);
  feed.article = card;
  elements.get('load-more-btn')!.removeAttribute('data-cursor');
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true })));
  fetchMock.mockResolvedValueOnce(new Response('{}'));
  click();
  await tick();
  expect(card.isConnected).toBe(false);
  expect(elements.get('empty-message')!.classes.has('hidden')).toBe(false);
});

test('browser API updates preserve nullable image fields and GET checks error statuses', async () => {
  const update = { imageUrl: null, imagePublicId: null };
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Item updated' })));
  expect(await WishlistClient.update('item id', update)).toEqual({ message: 'Item updated' });
  expect(fetchMock.mock.calls[0][0]).toBe('/api/items/item%20id');
  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual(update);
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: 'Invalid cursor' }), { status: 400 })
  );
  expect(await WishlistClient.getAll('me', 'bad').catch((error: unknown) => error)).toMatchObject({
    status: 400,
    message: 'Invalid cursor',
  });
});

for (const status of [200, 404, 503]) {
  test(`modal deletion (${status}) retains its item identity after the dialog is replaced`, async () => {
    WishlistCardEvents.init();
    const button = new TestElement();
    button.dataset.id = 'modal-item';
    button.matches.set('.delete-btn', button);
    button.matches.set('#wishlist-detail-dialog', new TestElement());
    let removed = 0;
    let removedId: string | undefined;
    doc.addEventListener('wishlist:detail-deleted', (event) => {
      removed++;
      removedId = (event as CustomEvent<{ id: string }>).detail.id;
    });
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ authenticated: true })));
    fetchMock.mockResolvedValueOnce(new Response('{}', { status }));
    const event = new Event('click');
    Object.defineProperty(event, 'target', { value: button });
    doc.dispatchEvent(event);
    button.matches.delete('#wishlist-detail-dialog');
    await tick();
    expect(fetchMock.mock.calls[0][0]).toBe('/api/auth/session');
    expect(fetchMock.mock.calls[1][0]).toBe('/api/items/modal-item');
    expect(fetchMock.mock.calls[1][1]?.method).toBe('DELETE');
    expect(removed).toBe(status === 503 ? 0 : 1);
    expect(removedId).toBe(status === 503 ? undefined : 'modal-item');
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Delete');
  });
}

test('collection loading status is cleared after a failed request', async () => {
  const loader = new TestElement();
  loader.classes.add('hidden');
  elements.set('feed-loader', loader);
  new WishlistFeedHandler();
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  elements.get('load-more-btn')!.dispatchEvent(new Event('click'));
  expect(loader.classes.has('hidden')).toBe(false);
  expect(elements.get('feed-container')!.getAttribute('aria-busy')).toBe('true');
  await tick();
  expect(loader.classes.has('hidden')).toBe(true);
  expect(elements.get('feed-container')!.getAttribute('aria-busy')).toBeNull();
});

test('delegated menus keep one disclosure open and support arrows, Escape, outside clicks and focus', () => {
  WishlistCardEvents.init();
  const makeMenu = () => {
    const button = new TestElement();
    const panel = new TestElement();
    button.nextElementSibling = panel;
    panel.previousElementSibling = button;
    button.matches.set('.menu-btn', button);
    panel.matches.set('.menu-dropdown', panel);
    panel.classes.add('hidden');
    const edit = new TestElement();
    const remove = new TestElement();
    edit.matches.set('.menu-dropdown', panel);
    panel.actions = [edit, remove];
    menuButtons.push(button);
    return { button, panel, edit, remove };
  };
  const first = makeMenu();
  const second = makeMenu();
  const dispatch = (type: string, target: TestElement, key?: string) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperties(event, { target: { value: target }, key: { value: key } });
    doc.dispatchEvent(event);
    return event;
  };
  dispatch('click', first.button);
  expect(first.button.getAttribute('aria-expanded')).toBe('true');
  expect(first.panel.classes.has('hidden')).toBe(false);
  dispatch('click', second.button);
  expect(first.button.getAttribute('aria-expanded')).toBe('false');
  expect(first.panel.classes.has('hidden')).toBe(true);
  dispatch('keydown', first.button, 'ArrowDown');
  expect(first.edit.focused).toBe(true);
  expect(second.panel.classes.has('hidden')).toBe(true);
  dispatch('keydown', first.button, 'ArrowUp');
  expect(first.remove.focused).toBe(true);
  dispatch('keydown', first.edit, 'Escape');
  expect(first.panel.classes.has('hidden')).toBe(true);
  expect(first.button.focused).toBe(true);
  expect(dispatch('keydown', first.button, 'Escape').defaultPrevented).toBe(false);
  dispatch('click', first.button);
  dispatch('focusin', new TestElement());
  expect(first.button.getAttribute('aria-expanded')).toBe('false');
  dispatch('click', first.button);
  dispatch('click', new TestElement());
  expect(first.panel.classes.has('hidden')).toBe(true);
});
