// Gentle motion for the public pages: sections fade up as they come into view and night strips
// fill cell by cell. Nothing moves for people who ask for reduced motion, and without
// IntersectionObserver everything simply shows (content is never hidden without JS).
const reduced = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// Restarts the cell-by-cell fill of a strip (each child gets its own small delay).
export function playCells(container) {
  if (!container || reduced()) return;
  [...container.children].forEach((child, i) => child.style.setProperty('--i', String(i)));
  container.classList.remove('cells-play');
  void container.offsetWidth; // restart the animation
  container.classList.add('cells-play');
}

// Fades each element up the first time it enters the viewport; `onShow` runs then.
export function reveal(elements, onShow = () => {}) {
  const list = [...elements].filter(Boolean);
  if (reduced() || !('IntersectionObserver' in window)) {
    list.forEach((element) => onShow(element));
    return;
  }
  document.documentElement.classList.add('motion');
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('in');
      observer.unobserve(entry.target);
      onShow(entry.target);
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
  for (const element of list) {
    element.classList.add('reveal');
    observer.observe(element);
  }
}

// A short amber ring on the place a link took people to, once the smooth scroll has landed.
export function highlight(element) {
  if (!element || reduced()) return;
  element.classList.remove('arrive');
  void element.offsetWidth;
  element.classList.add('arrive');
}
