import { afterEach, beforeEach, expect, mock, spyOn, test } from 'bun:test';
import { initSizesEditor } from '../src/modules/sizes/sizes-editor';

class ElementStub extends EventTarget {
  dataset: Record<string, string> = {};
  hidden = false;
  disabled = false;
  value = '';
  name = '';
  textContent = '';
  focused = false;
  attributes = new Map<string, string>();
  children = new Map<string, ElementStub>();
  lists = new Map<string, ElementStub[]>();
  querySelector(selector: string) {
    return this.children.get(selector);
  }
  querySelectorAll(selector: string) {
    return this.lists.get(selector) ?? [];
  }
  setAttribute(key: string, value: string) {
    this.attributes.set(key, value);
  }
  removeAttribute(key: string) {
    this.attributes.delete(key);
  }
  focus() {
    this.focused = true;
  }
}

function editor(person = 'andrii') {
  const root = new ElementStub();
  root.dataset.sizesPerson = person;
  const form = new ElementStub();
  const edit = new ElementStub();
  const cancel = new ElementStub();
  const controls = new ElementStub();
  const status = new ElementStub();
  const save = new ElementStub();
  const fieldset = new ElementStub();
  const input = new ElementStub();
  input.name = 'chest';
  input.value = person === 'andrii' ? '92' : '85';
  const value = new ElementStub();
  value.textContent = input.value;
  root.children = new Map([
    ['[data-sizes-form]', form],
    ['[data-sizes-edit]', edit],
    ['[data-sizes-cancel]', cancel],
    ['[data-sizes-controls]', controls],
    ['[data-sizes-status]', status],
  ]);
  form.children = new Map([
    ['fieldset', fieldset],
    ['[type="submit"]', save],
  ]);
  form.lists = new Map([
    ['input', [input]],
    ['[data-sizes-value]', [value]],
  ]);
  initSizesEditor(root as unknown as HTMLElement);
  return { form, edit, cancel, controls, status, save, fieldset, input, value };
}

const click = (element: ElementStub) => element.dispatchEvent(new Event('click'));
const submit = (element: ElementStub) =>
  element.dispatchEvent(new Event('submit', { cancelable: true }));
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
let fetchMock: ReturnType<typeof spyOn<typeof globalThis, 'fetch'>>;
beforeEach(() => {
  fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
    Object.assign(async () => Response.json({ authenticated: true }), {
      preconnect: fetch.preconnect,
    })
  );
});
afterEach(() => mock.restore());

test('Edit focuses input; Cancel restores baseline without writes', async () => {
  const view = editor();
  click(view.edit);
  await tick();
  expect(view.input.hidden).toBe(false);
  expect(view.input.focused).toBe(true);
  view.input.value = '94.5';
  click(view.cancel);
  expect(view.input.value).toBe('92');
  expect(view.value.textContent).toBe('92');
  expect(view.controls.hidden).toBe(true);
  expect(view.edit.focused).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('invalid ranges stay editable and never send mutations', async () => {
  const view = editor();
  click(view.edit);
  await tick();
  for (const value of ['95-92', '0', '301', 'bad', '9'.repeat(21)]) {
    view.input.value = value;
    submit(view.form);
    await tick();
    expect(view.status.textContent).toContain('positive number');
    expect(view.input.value).toBe(value);
    expect(view.controls.hidden).toBe(false);
  }
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('save sends only changed values, blocks duplicate saves and updates the baseline', async () => {
  const view = editor();
  click(view.edit);
  await tick();
  view.input.value = '94.5';
  let resolve!: (response: Response) => void;
  fetchMock.mockResolvedValueOnce(Response.json({ authenticated: true }));
  fetchMock.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    })
  );
  submit(view.form);
  await tick();
  expect(view.save.textContent).toBe('Saving…');
  expect(view.fieldset.disabled).toBe(true);
  expect(view.cancel.disabled).toBe(true);
  submit(view.form);
  expect(fetchMock).toHaveBeenCalledTimes(3);
  const [url, options] = fetchMock.mock.calls[2];
  expect(url).toBe('/api/sizes/andrii');
  expect(options?.method).toBe('PATCH');
  expect(JSON.parse(String(options?.body))).toEqual({ chest: '94.5' });
  resolve(Response.json({ message: 'Measurements saved' }));
  await tick();
  expect(view.value.textContent).toBe('94.5');
  expect(view.status.textContent).toBe('Measurements saved.');
  click(view.edit);
  await tick();
  view.input.value = '96';
  click(view.cancel);
  expect(view.input.value).toBe('94.5');
});

for (const failure of [
  new Error('offline'),
  new Response('failure', { status: 500 }),
  new Response('expired', { status: 401 }),
]) {
  test(`failed save preserves edits and supports retry: ${failure instanceof Error ? failure.message : failure.status}`, async () => {
    const view = editor();
    click(view.edit);
    await tick();
    view.input.value = '94';
    fetchMock.mockResolvedValueOnce(Response.json({ authenticated: true }));
    if (failure instanceof Error) fetchMock.mockRejectedValueOnce(failure);
    else fetchMock.mockResolvedValueOnce(failure);
    submit(view.form);
    await tick();
    expect(view.input.value).toBe('94');
    expect(view.value.textContent).toBe('92');
    expect(view.status.textContent).toContain('Your edits are still here');
    expect(view.controls.hidden).toBe(false);
    expect(view.save.disabled).toBe(false);
    expect(view.fieldset.disabled).toBe(false);
    submit(view.form);
    await tick();
    expect(view.status.textContent).toBe('Measurements saved.');
    expect(view.value.textContent).toBe('94');
  });
}

test('independent editors preserve the other person’s unsaved edits', async () => {
  const andrii = editor();
  const juliette = editor('juliette');
  click(andrii.edit);
  await tick();
  click(juliette.edit);
  await tick();
  andrii.input.value = '94';
  juliette.input.value = '86';
  submit(andrii.form);
  await tick();
  expect(juliette.input.value).toBe('86');
  expect(juliette.controls.hidden).toBe(false);
  expect(juliette.value.textContent).toBe('85');
  submit(juliette.form);
  await tick();
  expect(fetchMock.mock.calls.at(-1)?.[0]).toBe('/api/sizes/juliette');
  expect(andrii.value.textContent).toBe('94');
});

test('unchanged Save closes without a mutation; access failures allow retry', async () => {
  const view = editor();
  fetchMock.mockRejectedValueOnce(new Error('offline'));
  click(view.edit);
  await tick();
  expect(view.status.textContent).toContain('Could not verify access');
  expect(view.edit.disabled).toBe(false);
  click(view.edit);
  await tick();
  submit(view.form);
  await tick();
  expect(view.status.textContent).toBe('No changes to save.');
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
