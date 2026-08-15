// Subtle motion: parallax on atmosphere + CTA hover glow via CSS vars
const atmosphere = document.querySelector(".atmosphere");
window.addEventListener(
  "pointermove",
  (e) => {
    if (!atmosphere) return;
    const x = (e.clientX / window.innerWidth - 0.5) * 12;
    const y = (e.clientY / window.innerHeight - 0.5) * 8;
    atmosphere.style.transform = `translate(${x}px, ${y}px)`;
  },
  { passive: true },
);

document.querySelectorAll(".btn").forEach((btn) => {
  btn.addEventListener("pointerenter", () => {
    btn.style.boxShadow = "0 0 0 1px #B87333";
  });
  btn.addEventListener("pointerleave", () => {
    btn.style.boxShadow = "none";
  });
});
