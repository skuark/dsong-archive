// "Tal día como hoy" on the home page: loads /tal-dia-como-hoy/MM-DD.json ({ posts, anniversaries }) for the
// visitor's date: the posts published that day and the albums that came out that day (efemérides).
// Days with neither fall back to the closest previous day with posts (up to a week back).
(function() {
  const box = document.querySelector('.on-this-day');
  if (!box) return;
  const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const pad = (n) => String(n).padStart(2, '0');
  const label = (d) => `${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  const years = (n) => `${n} ${n === 1 ? 'año' : 'años'}`;
  const el = (tag, className, ...children) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.append(...children);
    return node;
  };
  const link = (id, text) => {
    const a = el('a', '', text);
    a.href = `/archive/${id}.html`;
    return a;
  };

  async function load(date) {
    const res = await fetch(`/tal-dia-como-hoy/${pad(date.getMonth() + 1)}-${pad(date.getDate())}.json`);
    return res.ok ? res.json() : null;
  }

  // A post: the year big, then the title and "author · hace N años"
  function postItem(post, today) {
    const time = el('time', 'display on-this-day__year', post.year);
    time.dateTime = post.year;
    const meta = el('span', 'on-this-day__meta', `${post.author} · hace ${years(today.getFullYear() - post.year)}`);
    return el('li', 'on-this-day__item', time, el('span', 'on-this-day__body', link(post.id, post.title), meta));
  }

  // An album (or song) released that day: its age in a yellow box, then "<title>, de <artist>" and who posted it
  function anniversaryItem(a, today) {
    const title = el('a', '', el('em', '', a.title), a.artist ? `, de ${a.artist}` : '');
    title.href = `/archive/${a.id}.html`;
    const meta = el('span', 'on-this-day__meta', `${a.year} · lo recomendó ${a.author}${a.song ? ` con «${a.song}»` : ''}`);
    return el('li', 'on-this-day__item', el('span', 'display on-this-day__age', today.getFullYear() - a.year), el('span', 'on-this-day__body', title, meta));
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
      box.querySelector('.on-this-day__month').textContent = MONTHS[date.getMonth()].slice(0, 3);
      if (back) {
        const note = box.querySelector('.on-this-day__note');
        note.textContent = `Hoy no publicamos nada; esto es del ${label(date)}.`;
        note.hidden = false;
      }
      const list = box.querySelector('.on-this-day__list');
      list.append(...posts.map((post) => postItem(post, today)));
      list.hidden = !posts.length;
      if (anniversaries.length) {
        box.querySelector('.on-this-day__subhead').textContent = `Efemérides · un ${label(date)} salió…`;
        box.querySelector('.on-this-day__anniversaries').append(...anniversaries.map((a) => anniversaryItem(a, today)));
        box.querySelector('.on-this-day__anniversaries-box').hidden = false;
      }
      box.hidden = false;
      return;
    }
  })();
})();
