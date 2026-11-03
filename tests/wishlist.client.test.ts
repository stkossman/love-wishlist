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
let elements: Map<string, TestElement>;
let doc: EventTarget;
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
    ['load-more-btn', 'feed-container', 'end-message', 'empty-message'].map((id) => [
      id,
      new TestElement(),
    ])
  );
  elements.get('load-more-btn')!.setAttribute('data-cursor', 'original-cursor');
  elements.get('empty-message')!.classes.add('hidden');
  doc = Object.assign(new EventTarget(), {
    getElementById: (id: string) => elements.get(id) ?? null,
    querySelectorAll: (selector: string) => (selector === '.menu-btn' ? menuButtons : []),
  });
  globalThis.document = doc as unknown as Document;
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
  dispatch('click', first.button);
  dispatch('focusin', new TestElement());
  expect(first.button.getAttribute('aria-expanded')).toBe('false');
  dispatch('click', first.button);
  dispatch('click', new TestElement());
  expect(first.panel.classes.has('hidden')).toBe(true);
});
