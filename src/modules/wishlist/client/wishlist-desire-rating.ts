export function initDesireRating(root: HTMLElement): void {
  const options = Array.from(root.querySelectorAll<HTMLElement>('[data-desire-option]'));
  const inputs = options.map((option) => option.querySelector<HTMLInputElement>('input')!);
  const hearts = options.map((option) => option.querySelector<SVGElement>('[data-desire-heart]')!);
  const counter = root.querySelector<HTMLElement>('[data-desire-counter]')!;
  const rays = root.querySelector<SVGElement>('[data-desire-rays]');
  const reducedMotion = root.ownerDocument?.defaultView?.matchMedia(
    '(prefers-reduced-motion: reduce)'
  );
  let feedback: Animation[] = [];
  const stopFeedback = () => {
    feedback.forEach((animation) => animation.cancel());
    feedback = [];
  };
  reducedMotion?.addEventListener('change', stopFeedback);
  const selected = () => Number(inputs.find((input) => input.checked)?.value ?? 1);
  let committed = selected();
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
    inputs[index].addEventListener('change', () => {
      if (inputs[index].disabled || !inputs[index].checked) return;
      const value = selected();
      render(value);
      if (value === committed) return;
      committed = value;
      stopFeedback();
      // Previewing a rating stays quiet; only a committed choice receives a seal.
      if (!reducedMotion || reducedMotion.matches || !hearts[index].animate) return;
      feedback.push(
        hearts[index].animate(
          [
            { transform: 'scale(1)' },
            { transform: 'scale(1.16)', offset: 0.35 },
            { transform: 'scale(1)' },
          ],
          { duration: 260, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
        )
      );
      if (value === 5 && rays?.animate) {
        feedback.push(
          rays.animate(
            [
              { transform: 'scale(0.8)', opacity: 0 },
              { opacity: 0.65, offset: 0.3 },
              { transform: 'scale(1.08)', opacity: 0 },
            ],
            { duration: 360, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }
          )
        );
      }
    });
  });
  root.addEventListener('pointerleave', () => render(selected()));
  root.addEventListener('pointercancel', () => render(selected()));
  root.addEventListener('focusin', () => render(selected()));
  render(selected());
}
