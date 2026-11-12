// Podcast page (/archive/podcasts/): copy the feed URL, play an episode in place (one audio element for
// the whole list), radio mode (episodes one after another) and newest/oldest order of the episode list.
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

  const buttons = [...document.querySelectorAll('.episode__play')];
  const audio = new Audio();
  audio.preload = 'none';
  let current = null;
  const label = (button, playing) => button.setAttribute('aria-label', button.getAttribute('aria-label').replace(/^(Reproducir|Pausar)/, playing ? 'Pausar' : 'Reproducir'));
  const show = (button, playing) => {
    button.setAttribute('aria-pressed', String(playing));
    label(button, playing);
  };
  function play(button) {
    if (current) {
      show(current, false);
      current.closest('.episode').classList.remove('episode--current');
    }
    current = button;
    current.closest('.episode').classList.add('episode--current');
    audio.src = button.dataset.src;
    audio.play().catch(() => show(button, false));
    updateBar();
  }
  audio.addEventListener('play', () => current && show(current, true));
  audio.addEventListener('pause', () => current && show(current, false));
  audio.addEventListener('ended', () => {
    if (current) show(current, false);
    if (bar) skip();
  });
  for (const button of buttons) {
    button.hidden = false;
    button.addEventListener('click', () => {
      if (current === button) {
        if (audio.paused) audio.play(); else audio.pause();
        return;
      }
      play(button);
    });
  }

  // Radio mode: one episode after another in the page's order (newest/oldest, and its filter), with a bar
  // on top like the posts' radio (js/radio.js): previous, next, what comes next and stop.
  const start = document.querySelector('.podcast-hero__radio');
  let bar = null;
  let upcoming = null;
  const played = [];
  const titleOf = (button) => button.closest('.episode').querySelector('.episode__title');
  const visible = () => buttons.filter((button) => !button.closest('.episode').hidden);
  function pickNext() {
    const list = visible();
    const i = list.indexOf(current);
    return list[i + 1] ?? null;
  }
  function skip() {
    const next = upcoming ?? pickNext();
    if (!next) { stop(); return; }
    if (current) played.push(current);
    play(next);
  }
  function updateBar() {
    if (!bar) return;
    upcoming = pickNext();
    const now = bar.querySelector('.radio-bar__next');
    // "Suena <title> · después, <title>": links copied from the list (DOM nodes, no HTML strings)
    const link = (button) => { const a = document.createElement('a'); a.href = titleOf(button).getAttribute('href'); a.textContent = titleOf(button).textContent; return a; };
    now.replaceChildren(...(current ? ['Suena ', link(current), ...(upcoming ? [' · después, ', link(upcoming)] : [])] : []));
    bar.querySelector('[data-action="previous"]').disabled = !played.length;
    bar.querySelector('[data-action="skip"]').disabled = !upcoming;
  }
  function stop() {
    audio.pause();
    bar?.remove();
    bar = null;
    if (start) start.hidden = false;
  }
  function showBar() {
    bar = document.createElement('div');
    bar.className = 'radio-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Podcast en modo radio');
    bar.innerHTML = `
      <span class="kicker radio-bar__label">Radio · Podcast</span>
      <span class="radio-bar__actions">
        <button class="radio-bar__button radio-bar__button--icon" type="button" data-action="previous" aria-label="Anterior" disabled><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg></button>
        <button class="radio-bar__button radio-bar__button--icon" type="button" data-action="skip" aria-label="Siguiente"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg></button>
      </span>
      <span class="radio-bar__next"></span>
      <button class="radio-bar__button radio-bar__button--stop" type="button" data-action="stop" aria-label="Salir del modo radio">×</button>`;
    bar.addEventListener('click', (e) => {
      const target = e.target.closest('[data-action]');
      const action = target?.dataset.action;
      if (action === 'skip') skip();
      if (action === 'previous' && played.length) play(played.pop());
      if (action === 'stop') stop();
    });
    document.body.prepend(bar);
  }
  if (start) {
    start.hidden = false;
    start.addEventListener('click', () => {
      start.hidden = true;
      showBar();
      // From the episode playing, else the first one in the list
      if (current) { updateBar(); if (audio.paused) audio.play(); } else if (visible()[0]) play(visible()[0]);
    });
  }

  // A click on an episode outside its links and play button opens its post (new tab with Ctrl/⌘)
  document.getElementById('archive-table')?.addEventListener('click', (event) => {
    if (event.target.closest('a, button') || String(getSelection())) return;
    const link = event.target.closest('.episode')?.querySelector('.episode__title');
    if (!link) return;
    if (event.ctrlKey || event.metaKey) window.open(link.href, '_blank');
    else location.href = link.href;
  });

  const order = document.querySelector('.episodes__order');
  const list = document.getElementById('archive-table');
  if (!order || !list) return;
  order.hidden = false;
  order.addEventListener('click', (e) => {
    const button = e.target.closest('[data-order]');
    if (!button || button.getAttribute('aria-pressed') === 'true') return;
    for (const b of order.querySelectorAll('[data-order]')) b.setAttribute('aria-pressed', String(b === button));
    list.append(...Array.from(list.children).reverse());
    updateBar();
  });
})();
