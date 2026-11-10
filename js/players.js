// Tabs for post players (WAI-ARIA tabs pattern). Players load when their tab is first shown,
// and switching tabs stops whatever was playing.
(function() {
  const tablist = document.querySelector('.players__tabs');
  if (!tablist) return;
  const tabs = Array.from(tablist.querySelectorAll('[role="tab"]'));
  const panelOf = (tab) => document.getElementById(tab.getAttribute('aria-controls'));

  function stop(panel) {
    const audio = panel.querySelector('audio');
    if (audio) audio.pause();
    // Reloading an iframe is the only portable way to stop a third-party player
    const iframe = panel.querySelector('iframe[src]');
    if (iframe) iframe.src = iframe.src;
  }

  function select(tab) {
    for (const other of tabs) {
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

  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', (e) => {
      const keys = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 };
      if (!(e.key in keys)) return;
      e.preventDefault();
      const next = tabs[(keys[e.key] + tabs.length) % tabs.length];
      next.focus();
      select(next);
    });
  });
})();
