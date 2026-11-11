// Exposes the sticky post header's height as --post-header-height, so the sticky players column
// can sit right under it (titles may wrap to several lines).
(function() {
  const header = document.querySelector('.post-view__header');
  if (!header || !('ResizeObserver' in window)) return;
  new ResizeObserver(() => {
    document.documentElement.style.setProperty('--post-header-height', header.offsetHeight + 'px');
  }).observe(header);
})();
