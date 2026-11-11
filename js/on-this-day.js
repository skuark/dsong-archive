// "Tal día como hoy" on the home page: loads /tal-dia-como-hoy/MM-DD.json for the visitor's date.
// Days without posts fall back to the closest previous day (up to a week back).
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

  (async () => {
    const today = new Date();
    for (let back = 0; back < 8; back++) {
      const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - back);
      let posts;
      try { posts = await load(date); } catch { return; }
      if (!posts || !posts.length) continue;
      box.querySelector('.on-this-day__day').textContent = date.getDate();
      box.querySelector('.on-this-day__month').textContent = MONTHS[date.getMonth()];
      if (back) {
        const note = box.querySelector('.on-this-day__note');
        note.textContent = `Hoy no publicamos nada; esto es del ${label(date)}.`;
        note.hidden = false;
      }
      const list = box.querySelector('.on-this-day__list');
      for (const post of posts) {
        const li = document.createElement('li');
        li.className = 'on-this-day__item';
        const year = document.createElement('time');
        year.dateTime = post.year;
        year.className = 'on-this-day__year';
        year.textContent = post.year;
        const link = document.createElement('a');
        link.href = `/archive/${post.id}.html`;
        link.textContent = post.title;
        const meta = document.createElement('span');
        meta.className = 'on-this-day__meta';
        meta.append(year);
        if (post.author) meta.append(` · ${post.author}`);
        li.append(meta, link);
        list.append(li);
      }
      box.hidden = false;
      return;
    }
  })();
})();
