// Custom controls for the UniRadio Jaén podcast <audio> (play/pause, seek, time, speed).
// Without JS the native controls stay. Everything is delegated from the document (media events
// don't bubble, so they're caught in the capture phase), so blocks swapped in by radio mode work too.
(function() {
  document.documentElement.classList.add('podcast-js');

  const SPEEDS = [1, 1.25, 1.5, 2];
  const parts = (el) => {
    const root = el.closest('.podcast');
    return root && {
      audio: root.querySelector('.podcast__audio'),
      play: root.querySelector('.podcast-player__play'),
      seek: root.querySelector('.podcast-player__seek'),
      current: root.querySelector('.podcast-player__current'),
      duration: root.querySelector('.podcast-player__duration'),
      speed: root.querySelector('.podcast-player__speed'),
    };
  };

  const format = (seconds) => {
    if (!Number.isFinite(seconds)) return '--:--';
    const s = Math.floor(seconds);
    const mm = String(Math.floor((s % 3600) / 60)).padStart(s >= 3600 ? 2 : 1, '0');
    const ss = String(s % 60).padStart(2, '0');
    return s >= 3600 ? `${Math.floor(s / 3600)}:${mm}:${ss}` : `${mm}:${ss}`;
  };

  function render(p) {
    const { audio, seek } = p;
    const playing = !audio.paused;
    p.play.setAttribute('aria-pressed', String(playing));
    p.play.setAttribute('aria-label', playing ? 'Pausar' : 'Reproducir');
    if (Number.isFinite(audio.duration)) seek.max = Math.floor(audio.duration);
    if (!seek.matches(':active')) seek.value = Math.floor(audio.currentTime);
    seek.style.setProperty('--progress', `${seek.max > 0 ? (seek.value / seek.max) * 100 : 0}%`);
    p.current.textContent = format(audio.currentTime);
    p.duration.textContent = format(audio.duration);
  }

  for (const type of ['play', 'pause', 'timeupdate', 'loadedmetadata', 'durationchange', 'ended']) {
    document.addEventListener(type, (e) => {
      if (!e.target.matches?.('.podcast__audio')) return;
      render(parts(e.target));
    }, true);
  }

  document.addEventListener('click', (e) => {
    const button = e.target.closest('.podcast-player__play, .podcast-player__speed');
    if (!button) return;
    const p = parts(button);
    if (button === p.play) {
      if (p.audio.paused) p.audio.play(); else p.audio.pause();
    } else {
      const next = SPEEDS[(SPEEDS.indexOf(p.audio.playbackRate) + 1) % SPEEDS.length];
      p.audio.playbackRate = next;
      button.textContent = `${String(next).replace('.', ',')}×`;
    }
  });

  document.addEventListener('input', (e) => {
    if (!e.target.matches('.podcast-player__seek')) return;
    const p = parts(e.target);
    p.audio.currentTime = Number(e.target.value);
    render(p);
  });
})();
