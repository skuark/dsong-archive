// The post's side column (podcast, players, Ficha) is sticky without scrolling inside (css/bundle.css):
// its height in --side-height, so one taller than the window sticks by its foot. Kept up to date as
// it changes (radio mode swaps the Ficha, tabs change the players' height).
(() => {
  const side = document.querySelector('.post-view__side');
  if (!side) return;
  new ResizeObserver(() => side.style.setProperty('--side-height', `${side.offsetHeight}px`)).observe(side);
})();
