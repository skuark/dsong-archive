// Podcast page (/archive/podcasts/): copy the feed URL, play an episode in place (one audio element for
// the whole list) and newest/oldest order of the episode list.
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

  const buttons = document.querySelectorAll('.episode__play');
  const audio = new Audio();
  audio.preload = 'none';
  let current = null;
  const label = (button, playing) => button.setAttribute('aria-label', button.getAttribute('aria-label').replace(/^(Reproducir|Pausar)/, playing ? 'Pausar' : 'Reproducir'));
  const show = (button, playing) => {
    button.setAttribute('aria-pressed', String(playing));
    label(button, playing);
  };
  audio.addEventListener('play', () => current && show(current, true));
  audio.addEventListener('pause', () => current && show(current, false));
  audio.addEventListener('ended', () => current && show(current, false));
  for (const button of buttons) {
    button.hidden = false;
    button.addEventListener('click', () => {
      if (current === button) {
        if (audio.paused) audio.play(); else audio.pause();
        return;
      }
      if (current) show(current, false);
      current = button;
      audio.src = button.dataset.src;
      audio.play().catch(() => show(button, false));
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
