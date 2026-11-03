import { expect, test } from 'bun:test';
import { initDesireRating } from '../src/modules/wishlist/client/wishlist-desire-rating';

// Native radio selection and keyboard navigation are verified in Playwright.
class RatingElement extends EventTarget {
  dataset: Record<string, string> = {};
  textContent = '';
  value = '';
  checked = false;
  disabled = false;
  children = new Map<string, RatingElement>();
  options: RatingElement[] = [];
  querySelector(selector: string) {
    return this.children.get(selector) ?? null;
  }
  querySelectorAll() {
    return this.options;
  }
}
function fixture(value = 1) {
  const root = new RatingElement();
  const counter = new RatingElement();
  const inputs = Array.from({ length: 5 }, (_, index) => {
    const input = new RatingElement();
    input.value = String(index + 1);
    input.checked = index + 1 === value;
    return input;
  });
  const hearts = inputs.map(() => new RatingElement());
  root.options = inputs.map((input, index) => {
    const option = new RatingElement();
    option.children.set('input', input);
    option.children.set('[data-desire-heart]', hearts[index]);
    return option;
  });
  root.children.set('[data-desire-counter]', counter);
  initDesireRating(root as unknown as HTMLElement);
  const hover = (value: number, pointerType = 'mouse') => {
    const event = new Event('pointerenter');
    Object.defineProperty(event, 'pointerType', { value: pointerType });
    root.options[value - 1].dispatchEvent(event);
  };
  const select = (value: number) => {
    inputs.forEach((input, index) => {
      input.checked = index + 1 === value;
    });
    inputs[value - 1].dispatchEvent(new Event('change'));
  };
  const expectValue = (value: number) => {
    expect(counter.textContent).toBe(`${value}/5`);
    expect(hearts.map((heart) => heart.dataset.filled)).toEqual(
      hearts.map((_, index) => String(index < value))
    );
  };
  return { root, inputs, hover, select, expectValue };
}
test('new ratings start at one; edit ratings retain their selection', () => {
  fixture().expectValue(1);
  for (let value = 1; value <= 5; value++) fixture(value).expectValue(value);
});
test('hover previews cumulative hearts and counter without changing the submitted radio value', () => {
  const rating = fixture(2);
  for (let value = 1; value <= 5; value++) {
    rating.hover(value);
    rating.expectValue(value);
    expect(rating.inputs.find((input) => input.checked)?.value).toBe('2');
  }
  rating.root.dispatchEvent(new Event('pointerleave'));
  rating.expectValue(2);
});
test('selection commits every level and becomes the value restored after hover', () => {
  const rating = fixture();
  for (let value = 1; value <= 5; value++) {
    rating.select(value);
    rating.expectValue(value);
    rating.hover(value === 5 ? 1 : 5);
    rating.root.dispatchEvent(new Event('pointerleave'));
    rating.expectValue(value);
  }
});
test('touch does not leave a hover preview and native changes update the control', () => {
  const rating = fixture();
  rating.hover(5, 'touch');
  rating.expectValue(1);
  rating.select(4);
  rating.root.dispatchEvent(new Event('pointercancel'));
  rating.expectValue(4);
});
test('keyboard focus restores the saved value and disabled options do not preview', () => {
  const rating = fixture(3);
  rating.hover(5);
  rating.root.dispatchEvent(new Event('focusin'));
  rating.expectValue(3);
  rating.inputs[4].disabled = true;
  rating.hover(5);
  rating.expectValue(3);
  rating.select(4);
  rating.expectValue(4);
});
