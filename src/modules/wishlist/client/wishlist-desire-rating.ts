export function initDesireRating(root: HTMLElement): void {
  const options = Array.from(root.querySelectorAll<HTMLElement>('[data-desire-option]'));
  const inputs = options.map((option) => option.querySelector<HTMLInputElement>('input')!);
  const hearts = options.map((option) => option.querySelector<SVGElement>('[data-desire-heart]')!);
  const counter = root.querySelector<HTMLElement>('[data-desire-counter]')!;
  const selected = () => Number(inputs.find((input) => input.checked)?.value ?? 1);
  const render = (value: number) => {
    hearts.forEach((heart, index) => {
      heart.dataset.filled = String(index < value);
    });
    counter.textContent = `${value}/5`;
  };
  options.forEach((option, index) => {
    option.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'touch' && !inputs[index].disabled) render(index + 1);
    });
    inputs[index].addEventListener('change', () => render(selected()));
  });
  root.addEventListener('pointerleave', () => render(selected()));
  root.addEventListener('pointercancel', () => render(selected()));
  root.addEventListener('focusin', () => render(selected()));
  render(selected());
}
