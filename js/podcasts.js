// Podcast page (/archive/podcasts/): copy the feed URL, and newest/oldest order of the episode list.
(function() {
  const copy = document.querySelector('.podcast-hero__copy');
  if (copy && navigator.clipboard) {
    copy.hidden = false;
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(copy.dataset.feed);
        copy.textContent = 'Dirección copiada';
      } catch {
        copy.textContent = copy.dataset.feed;
      }
    });
  }

  const order = document.querySelector('.episodes__order');
  const list = document.getElementById('archive-table');
  if (!order || !list) return;
  order.hidden = false;
  order.addEventListener('click', (e) => {
    const button = e.target.closest('[data-order]');
    if (!button || button.getAttribute('aria-pressed') === 'true') return;
    for (const b of order.querySelectorAll('[data-order]')) b.setAttribute('aria-pressed', String(b === button));
    list.append(...Array.from(list.children).reverse());
  });
})();
