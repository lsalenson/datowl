'use client';

import Lenis from 'lenis';
import { useEffect } from 'react';

// Page-wide motion: Lenis smooth scrolling (anchors included, offset by the sticky
// header) and fade-up reveals for every [data-reveal] element as it enters the screen.
export function Motion() {
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const lenis = reduced ? null : new Lenis({ autoRaf: true, lerp: 0.1, anchors: { offset: -49 } });

    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('in');
          io.unobserve(e.target);
        }),
      { rootMargin: '0px 0px -12% 0px' },
    );
    document.querySelectorAll('[data-reveal]').forEach((el) => io.observe(el));
    document.documentElement.classList.add('motion');

    return () => {
      io.disconnect();
      lenis?.destroy();
    };
  }, []);

  return null;
}
