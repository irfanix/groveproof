// Scroll reveal: children marked data-reveal drop in one by one, top to bottom,
// when they scroll into view. Off for people who prefer reduced motion.
import { useEffect } from "react";

export function useReveal(ref) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    const items = [...root.querySelectorAll("[data-reveal]")];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("reveal-in"));
      return;
    }
    items.forEach((el) => el.classList.add("reveal"));
    const io = new IntersectionObserver((entries) => {
      entries
        .filter((e) => e.isIntersecting)
        .sort((a, b) => items.indexOf(a.target) - items.indexOf(b.target))
        .forEach((e, k) => {
          io.unobserve(e.target);
          e.target.style.animationDelay = `${k * 140}ms`;
          e.target.classList.add("reveal-in");
        });
    }, { threshold: 0.25, rootMargin: "0px 0px -6% 0px" });
    items.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [ref]);
}
