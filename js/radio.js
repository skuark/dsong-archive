// Radio mode: plays posts one after another, in chronological or random order (menu "Radio" ->
// /radio/ -> a random post with ?radio=aleatoria), or the posts an archive table shows, in its order
// (js/archive-radio.js -> the first one with ?radio=lista), without reloading the page, so the music keeps
// going and each post's text is shown next to it. Only posts with a YouTube video are in it.
// There's no bar of its own: the post's players box becomes the radio (its head, where the list comes
// from, the video, previous/next, what comes next and the order), sticky at the top on phones.
// A page navigation would stop playback (and browsers don't allow autoplay with sound on the new
// page), so the article is swapped in place: header, text, comments, navigation and the players'
// tabs are replaced, while the live YouTube panel stays where it is (moving an iframe in the DOM
// reloads it) and loads the next video through its API. The URL is updated
// with pushState.
(function() {
  const toggle = document.querySelector('.radio-toggle');
  if (!toggle) return;
  toggle.hidden = false;

  // The button at the foot of the players: starts radio mode; while it plays, says so
  const toggleLabel = toggle.querySelector('.radio-toggle__label');
  const startLabel = toggleLabel?.textContent;
  function setToggle(on) {
    toggle.disabled = on;
    toggle.classList.toggle('radio-toggle--on', on);
    if (toggleLabel) toggleLabel.textContent = on ? 'Sonando en modo radio' : startLabel;
  }

  // "Radio" in the header menu is the current item while it plays (instead of "Archivo")
  const radioLink = document.querySelector('.header__menu a[href="/radio/"]');
  const pageLink = document.querySelector('.header__menu [aria-current="page"]');
  function setMenu(on) {
    if (on) {
      pageLink?.removeAttribute('aria-current');
      radioLink?.setAttribute('aria-current', 'page');
      radioLink?.classList.add('is-playing');
    } else {
      radioLink?.removeAttribute('aria-current');
      radioLink?.classList.remove('is-playing');
      pageLink?.setAttribute('aria-current', 'page');
    }
  }
  let progressTimer = null;

  const idOf = (path) => (path.match(/\/archive\/([^/]+)\.html$/) || [])[1];
  let list = null;          // [[id, title, youtubeCode], ...] from /radio.json
  let active = false;
  let box = null;           // the radio's parts in the players box: { head, from, controls }
  let currentId = idOf(location.pathname);
  const mode = new URLSearchParams(location.search).get('radio');
  let shuffle = mode === 'aleatoria';
  // An archive table's list ({ ids, name }, js/archive-radio.js): radio mode plays only those, in that order
  let scope = null;
  if (mode === 'lista') {
    try { scope = JSON.parse(sessionStorage.getItem('dsong-radio-list')); } catch { /* no storage */ }
  }
  const played = new Set();
  const previous = [];      // entries already played in this radio session, for "Anterior"
  let upcoming = null;      // next entry, chosen in advance so the box can show it
  let advancing = false;
  // Post pages already fetched (the next one is fetched in advance: its author for the box, a quicker swap)
  const pages = new Map();
  function loadDoc(id) {
    if (!pages.has(id)) {
      pages.set(id, fetch(`/archive/${id}.html`)
        .then((res) => { if (!res.ok) throw new Error(res.status); return res.text(); })
        .then((html) => new DOMParser().parseFromString(html, 'text/html'))
        .catch((error) => { pages.delete(id); throw error; }));
    }
    return pages.get(id);
  }

  let youtube = null;       // YT.Player on the live #panel-youtube iframe
  let playing = false;      // the current song has started
  let everPlayed = false;   // some song started: autoplay works in this browser
  let watchTimer = null;

  const indexOf = (id) => list.findIndex((entry) => entry[0] === id);

  function pickNext() {
    if (shuffle) {
      let pool = list.filter((entry) => !played.has(entry[0]) && entry[0] !== currentId);
      if (!pool.length) { played.clear(); pool = list.filter((entry) => entry[0] !== currentId); }
      return pool[Math.floor(Math.random() * pool.length)];
    }
    // Ids start with the date, so for a post not in the list the next one is the first greater id
    const i = indexOf(currentId);
    return i >= 0 ? list[i + 1] : list.find((entry) => entry[0] > currentId);
  }

  function loadScript(src) {
    const script = document.createElement('script');
    script.src = src;
    document.head.append(script);
  }

  let youtubeApi = null;
  function loadYoutubeApi() {
    if (window.YT && window.YT.Player) return Promise.resolve();
    youtubeApi = youtubeApi || new Promise((resolve) => {
      const before = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (before) before(); resolve(); };
      loadScript('https://www.youtube.com/iframe_api');
    });
    return youtubeApi;
  }

  // Shows a player's tab and panel. Other panels are hidden; those without a live player are
  // stopped the way players.js does it (the live ones are paused through their API instead).
  function selectPanel(name) {
    const players = document.querySelector('.players');
    players.querySelectorAll('[role="tab"]').forEach((tab) => {
      const on = tab.id === `tab-${name}`;
      tab.setAttribute('aria-selected', String(on));
      tab.tabIndex = on ? 0 : -1;
    });
    players.querySelectorAll('.players__panel').forEach((panel) => {
      const on = panel.id === `panel-${name}`;
      if (!on && !panel.hidden && !isLive(panel)) {
        panel.querySelector('audio')?.pause();
        const iframe = panel.querySelector('iframe[src]');
        if (iframe) iframe.src = iframe.src;
      }
      panel.hidden = !on;
    });
  }

  const isLive = (panel) => panel.id === 'panel-youtube' && youtube;

  async function ensureYoutube() {
    if (youtube) return youtube;
    await loadYoutubeApi();
    const iframe = document.querySelector('#panel-youtube iframe');
    // A panel not shown yet keeps its URL in data-src: the API player must be created once the
    // iframe has loaded (or playVideo gets lost)
    if (iframe.hasAttribute('data-src')) {
      const loaded = new Promise((resolve) => iframe.addEventListener('load', resolve, { once: true }));
      iframe.src = iframe.dataset.src;
      iframe.removeAttribute('data-src');
      await loaded;
    }
    return new Promise((resolve) => {
      const player = new YT.Player(iframe, {
        events: {
          onReady: () => { youtube = player; resolve(player); },
          onStateChange: (e) => {
            if (!active) return;
            if (e.data === YT.PlayerState.PLAYING) started();
            if (e.data === YT.PlayerState.ENDED) advance();
          },
          // Removed or non-embeddable video: skip it
          onError: () => { if (active) advance(); },
        },
      });
    });
  }

  function started() {
    playing = true;
    everPlayed = true;
    clearTimeout(watchTimer);
    setNeedsClick(false);
  }

  // If the song doesn't start, the browser may be blocking playback with sound (always possible
  // arriving from the menu, with no click on this page yet): the box offers a "Start" button.
  function watch() {
    playing = false;
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      if (playing || !active) return;
      setNeedsClick(true);
    }, everPlayed ? 10000 : 3000);
  }

  async function play(entry) {
    selectPanel('youtube');
    watch();
    const player = await ensureYoutube();
    if (player.getVideoData?.().video_id === entry[2]) player.playVideo();
    else player.loadVideoById(entry[2]);
  }

  async function start() {
    toggle.disabled = true;
    try {
      list = list || await (await fetch('/radio.json')).json();
      if (scope) {
        const byId = new Map(list.map((entry) => [entry[0], entry]));
        list = scope.ids.map((id) => byId.get(id)).filter(Boolean);
      }
    } catch {
      toggle.disabled = false;
      return;
    }
    const entry = list[indexOf(currentId)];
    toggle.disabled = false;
    if (!entry) return;
    active = true;
    played.add(currentId);
    upcoming = pickNext();
    setToggle(true);
    showBox();
    // Drop ?radio=aleatoria so a reload doesn't restart it
    if (location.search) history.replaceState(history.state, '', location.pathname);
    try {
      await play(entry);
    } catch {
      stop();
    }
  }

  function stop() {
    active = false;
    clearTimeout(watchTimer);
    // The live panel, if this post has no YouTube tab (it can't happen now, but a swap may fail), goes
    // away, which also stops it
    if (!document.getElementById('tab-youtube')) document.getElementById('panel-youtube')?.remove();
    youtube = null;
    // Started again from a post's button: the whole archive, not the table's list
    if (scope) { scope = null; list = null; }
    hideBox();
    setMenu(false);
    document.body.classList.remove('radio-on');
    setToggle(false);
  }

  // Replaces the current post with the one parsed from `doc`, keeping the live player panels.
  function swap(doc) {
    const current = document.querySelector('.post-view');
    const next = doc.querySelector('.post-view');

    current.querySelector('.post-view__crumbs').innerHTML = next.querySelector('.post-view__crumbs').innerHTML;
    current.querySelector('.post-view__header').innerHTML = next.querySelector('.post-view__header').innerHTML;
    current.querySelector('.post-view__content').replaceWith(document.importNode(next.querySelector('.post-view__content'), true));

    current.querySelector('.post-view__comments')?.remove();
    const comments = next.querySelector('.post-view__comments');
    if (comments) current.querySelector('.post-view__side').after(document.importNode(comments, true));

    // Players: new tabs; panels without a live player are replaced by the new post's ones, which
    // wait in data-src, hidden (play() shows the right one). Live panels stay in place.
    const players = current.querySelector('.players');
    const nextPlayers = next.querySelector('.players');
    players.querySelector('.players__tabs').innerHTML = nextPlayers.querySelector('.players__tabs').innerHTML;
    players.querySelectorAll('.players__panel').forEach((panel) => { if (!isLive(panel)) panel.remove(); });
    for (const panel of nextPlayers.querySelectorAll('.players__panel')) {
      if (document.getElementById(panel.id)) continue;
      const copy = document.importNode(panel, true);
      copy.querySelectorAll('[src]').forEach((el) => {
        el.dataset.src = el.getAttribute('src');
        el.removeAttribute('src');
      });
      copy.hidden = true;
      // Before the radio's controls, which stay at the foot of the box
      players.insertBefore(copy, box?.controls ?? null);
    }

    // Podcast block (only some posts have one): in the side column, under the players
    current.querySelector('.podcast')?.remove();
    const podcast = next.querySelector('.podcast');
    if (podcast) current.querySelector('.post-view__side .players').after(document.importNode(podcast, true));

    // Festival series, then the Ficha: last in the side column, under the players
    current.querySelector('.series')?.remove();
    const series = next.querySelector('.series');
    if (series) current.querySelector('.post-view__side').append(document.importNode(series, true));

    current.querySelector('.post-facts')?.remove();
    const facts = next.querySelector('.post-facts');
    if (facts) current.querySelector('.post-view__side').append(document.importNode(facts, true));

    for (const position of ['top', 'bottom']) {
      const nav = doc.querySelector(`.post-nav--${position}`);
      if (nav) document.querySelector(`.post-nav--${position}`)?.replaceWith(document.importNode(nav, true));
    }

    document.title = doc.title;
    const canonical = doc.querySelector('link[rel="canonical"]');
    if (canonical) document.querySelector('link[rel="canonical"]')?.setAttribute('href', canonical.getAttribute('href'));
  }

  // `back`: going to the previous song, so the current one isn't added to the history
  async function advance(entry, { back = false } = {}) {
    if (advancing) return;
    advancing = true;
    try {
      entry = entry || upcoming;
      while (entry && active) {
        try {
          const doc = await loadDoc(entry[0]);
          pages.delete(entry[0]);
          if (!active) return;
          const leaving = list[indexOf(currentId)];
          swap(doc);
          if (!back && leaving) previous.push(leaving);
          break;
        } catch {
          // Page not found: skip this one
          currentId = entry[0];
          played.add(entry[0]);
          entry = pickNext();
        }
      }
      if (!entry || !active) { stop(); return; }
      currentId = entry[0];
      played.add(entry[0]);
      upcoming = pickNext();
      history.pushState({ radio: true }, '', `/archive/${entry[0]}.html`);
      updateBox();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await play(entry);
    } finally {
      advancing = false;
    }
  }

  function showBox() {
    const players = document.querySelector('.players');
    players.classList.add('players--radio');
    const head = document.createElement('div');
    head.className = 'radio-box__head';
    head.innerHTML = `
      <span class="radio-box__title"><span class="kicker radio-box__label">Radio</span><span class="radio-box__position"></span><span class="radio-box__scope"></span></span>
      <span class="radio-box__order radio-box__order--head" role="radiogroup" aria-label="Orden">
          <button class="radio-box__order-button" type="button" role="radio" data-action="order" data-shuffle="false" aria-checked="true" aria-label="En orden"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg><span class="radio-box__text">En orden</span></button>
          <button class="radio-box__order-button" type="button" role="radio" data-action="order" data-shuffle="true" aria-checked="false" aria-label="Al azar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg><span class="radio-box__text">Al azar</span></button>
        </span>
      <button class="radio-box__stop" type="button" data-action="stop" aria-label="Salir del modo radio">×</button>`;
    let from = null;
    if (scope?.name) {
      from = document.createElement('div');
      from.className = 'radio-box__from';
      from.append('Desde ');
      const link = document.createElement(scope.url ? 'a' : 'span');
      if (scope.url) link.href = scope.url;
      link.textContent = scope.name;
      from.append(link);
      head.querySelector('.radio-box__scope').textContent = ` · ${scope.name}`;
    }
    const controls = document.createElement('div');
    controls.className = 'radio-box';
    controls.innerHTML = `
      <span class="radio-box__progress" aria-hidden="true"><span></span></span>
      <button class="radio-box__start" type="button" data-action="play" hidden><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg>Empezar</button>
      <div class="radio-box__nav">
        <button class="radio-box__button radio-box__button--previous" type="button" data-action="previous" aria-label="Anterior" disabled><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6 5h2v14H6zM20 5v14L9 12z"/></svg><span class="radio-box__text">Anterior</span></button>
        <div class="radio-box__next" aria-live="polite"></div>
        <button class="radio-box__button radio-box__button--skip" type="button" data-action="skip" aria-label="Siguiente"><span class="radio-box__text">Siguiente</span><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg></button>
      </div>
      <span class="radio-box__order radio-box__order--foot" role="radiogroup" aria-label="Orden">
          <button class="radio-box__order-button" type="button" role="radio" data-action="order" data-shuffle="false" aria-checked="true" aria-label="En orden"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10"/></svg><span class="radio-box__text">En orden</span></button>
          <button class="radio-box__order-button" type="button" role="radio" data-action="order" data-shuffle="true" aria-checked="false" aria-label="Al azar"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/></svg><span class="radio-box__text">Al azar</span></button>
        </span>`;
    players.prepend(head);
    if (from) head.after(from);
    players.append(controls);
    box = { head, from, controls };
    for (const part of [head, controls]) part.addEventListener('click', onBoxClick);
    // How far the song is: a thin line under the video
    const line = controls.querySelector('.radio-box__progress span');
    progressTimer = setInterval(() => {
      const duration = youtube?.getDuration?.() || 0;
      line.style.width = duration ? `${Math.min(100, (youtube.getCurrentTime() / duration) * 100)}%` : '0';
    }, 500);
    document.body.classList.add('radio-on');
    setMenu(true);
    updateBox();
  }

  function hideBox() {
    if (!box) return;
    clearInterval(progressTimer);
    box.head.remove();
    box.from?.remove();
    box.controls.remove();
    box = null;
    document.querySelector('.players')?.classList.remove('players--radio');
    document.body.classList.remove('radio-on');
  }

  function onBoxClick(e) {
    const target = e.target.closest('[data-action]');
    const action = target?.dataset.action;
    if (action === 'play') youtube?.playVideo();
    if (action === 'order') {
      const wanted = target.dataset.shuffle === 'true';
      if (wanted === shuffle) return;
      shuffle = wanted;
      upcoming = pickNext();
      updateBox();
    }
    if (action === 'previous' && previous.length) advance(previous.pop(), { back: true });
    if (action === 'skip') advance();
    if (action === 'stop') stop();
  }

  function setNeedsClick(needed) {
    const button = box?.controls.querySelector('[data-action="play"]');
    if (button) button.hidden = !needed;
  }

  // "13 mar 2014" from the id's date
  const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const shortDate = (id) => {
    const [y, m, d] = id.split('-').map(Number);
    return `${d} ${months[m - 1]} ${y}`;
  };

  function updateBox() {
    if (!box) return;
    for (const button of document.querySelectorAll('.radio-box__order [data-action="order"]')) {
      button.setAttribute('aria-checked', String((button.dataset.shuffle === 'true') === shuffle));
    }
    box.controls.querySelector('[data-action="previous"]').disabled = !previous.length;
    const i = indexOf(currentId);
    box.head.querySelector('.radio-box__position').textContent = i >= 0 ? ` ${(i + 1).toLocaleString('es')} de ${list.length.toLocaleString('es')}` : '';
    const next = upcoming;
    const slot = box.controls.querySelector('.radio-box__next');
    slot.textContent = '';
    if (!next) {
      slot.innerHTML = `<span class="radio-box__next-title">${scope ? 'Última canción de la lista' : 'Última canción del archivo'}</span>`;
      return;
    }
    slot.innerHTML = '<span class="kicker radio-box__lead"><span class="radio-box__lead--long">Al acabar la canción</span><span class="radio-box__lead--short">Luego</span></span><span class="radio-box__next-title"><a></a><span class="radio-box__by"></span></span>';
    const link = slot.querySelector('a');
    link.href = `/archive/${next[0]}.html`;
    link.textContent = next[1];
    // Its author and date, from its page (fetched now; it's the next one swapped in)
    loadDoc(next[0]).then((doc) => {
      if (upcoming !== next || !box) return;
      const editor = doc.querySelector('.post-view__editor');
      const by = slot.querySelector('.radio-box__by');
      const avatar = editor?.querySelector('.avatar');
      if (avatar) by.append(document.importNode(avatar, true));
      by.append(`${editor?.querySelector('.post-view__editor-name')?.textContent.trim() ?? ''} · ${shortDate(next[0])}`);
    }).catch(() => { /* shown without its author */ });
  }

  toggle.addEventListener('click', () => start());
  if (shuffle || scope) start();

  document.addEventListener('click', (e) => {
    if (!active) return;
    // Switching to another player tab reloads the playing iframe: radio mode ends
    const tab = e.target.closest('.players__tabs [role="tab"]');
    if (tab && e.isTrusted && tab.id !== 'tab-youtube') { stop(); return; }
    // Links to posts in the radio (prev/next, what comes next in the box) keep it going
    const link = e.target.closest('a[href^="/archive/"]');
    const id = link && idOf(link.getAttribute('href'));
    const entry = id && list[indexOf(id)];
    if (entry && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
      e.preventDefault();
      advance(entry);
    }
  });

  // Back/forward while the radio is on: load that page normally
  window.addEventListener('popstate', () => { if (active) location.reload(); });
})();
