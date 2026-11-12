// The Ficha panel (pages/post.njk) is a manual popover, so the page stays usable beside it; manual
// popovers don't close on Esc by themselves. On document, so it also works after radio mode swaps the header.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = document.querySelector('.post-facts:popover-open');
  if (!open) return;
  open.hidePopover();
  document.querySelector('.post-facts-toggle')?.focus();
});
