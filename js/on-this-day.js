// "Tal día como hoy" on the home page: loads /tal-dia-como-hoy/MM-DD.json ({ posts, anniversaries }) for the
// visitor's date: the posts published that day and the albums that came out that day ("Hace 30 años").
// Days with neither fall back to the closest previous day with posts (up to a week back).
(function() {
  const box = document.querySelector('.on-this-day');
  if (!box) return;
  const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const pad = (n) => String(n).padStart(2, '0');
  const label = (d) => `${d.getDate()} de ${MONTHS[d.getMonth()]}`;

  async function load(date) {
    const res = await fetch(`/tal-dia-como-hoy/${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`);
    return res.ok ? res.json() : null;
  }

  // A timeline entry: "<year> · <extra>" over a link to the post
  function item(id, year, extra, text) {
    const li = document.createElement('li');
    li.className = 'on-this-day__item';
    const time = document.createElement('time');
    time.dateTime = year;
    time.className = 'on-this-day__year';
    time.textContent = year;
    const meta = document.createElement('span');
    meta.className = 'on-this-day__meta';
    meta.append(time);
    if (extra) meta.append(` · ${extra}`);
    const link = document.createElement('a');
    link.href = `/archive/${id}.html`;
    link.textContent = text;
    li.append(meta, link);
    return li;
  }

  (async () => {
    const today = new Date();
    for (let back = 0; back < 8; back++) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
      let data;
      try { data = await load(date); } catch { return; }
      const posts = data?.posts ?? [], anniversaries = back ? [] : data?.anniversaries ?? [];
      if (!posts.length && !anniversaries.length) continue;
      box.querySelector('.on-this-day__day').textContent = date.getDate();
      box.querySelector('.on-this-day__month').textContent = MONTHS[date.getMonth()];
      if (back) {
        const note = box.querySelector('.on-this-day__note');
        note.textContent = `Hoy no publicamos nada; esto es del ${label(date)}.`;
        note.hidden = false;
      }
      const list = box.querySelector('.on-this-day__list');
      for (const post of posts) list.append(item(post.id, post.year, post.author, post.title));
      list.hidden = !posts.length;
      if (anniversaries.length) {
        const years = (a) => today.getFullYear() - a.year;
        const older = box.querySelector('.on-this-day__anniversaries');
        for (const a of anniversaries) {
          older.append(item(a.id, a.year, `hace ${years(a)} ${years(a) === 1 ? 'año' : 'años'}`, a.artist ? `${a.title}, de ${a.artist}` : a.title));
        }
        older.hidden = false;
        box.querySelector('.on-this-day__subhead').hidden = false;
      }
      box.hidden = false;
      return;
    }
  })();
})();
