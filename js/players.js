// Tabs for post players (WAI-ARIA tabs pattern). Players load when their tab is first shown,
// and switching tabs stops whatever was playing.
// Events are delegated from the document, so tabs replaced later (radio mode swaps them) keep working.
(function() {
  const panelOf = (tab) => document.getElementById(tab.getAttribute('aria-controls'));
  const tabsOf = (tab) => Array.from(tab.closest('.players__tabs').querySelectorAll('[role="tab"]'));

  function stop(panel) {
    const audio = panel.querySelector('audio');
    if (audio) audio.pause();
    // Reloading an iframe is the only portable way to stop a third-party player
    const iframe = panel.querySelector('iframe[src]');
    if (iframe) iframe.src = iframe.src;
  }

  function select(tab) {
    for (const other of tabsOf(tab)) {
      const active = other === tab;
      const panel = panelOf(other);
      if (!active && !panel.hidden) stop(panel);
      other.setAttribute('aria-selected', String(active));
      other.tabIndex = active ? 0 : -1;
      panel.hidden = !active;
    }
    const player = panelOf(tab).querySelector('[data-src]');
    if (player) {
      player.src = player.dataset.src;
      player.removeAttribute('data-src');
    }
  }

  document.addEventListener('click', (e) => {
    const tab = e.target.closest('.players__tabs [role="tab"]');
    if (tab) select(tab);
  });

  document.addEventListener('keydown', (e) => {
    const tab = e.target.closest('.players__tabs [role="tab"]');
    if (!tab) return;
    const tabs = tabsOf(tab);
    const i = tabs.indexOf(tab);
    const keys = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
    if (!(e.key in keys)) return;
    e.preventDefault();
    const next = tabs[(keys[e.key] + tabs.length) % tabs.length];
    next.focus();
    select(next);
  });
})();
