// Radio mode: plays posts one after another, in chronological or random order (menu "Radio" ->
// /radio/ -> a random post with ?radio=aleatoria), without reloading the page, so the music keeps
// going and each post's text is shown next to it. Each post plays its YouTube video or, if it has
// none, its Spotify embed (only a 30 s preview without a Spotify session in the browser).
// A page navigation would stop playback (and browsers don't allow autoplay with sound on the new
// page), so the article is swapped in place: header, text, comments, navigation and the players'
// tabs are replaced, while the live YouTube and Spotify panels stay where they are (moving an
// iframe in the DOM reloads it) and load the next song through their APIs. The URL is updated
// with pushState.
(function() {
  const toggle = document.querySelector('.radio-toggle');
  if (!toggle) return;
  toggle.hidden = false;

  const idOf = (path) => (path.match(/\/archive\/([^/]+)\.html$/) || [])[1];
  let list = null;          // [[id, title, youtubeCode, spotifyUri], ...] from /radio.json
  let active = false;
  let bar = null;
  let currentId = idOf(location.pathname);
  let shuffle = new URLSearchParams(location.search).get('radio') === 'aleatoria';
  const played = new Set();
  const previous = [];      // entries already played in this radio session, for "Anterior"
  let upcoming = null;      // next entry, chosen in advance so the bar can show it
  let advancing = false;

  let youtube = null;       // YT.Player on the live #panel-youtube iframe
  let spotify = null;       // Spotify embed controller on the live #panel-spotify
  let source = null;        // 'youtube' | 'spotify': what is playing now
  let playing = false;      // the current song has started
  let everPlayed = false;   // some song started: autoplay works in this browser
  let watchTimer = null;
  let last = { position: 0, duration: 0 };   // last Spotify playback update
  let spotifyUri = '';      // what the Spotify player has loaded (track, album, playlist...)
  let endTimer = null;

  const indexOf = (id) => list.findIndex((entry) => entry[0] === id);
  const sourceOf = (entry) => (entry[2] ? 'youtube' : 'spotify');

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

  let spotifyApi = null;
  function loadSpotifyApi() {
    spotifyApi = spotifyApi || new Promise((resolve) => {
      window.onSpotifyIframeApiReady = resolve;
      loadScript('https://open.spotify.com/embed/iframe-api/v1');
    });
    return spotifyApi;
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

  const isLive = (panel) => (panel.id === 'panel-youtube' && youtube) || (panel.id === 'panel-spotify' && spotify);

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
            if (source !== 'youtube') return;
            if (e.data === YT.PlayerState.PLAYING) started();
            if (e.data === YT.PlayerState.ENDED) advance();
          },
          // Removed or non-embeddable video: skip it
          onError: () => { if (source === 'youtube') advance(); },
        },
      });
    });
  }

  async function ensureSpotify(uri) {
    if (spotify) return spotify;
    const api = await loadSpotifyApi();
    // The API replaces an element with its own iframe: swap the post's iframe for a placeholder
    // inside the same panel (the panel itself doesn't move)
    const target = document.createElement('div');
    document.querySelector('#panel-spotify iframe').replaceWith(target);
    return new Promise((resolve) => {
      api.createController(target, { uri, width: '100%', height: uri.startsWith('spotify:track:') ? 80 : 352 }, (controller) => {
        controller.addListener('playback_update', onSpotifyUpdate);
        spotify = controller;
        resolve(controller);
      });
    });
  }

  function dropSpotify() {
    try { spotify.destroy(); } catch { /* already gone */ }
    document.getElementById('panel-spotify')?.remove();
    spotify = null;
    if (source === 'spotify') source = null;
  }

  function onSpotifyUpdate(e) {
    if (source !== 'spotify') return;
    const { isPaused, position, duration } = e.data;
    // Playing again (e.g. the next album track, even at 0:00): it wasn't the end
    if (!isPaused) clearTimeout(endTimer);
    if (!isPaused && position > 0) started();
    const nearEnd = last.duration > 0 && last.position >= last.duration - 1500;
    // Next track started: the end for a single song, but an album or playlist keeps going
    const trackChanged = nearEnd && !isPaused && position < last.position;
    // Stopped at the end (or at 30 s, the end of a preview): wait a moment in case it's just the
    // pause between two album tracks
    const stoppedAtEnd = isPaused && last.position > 0 && (nearEnd || Math.abs(position - 30000) < 1500);
    last = { position, duration };
    if (trackChanged && spotifyUri.startsWith('spotify:track:')) advance();
    if (stoppedAtEnd) {
      clearTimeout(endTimer);
      endTimer = setTimeout(() => { if (source === 'spotify') advance(); }, 2500);
    }
  }

  function started() {
    playing = true;
    everPlayed = true;
    clearTimeout(watchTimer);
    setNeedsClick(false);
  }

  // If the song doesn't start, the browser may be blocking playback with sound (always possible
  // arriving from the menu, with no click on this page yet): the bar offers a "Start" button.
  // Once something has played, a Spotify song that doesn't start is unavailable: skip it.
  function watch() {
    playing = false;
    clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      if (playing || !active) return;
      if (source === 'spotify' && everPlayed) advance();
      else setNeedsClick(true);
    }, everPlayed ? 10000 : 3000);
  }

  async function play(entry) {
    const next = sourceOf(entry);
    if (source === 'youtube' && next !== 'youtube') youtube?.pauseVideo();
    if (source === 'spotify' && next !== 'spotify') spotify?.pause();
    source = next;
    selectPanel(next);
    const via = bar && bar.querySelector('.radio-bar__source');
    if (via) {
      via.textContent = next === 'youtube' ? ' · en YouTube' : ' · en Spotify';
      via.title = next === 'youtube' ? '' : 'Este artículo no tiene vídeo de YouTube. Sin sesión de Spotify en el navegador suena una muestra de 30 s';
    }
    watch();
    if (next === 'youtube') {
      const player = await ensureYoutube();
      if (player.getVideoData?.().video_id === entry[2]) player.playVideo();
      else player.loadVideoById(entry[2]);
    } else {
      const fresh = !spotify;
      const controller = await ensureSpotify(entry[3]);
      last = { position: 0, duration: 0 };
      clearTimeout(endTimer);
      spotifyUri = entry[3];
      if (!fresh) {
        // Same player, maybe another kind: albums and playlists show their track list
        const iframe = document.querySelector('#panel-spotify iframe');
        if (iframe) iframe.height = entry[3].startsWith('spotify:track:') ? 80 : 352;
        controller.loadUri(entry[3]);
      }
      controller.play();
      // play() may arrive before the new URI has loaded: try once more
      const id = entry[0];
      setTimeout(() => { if (active && !playing && currentId === id) controller.play(); }, 2000);
    }
  }

  async function start() {
    toggle.disabled = true;
    try {
      list = list || await (await fetch('/radio.json')).json();
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
    toggle.hidden = true;
    showBar();
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
    source = null;
    clearTimeout(watchTimer);
    // Live panels this post has no tab for (kept for later songs) go away, which also stops them
    for (const name of ['youtube', 'spotify']) {
      if (!document.getElementById(`tab-${name}`)) document.getElementById(`panel-${name}`)?.remove();
    }
    youtube = null;
    spotify = null;
    if (bar) bar.remove();
    bar = null;
    document.body.classList.remove('radio-on');
    toggle.hidden = false;
  }

  // Replaces the current post with the one parsed from `doc`, keeping the live player panels.
  function swap(doc) {
    const current = document.querySelector('.post-view');
    const next = doc.querySelector('.post-view');

    // The header carries the Ficha popover: close it before swapping
    current.querySelector('.post-facts:popover-open')?.hidePopover();
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
      players.append(copy);
    }

    // Podcast block (only some posts have one): first in the side column, above the players
    current.querySelector('.podcast')?.remove();
    const podcast = next.querySelector('.podcast');
    if (podcast) current.querySelector('.post-view__side').prepend(document.importNode(podcast, true));

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
          const res = await fetch(`/archive/${entry[0]}.html`);
          if (!res.ok) throw new Error(res.status);
          const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
          if (!active) return;
          const leaving = list[indexOf(currentId)];
          // Next song is on YouTube: drop the live Spotify player (reusing it for the post's Spotify
          // tab would start playing it too); the post brings its own, idle Spotify panel
          if (spotify && entry[2]) dropSpotify();
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
      updateBar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      await play(entry);
    } finally {
      advancing = false;
    }
  }

  function showBar() {
    bar = document.createElement('div');
    bar.className = 'radio-bar';
    bar.setAttribute('role', 'region');
    bar.setAttribute('aria-label', 'Modo radio');
    bar.innerHTML = `
      <span class="kicker radio-bar__label">📻 Modo radio<span class="radio-bar__source"></span></span>
      <span class="radio-bar__next"></span>
      <span class="radio-bar__actions">
        <button class="radio-bar__button radio-bar__button--start" type="button" data-action="play" hidden>▶ Empezar</button>
        <button class="radio-bar__button" type="button" data-action="shuffle" aria-pressed="false">🔀 Aleatorio</button>
        <button class="radio-bar__button" type="button" data-action="previous" disabled>⏮ Anterior</button>
        <button class="radio-bar__button" type="button" data-action="skip">Siguiente ⏭</button>
        <button class="radio-bar__button" type="button" data-action="stop">Salir ✕</button>
      </span>`;
    bar.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'play') {
        if (source === 'youtube') youtube?.playVideo();
        if (source === 'spotify') spotify?.play();
      }
      if (action === 'shuffle') {
        shuffle = !shuffle;
        upcoming = pickNext();
        updateBar();
      }
      if (action === 'previous' && previous.length) advance(previous.pop(), { back: true });
      if (action === 'skip') advance();
      if (action === 'stop') stop();
    });
    document.body.append(bar);
    document.body.classList.add('radio-on');
    updateBar();
  }

  function setNeedsClick(needed) {
    const button = bar && bar.querySelector('[data-action="play"]');
    if (button) button.hidden = !needed;
  }

  function updateBar() {
    if (!bar) return;
    bar.querySelector('[data-action="shuffle"]').setAttribute('aria-pressed', String(shuffle));
    bar.querySelector('[data-action="previous"]').disabled = !previous.length;
    const next = upcoming;
    const slot = bar.querySelector('.radio-bar__next');
    slot.textContent = '';
    if (!next) { slot.textContent = 'Última canción del archivo'; return; }
    slot.append('A continuación: ');
    const link = document.createElement('a');
    link.href = `/archive/${next[0]}.html`;
    link.textContent = next[1];
    slot.append(link);
  }

  toggle.addEventListener('click', () => start());
  if (shuffle) start();

  document.addEventListener('click', (e) => {
    if (!active) return;
    // Switching to another player tab reloads the playing iframe: radio mode ends
    const tab = e.target.closest('.players__tabs [role="tab"]');
    if (tab && e.isTrusted && tab.id !== `tab-${source}`) { stop(); return; }
    // Links to posts in the radio (prev/next, "A continuación" in the bar) keep it going
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
