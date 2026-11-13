// "Escuchar en modo radio" on an archive table (partials/archive-table.njk): the posts the table shows,
// filtered and sorted as they are, become radio mode's list. They're kept in sessionStorage and played
// from the first one that can be (YouTube or Spotify: /radio.json), on its post page with ?radio=lista
// (js/radio.js).
(() => {
  const button = document.getElementById('archive-radio');
  const table = document.getElementById('archive-table');
  if (!button || !table?.tBodies) return;
  button.hidden = false;
  const label = button.querySelector('.archive-radio__label');
  const startLabel = label.textContent;
  const idOf = (row) => (row.querySelector('.archive-table__cell--title a')?.getAttribute('href').match(/\/archive\/([^/]+)\.html$/) || [])[1];
  let playable = null;

  // What the list is, for the radio bar: the page's heading and the filters ("Mayte Martín", "Todas las
  // publicaciones · 2014 · «rock»")
  function nameOf() {
    const year = document.getElementById('archive-year')?.value;
    const text = document.getElementById('archive-search')?.value.trim();
    return [document.querySelector('.page-title')?.textContent.trim(), year, text && `«${text}»`].filter(Boolean).join(' · ');
  }

  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      playable ??= new Set((await (await fetch('/radio.json')).json()).map((entry) => entry[0]));
    } catch {
      button.disabled = false;
      return;
    }
    const ids = [...table.tBodies[0].rows].filter((row) => !row.hidden).map(idOf).filter((id) => id && playable.has(id));
    button.disabled = false;
    if (!ids.length) {
      label.textContent = 'Nada que escuchar aquí';
      setTimeout(() => { label.textContent = startLabel; }, 2500);
      return;
    }
    try {
      sessionStorage.setItem('dsong-radio-list', JSON.stringify({ ids, name: nameOf() }));
    } catch {
      return;
    }
    location.href = `/archive/${ids[0]}.html?radio=lista`;
  });
})();
