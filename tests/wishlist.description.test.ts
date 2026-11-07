import { expect, test } from 'bun:test';
import { renderDescription } from '../src/modules/wishlist/utils/description-renderer';
import { formatSelection } from '../src/modules/wishlist/client/wishlist-description-editor';
import { parseCreateItem, parseUpdateItem } from '../src/modules/wishlist/wishlist.validation';
import { serializeWishlistForm } from '../src/modules/wishlist/client/wishlist-form-handler';

test('legacy text retains literal formatting, paragraphs, line breaks and functional URLs', () => {
  const html = renderDescription(
    'My *literal* size_guide\nSecond line\n\nSee https://example.test/item?a=1&b=2.'
  );
  expect(html).toContain('My *literal* size_guide<br>Second line');
  expect(html).toContain('<p>See <a href="https://example.test/item?a=1&amp;b=2"');
  expect(html).not.toContain('<em>');
  expect(renderDescription('https://example.test/item.')).toContain(
    'href="https://example.test/item"'
  );
});

test('Markdown supports only the requested subset with readable explicit labels', () => {
  const html = renderDescription(
    '**Strong** and *soft*\nNew line\n\n- One\n- Two\n\n1. First\n2. Second\n\n[Shop](https://example.test) and https://other.test',
    'markdown'
  );
  for (const fragment of [
    '<strong>Strong</strong>',
    '<em>soft</em>',
    '<br>',
    '<ul>',
    '<ol>',
    '>Shop</a>',
    'https://other.test',
  ])
    expect(html).toContain(fragment);
  const unsupported = renderDescription(
    '# Heading\n\n![alt](https://example.test/image)\n\n| a | b |',
    'markdown'
  );
  expect(unsupported).not.toMatch(/<(?:h1|img|table)\b/);
});

test.each([
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '[click](javascript:alert(1))',
  '[click](data:text/html,test)',
  '[click](vbscript:evil)',
  '[click](//evil.test)',
  '[click](mailto:a@b.test)',
  '[click](java&#x73;cript:alert(1))',
  '[click](javascript&#58;alert(1))',
  '<svg/onload=alert(1)>',
  '[click](https://example.test/\"onmouseover=\"bad)',
])('untrusted input never generates raw tags or unsafe link protocols: %s', (source) => {
  for (const format of ['plain', 'markdown'] as const) {
    const html = renderDescription(source, format);
    expect(html).not.toMatch(/<(?:script|img|svg)\b/i);
    for (const link of html.matchAll(/href="([^"]*)"/g)) expect(link[1]).toMatch(/^https?:\/\//i);
    expect(html).not.toMatch(/<[^>]+\son(?:error|load|mouseover)=/i);
  }
});

test('standalone references are compact, preserve destinations and deduplicate primary and inline links', () => {
  const url = 'https://www.market.test/product/very-long?variant=red&size=m';
  const html = renderDescription(
    `Notes\n\n${url}\n${url}\nhttps://other.test/item`,
    'markdown',
    url
  );
  expect(html).toContain('>market.test</a>');
  expect(html.match(/href=/g)).toHaveLength(2);
  expect(html).toContain(url.replace('&', '&amp;'));
  const labelled = renderDescription(`[My shop](${url})\n\n${url}`, 'markdown', url);
  expect(labelled).toContain('>My shop</a>');
  expect(labelled.match(/href=/g)).toHaveLength(1);
  expect(labelled).not.toContain('References');
  expect(renderDescription('', 'plain', 'javascript:evil')).toBe('');
});

test('new format marker is optional and validated; Markdown remains bounded plain source', () => {
  const source = '**Keep source** <script>literal</script>';
  expect(
    parseCreateItem({
      owner: 'me',
      topic: 'Topic',
      name: 'Name',
      description: source,
      descriptionFormat: 'markdown',
    })
  ).toMatchObject({ description: source, descriptionFormat: 'markdown' });
  expect(parseUpdateItem({ description: '*legacy*' })).toEqual({ description: '*legacy*' });
  expect(parseUpdateItem({ descriptionFormat: 'plain' })).toEqual({ descriptionFormat: 'plain' });
  for (const value of ['html', null, {}, 1])
    expect(() => parseUpdateItem({ descriptionFormat: value })).toThrow();
  expect(() =>
    parseUpdateItem({ description: 'x'.repeat(1025), descriptionFormat: 'markdown' })
  ).toThrow();
  expect(
    parseUpdateItem({ description: 'x'.repeat(1024), descriptionFormat: 'markdown' }).description
  ).toHaveLength(1024);
});

test('form sends explicit Markdown/plain modes without converting source', () => {
  const form = new FormData();
  form.set('owner', 'me');
  form.set('description', '**Notes**');
  expect(serializeWishlistForm(form, [])).toMatchObject({
    description: '**Notes**',
    descriptionFormat: 'plain',
  });
  form.set('descriptionFormat', 'markdown');
  expect(serializeWishlistForm(form, [])).toMatchObject({
    description: '**Notes**',
    descriptionFormat: 'markdown',
  });
});

test('formatting preserves surrounding text and selects editable labels', () => {
  expect(formatSelection('hello world!', 6, 11, 'bold')).toEqual({
    value: 'hello **world**!',
    start: 8,
    end: 13,
  });
  expect(formatSelection('hello', 0, 5, 'italic').value).toBe('*hello*');
  expect(formatSelection('a\nb', 0, 3, 'list').value).toBe('- a\n- b');
  expect(formatSelection('shop', 0, 4, 'link')).toEqual({
    value: '[shop](https://)',
    start: 1,
    end: 5,
  });
  expect(formatSelection('', 0, 0, 'bold')).toEqual({ value: '**text**', start: 2, end: 6 });
});

test('list formatting prefixes complete selected lines, including a caret inside a line', () => {
  expect(formatSelection('Before\nSome words\nAfter', 10, 12, 'list').value).toBe(
    'Before\n- Some words\nAfter'
  );
  expect(formatSelection('', 0, 0, 'list').value).toBe('- List item');
});
