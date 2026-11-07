import MarkdownIt from 'markdown-it';
import { normalizeDescriptionUrl, parseDescriptionSegments } from './description';
import type { DescriptionFormat } from '../wishlist.types';

const markdown = new MarkdownIt('zero', { html: false, breaks: true, linkify: true }).enable([
  'newline',
  'escape',
  'entity',
  'emphasis',
  'list',
  'link',
  'autolink',
  'linkify',
]);
markdown.linkify.set({ fuzzyLink: false, fuzzyEmail: false });
markdown.validateLink = (url) => /^https?:\/\//i.test(url) && normalizeDescriptionUrl(url) !== null;
markdown.renderer.rules.link_open = (tokens, index, options, _env, renderer) => {
  tokens[index].attrSet('target', '_blank');
  tokens[index].attrSet('rel', 'noopener noreferrer');
  return renderer.renderToken(tokens, index, options);
};
const escape = markdown.utils.escapeHtml;

export function referenceLabel(href: string): string {
  return new URL(href).hostname.replace(/^www\./, '');
}

/** Only this module generates HTML for descriptions; raw HTML is always escaped. */
export function renderDescription(
  source = '',
  format: DescriptionFormat = 'plain',
  referenceUrl?: string
) {
  const references = new Map<string, string>();
  const primary = referenceUrl ? normalizeDescriptionUrl(referenceUrl) : null;
  const prose = source
    .split(/\r?\n/)
    .filter((line) => {
      const value = line.trim();
      // Extract whole-line URLs only. Inline author labels remain part of the prose.
      if (!/^(?:https?:\/\/|www\.)\S+$/i.test(value)) return true;
      // Keep legacy punctuation handling: a sentence-ending period is not part of its link.
      if (format === 'plain') {
        const segments = parseDescriptionSegments(value);
        if (segments.length !== 1) return true;
      }
      const href = normalizeDescriptionUrl(value);
      if (!href) return true;
      references.set(href, referenceLabel(href));
      return false;
    })
    .join('\n');
  const html =
    format === 'markdown'
      ? markdown.render(prose)
      : prose
          .split(/\n\s*\n/)
          .filter(Boolean)
          .map(
            (paragraph) =>
              `<p>${parseDescriptionSegments(paragraph)
                .map((segment) =>
                  segment.type === 'link'
                    ? `<a href="${escape(segment.href)}" target="_blank" rel="noopener noreferrer">${escape(segment.value)}</a>`
                    : escape(segment.value).replace(/\n/g, '<br>')
                )
                .join('')}</p>`
          )
          .join('\n');
  // A reference already linked in prose needs no second appearance below it.
  const linked = new Set(Array.from(html.matchAll(/href="([^"]*)"/g), (match) => match[1]));
  if (primary && !linked.has(escape(primary))) references.set(primary, referenceLabel(primary));
  for (const href of references.keys()) if (linked.has(escape(href))) references.delete(href);
  const links = Array.from(
    references,
    ([href, label]) =>
      `<li><a href="${escape(href)}" target="_blank" rel="noopener noreferrer">${escape(label)}</a></li>`
  ).join('');
  return `${html}${links ? `<section aria-label="References"><h3>References</h3><ul>${links}</ul></section>` : ''}`;
}
