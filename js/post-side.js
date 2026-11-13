// The post's side column (players, podcast, Ficha) is sticky without scrolling inside (css/bundle.css).
// One taller than the window moves with the page, both ways, between two stops: its head under the top
// of the window and its foot over the bottom. Its sticky top follows the scroll,
// clamped between them, so it never jumps when the direction changes.
(() => {
  const side = document.querySelector('.post-view__side');
  if (!side) return;
  const gap = 24;   // 1.5rem, as in the CSS
  let top = null;
  let lastY = scrollY;
  let frame = 0;
  const stops = () => {
    return { start: gap, end: Math.min(gap, innerHeight - side.offsetHeight - gap) };
  };
  function update() {
    frame = 0;
    // Only in the desktop split view (sticky); on narrow screens the column follows the text
    if (getComputedStyle(side).position !== 'sticky') { side.style.removeProperty('--side-top'); top = null; lastY = scrollY; return; }
    const { start, end } = stops();
    const delta = scrollY - lastY;
    lastY = scrollY;
    // Where it is now: stuck at the previous top (then it moves by the scroll) or in its own place in the
    // page (near the top of the article: it stays there)
    const now = side.getBoundingClientRect().top;
    const stuck = top !== null && Math.abs(now - top) < 1;
    top = Math.max(end, Math.min(start, stuck ? now - delta : now));
    side.style.setProperty('--side-top', `${Math.round(top)}px`);
  }
  const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule);
  // Its height changes (radio mode swaps the Ficha and fills the players box, tabs change the players)
  new ResizeObserver(schedule).observe(side);
  new MutationObserver(schedule).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  update();
})();
