// "Show the proof": jump to the line that produced a number and make it light up.
export function showProof(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const details = el.closest("details");
  if (details) details.open = true;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  el.classList.remove("flash");
  void el.offsetWidth; // restart the animation
  el.classList.add("flash");
}
