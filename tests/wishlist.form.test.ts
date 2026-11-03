import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import {
  initWishlistForm,
  serializeWishlistForm,
} from '../src/modules/wishlist/client/wishlist-form-handler';
import { initFormAccess } from '../src/modules/wishlist/client/wishlist-form-access';
import {
  initImageField,
  mapImageMetadata,
} from '../src/modules/wishlist/client/wishlist-image-field';
import { getSpecsFromForm, initSpecsField } from '../src/modules/wishlist/client/specs';
import { WishlistClient } from '../src/modules/wishlist/client/wishlist-api-client';
import { WishlistImageClient } from '../src/modules/wishlist/client/wishlist-image-client';
import { ApiError } from '../src/modules/wishlist/client/wishlist-auth-client';

class TestElement extends EventTarget {
  dataset: Record<string, string> = {};
  textContent = '';
  disabled = false;
  hidden = false;
  inert = true;
  value = '';
  src = '';
  style = { display: '', opacity: '' };
  attributes = new Map<string, string>();
  matches = new Map<string, TestElement>();
  lists = new Map<string, TestElement[]>();
  classes = new Set<string>();
  nextElementSibling: TestElement | null = null;
  previousElementSibling: TestElement | null = null;
  classList = {
    add: (...names: string[]) => names.forEach((name) => this.classes.add(name)),
    remove: (...names: string[]) => names.forEach((name) => this.classes.delete(name)),
    toggle: (name: string, force: boolean) =>
      force ? this.classes.add(name) : this.classes.delete(name),
  };
  querySelector(selector: string) {
    return this.matches.get(selector) ?? null;
  }
  querySelectorAll(selector: string) {
    return this.lists.get(selector) ?? [];
  }
  closest(selector: string) {
    return this.querySelector(selector);
  }
  setAttribute(name: string, value: string) {
    this.attributes.set(name, value);
  }
  removeAttribute(name: string) {
    this.attributes.delete(name);
    if (name === 'src') this.src = '';
  }
  focus() {
    active = this;
  }
  append = mock((_node: TestElement) => {});
  remove = mock(() => {});
}
class TestInput extends TestElement {
  files: File[] = [];
}
class TestImage extends TestElement {}
class TestButton extends TestElement {}
class TestForm extends TestElement {
  fields = {
    owner: 'me',
    topic: ' Brand ',
    name: ' Gift ',
    price: '',
    url: '',
    description: ' Notes ',
  };
}
class TestFragment extends TestElement {
  cloneNode = mock((_deep: boolean) => new TestFragment());
}
class TestTemplate extends TestElement {
  content = new TestFragment();
}
const NativeFormData = globalThis.FormData;
const original = {
  HTMLElement: globalThis.HTMLElement,
  Element: globalThis.Element,
  HTMLInputElement: globalThis.HTMLInputElement,
  HTMLImageElement: globalThis.HTMLImageElement,
  HTMLButtonElement: globalThis.HTMLButtonElement,
  HTMLFormElement: globalThis.HTMLFormElement,
  HTMLTemplateElement: globalThis.HTMLTemplateElement,
  DocumentFragment: globalThis.DocumentFragment,
  window: globalThis.window,
  alert: globalThis.alert,
  FormData: globalThis.FormData,
};
let active: TestElement | null;
let browser: EventTarget & { location: { href: string }; matchMedia: () => { matches: boolean } };
const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
const html = (element: TestElement) => element as unknown as HTMLElement;
const formElement = (element: TestForm) => element as unknown as HTMLFormElement;

function fixture(mode: 'create' | 'update' = 'create', existing = false) {
  const root = new TestElement();
  root.dataset.mode = mode;
  const form = new TestForm();
  if (mode === 'update') form.dataset.id = 'item-id';
  const submit = new TestButton();
  submit.textContent = mode === 'create' ? 'Confirm Entry' : 'Update Entry';
  const content = new TestElement();
  const overlay = new TestElement();
  const pin = new TestInput();
  const error = new TestElement();
  const topic = new TestInput();
  const image = new TestElement();
  const input = new TestInput();
  const preview = new TestImage();
  const placeholder = new TestElement();
  const clear = new TestButton();
  const imageError = new TestElement();
  if (existing) {
    image.dataset.initialImagePublicId = 'wishlist/old';
    image.dataset.initialImageUrl = 'https://example.test/old.png';
    preview.src = image.dataset.initialImageUrl;
  }
  const specs = new TestElement();
  const container = new TestElement();
  const add = new TestButton();
  const template = new TestTemplate();
  root.matches.set('form', form);
  root.matches.set('[data-form-access]', overlay);
  root.matches.set('[data-form-content]', content);
  overlay.matches.set('input', pin);
  overlay.matches.set('[aria-live]', error);
  form.matches.set('button[type="submit"]', submit);
  form.matches.set('[data-image-field]', image);
  form.matches.set('[data-specs-field]', specs);
  form.matches.set('[name="topic"]', topic);
  image.dataset.imageVersion = 'test-image-version';
  image.matches.set('input', input);
  image.matches.set('img', preview);
  image.matches.set('[data-image-placeholder]', placeholder);
  image.matches.set('button', clear);
  image.matches.set('[data-image-error]', imageError);
  specs.matches.set('[data-specs-container]', container);
  specs.matches.set('[data-add-spec]', add);
  specs.matches.set('template', template);
  return {
    root,
    form,
    submit,
    content,
    overlay,
    pin,
    error,
    topic,
    image,
    input,
    preview,
    placeholder,
    clear,
    imageError,
    specs,
    container,
    add,
    template,
  };
}

beforeEach(() => {
  active = null;
  browser = Object.assign(new EventTarget(), {
    location: { href: '/add' },
    matchMedia: () => ({ matches: true }),
  });
  Object.assign(globalThis, {
    HTMLElement: TestElement,
    Element: TestElement,
    HTMLInputElement: TestInput,
    HTMLImageElement: TestImage,
    HTMLButtonElement: TestButton,
    HTMLFormElement: TestForm,
    HTMLTemplateElement: TestTemplate,
    DocumentFragment: TestFragment,
    window: browser,
    alert: mock(() => {}),
    FormData: class extends NativeFormData {
      constructor(form?: TestForm) {
        super();
        if (form) for (const [key, value] of Object.entries(form.fields)) this.set(key, value);
      }
    },
  });
  spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify({ authenticated: true }))
  );
  spyOn(console, 'error').mockImplementation(() => {});
  let url = 0;
  spyOn(URL, 'createObjectURL').mockImplementation(() => `blob:test-${++url}`);
  spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  spyOn(WishlistImageClient, 'upload').mockResolvedValue(metadata);
  spyOn(WishlistClient, 'create').mockResolvedValue({ message: 'Created', id: 'created-id' });
  spyOn(WishlistClient, 'update').mockResolvedValue({ message: 'Item updated' });
});
afterEach(() => {
  mock.restore();
  Object.assign(globalThis, original);
});
const metadata = {
  secureUrl: 'https://example.test/new.png',
  publicId: 'wishlist/new',
  width: 10,
  height: 20,
  format: 'png',
  bytes: 100,
};
const file = () => new File(['image'], 'gift.png', { type: 'image/png' });
const select = (input: TestInput, selected: File) => {
  input.files = [selected];
  input.dispatchEvent(new Event('change'));
};
const submit = (form: TestForm) => form.dispatchEvent(new Event('submit', { cancelable: true }));

test('serialization trims text, preserves both owners and validates description and owner', () => {
  for (const owner of ['me', 'her'] as const) {
    const data = new NativeFormData();
    for (const [key, value] of Object.entries({
      owner,
      topic: ' Brand ',
      name: ' Gift ',
      price: ' 10 EUR ',
      url: ' https://example.test ',
      description: ' Notes ',
    }))
      data.set(key, value);
    expect(serializeWishlistForm(data, [{ label: 'Size', value: 'M' }])).toEqual({
      owner,
      topic: 'Brand',
      name: 'Gift',
      price: '10 EUR',
      url: 'https://example.test',
      description: 'Notes',
      specs: [{ label: 'Size', value: 'M' }],
    });
    data.set('description', 'x'.repeat(1025));
    expect(() => serializeWishlistForm(data, [])).toThrow();
    data.set('description', '');
    data.set('owner', 'other');
    expect(() => serializeWishlistForm(data, [])).toThrow('Invalid owner');
  }
});

for (const mode of ['create', 'update'] as const) {
  test(`${mode} initializes once, unlocks an existing session and redirects after persistence`, async () => {
    const f = fixture(mode);
    initWishlistForm(html(f.root));
    initWishlistForm(html(f.root));
    expect(f.form.inert).toBe(true);
    await settle();
    expect(f.form.inert).toBe(false);
    expect(f.content.inert).toBe(false);
    expect(f.overlay.hidden).toBe(true);
    expect(active).toBe(f.topic);
    f.form.fields.owner = 'her';
    submit(f.form);
    await settle();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(mode === 'create' ? WishlistClient.create : WishlistClient.update).toHaveBeenCalledTimes(
      1
    );
    expect(browser.location.href).toBe('/juliette');
    expect(f.submit.disabled).toBe(true);
  });
}

test('PIN errors recover and stale session checks cannot undo an explicit lock', async () => {
  const f = fixture();
  const fetch = spyOn(globalThis, 'fetch');
  let resolve!: (response: Response) => void;
  fetch.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    })
  );
  const access = initFormAccess(html(f.root), formElement(f.form));
  access.lock('Session expired. Enter Access Code');
  resolve(new Response(JSON.stringify({ authenticated: true })));
  await access.ready;
  await settle();
  expect(access.isAuthenticated()).toBe(false);
  expect(f.form.inert).toBe(true);
  fetch.mockResolvedValueOnce(
    new Response(JSON.stringify({ error: 'Invalid credentials' }), { status: 401 })
  );
  f.pin.value = '0000';
  f.pin.dispatchEvent(new Event('input'));
  await settle();
  expect(f.error.textContent).toBe('Invalid credentials');
  expect(f.pin.disabled).toBe(false);
  expect(f.pin.value).toBe('');
  expect(active).toBe(f.pin);
  fetch.mockResolvedValueOnce(new Response('{}'));
  f.pin.value = '2468';
  f.pin.dispatchEvent(new Event('input'));
  await settle();
  expect(access.isAuthenticated()).toBe(true);
  expect(f.form.inert).toBe(false);
});

test('session expiry relocks the populated form, and submission can be retried after login', async () => {
  const f = fixture('update');
  initWishlistForm(html(f.root));
  await settle();
  spyOn(WishlistClient, 'update').mockRejectedValueOnce(new ApiError(401, 'Unauthorized'));
  submit(f.form);
  await settle();
  expect(f.form.inert).toBe(true);
  expect(f.overlay.hidden).toBe(false);
  expect(f.submit.disabled).toBe(false);
  expect(f.error.textContent).toContain('Session expired');
  spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('{}'));
  f.pin.value = '2468';
  f.pin.dispatchEvent(new Event('input'));
  await settle();
  submit(f.form);
  await settle();
  expect(WishlistClient.update).toHaveBeenCalledTimes(2);
  expect(browser.location.href).toBe('/andrii');
});

test('image selection, invalid replacement, clearing and page lifecycle revoke only owned object URLs', () => {
  const f = fixture('update', true);
  const image = initImageField(html(f.image));
  expect(image.getSelection()).toEqual({
    file: null,
    removeExisting: false,
    initialPublicId: 'wishlist/old',
  });
  const selected = file();
  select(f.input, selected);
  expect(f.preview.src).toBe('blob:test-1');
  select(f.input, new File(['bad'], 'bad.svg', { type: 'image/svg+xml' }));
  expect(image.getSelection().file).toBe(selected);
  expect(f.imageError.textContent).toBe('Invalid image');
  select(f.input, file());
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-1');
  browser.dispatchEvent(new Event('pagehide'));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-2');
  const show = new Event('pageshow');
  Object.defineProperty(show, 'persisted', { value: true });
  browser.dispatchEvent(show);
  expect(f.preview.src).toBe('blob:test-3');
  f.clear.dispatchEvent(new Event('click'));
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-3');
  expect(image.getSelection().removeExisting).toBe(true);
  expect(image.getSelection().file).toBeNull();
  expect(f.preview.src).toBe('');
  expect(URL.revokeObjectURL).not.toHaveBeenCalledWith('https://example.test/old.png');
});

test('clearing a new create image sends no removal fields; clearing a legacy URL requests removal', () => {
  const f = fixture();
  const image = initImageField(html(f.image));
  select(f.input, file());
  f.clear.dispatchEvent(new Event('click'));
  expect(image.getSelection().removeExisting).toBe(false);
  const legacy = fixture();
  legacy.image.dataset.initialImageUrl = 'https://example.test/legacy.png';
  const legacyImage = initImageField(html(legacy.image));
  legacy.clear.dispatchEvent(new Event('click'));
  expect(legacyImage.getSelection().removeExisting).toBe(true);
});

test('dynamic specification rows clone the template, focus inputs and extract only complete text pairs', () => {
  const f = fixture();
  const fragment = new TestFragment();
  const label = new TestInput();
  const value = new TestInput();
  fragment.matches.set('input', label);
  fragment.matches.set('[data-spec-label]', label);
  fragment.matches.set('[data-spec-value]', value);
  f.template.content.cloneNode.mockReturnValueOnce(fragment);
  initSpecsField(html(f.specs));
  f.add.dispatchEvent(new Event('click'));
  expect(f.template.content.cloneNode).toHaveBeenCalledWith(true);
  expect(f.container.append).toHaveBeenCalledWith(fragment);
  expect(active).toBe(label);
  label.value = ' <Size> ';
  value.value = ' M & L ';
  f.form.lists.set('.spec-row', [fragment, new TestElement()]);
  expect(getSpecsFromForm(formElement(f.form))).toEqual([{ label: '<Size>', value: 'M & L' }]);
  const remove = new TestButton();
  remove.matches.set('.remove-spec', remove);
  remove.matches.set('.spec-row', fragment);
  const click = new Event('click');
  Object.defineProperty(click, 'target', { value: remove });
  f.container.dispatchEvent(click);
  expect(fragment.remove).toHaveBeenCalledTimes(1);
  expect(active).toBe(f.add);
});

test('failed uploads and persistence leave image selection retryable and restore pending controls', async () => {
  const f = fixture();
  initWishlistForm(html(f.root));
  await settle();
  select(f.input, file());
  spyOn(WishlistImageClient, 'upload').mockRejectedValueOnce(
    new ApiError(503, 'Upload unavailable')
  );
  submit(f.form);
  await settle();
  expect(f.submit.disabled).toBe(false);
  expect(f.input.disabled).toBe(false);
  expect(WishlistClient.create).not.toHaveBeenCalled();
  spyOn(WishlistClient, 'create').mockRejectedValueOnce(new ApiError(503, 'Try again'));
  submit(f.form);
  await settle();
  expect(WishlistImageClient.upload).toHaveBeenCalledTimes(2);
  expect(f.submit.disabled).toBe(false);
  expect(f.preview.src).toBe('blob:test-1');
  submit(f.form);
  await settle();
  expect(WishlistClient.create).toHaveBeenLastCalledWith(
    expect.objectContaining(mapImageMetadata(metadata))
  );
  expect(browser.location.href).toBe('/andrii');
  expect(WishlistImageClient.upload).toHaveBeenCalledTimes(2);
});

test('image-removal updates retain null semantics and duplicate submits do not repeat persistence', async () => {
  const f = fixture('update', true);
  initWishlistForm(html(f.root));
  await settle();
  f.clear.dispatchEvent(new Event('click'));
  let resolve!: (result: { message: string }) => void;
  spyOn(WishlistClient, 'update').mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    })
  );
  submit(f.form);
  submit(f.form);
  await settle();
  expect(WishlistClient.update).toHaveBeenCalledTimes(1);
  expect(WishlistClient.update).toHaveBeenCalledWith(
    'item-id',
    expect.objectContaining({
      imageUrl: null,
      imagePublicId: null,
      imageWidth: null,
      imageHeight: null,
      imageFormat: null,
      imageBytes: null,
    }),
    'test-image-version'
  );
  resolve({ message: 'Item updated' });
  await settle();
  expect(WishlistImageClient.upload).not.toHaveBeenCalled();
});
