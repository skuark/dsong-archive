(function() {
  const table = document.getElementById('archive-table');
  const input = document.getElementById('archive-search');
  const count = document.getElementById('archive-search-count');
  if (!table || !input) return;

  // Lowercase, without accents: "Björk" -> "bjork"
  const normalize = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  const rows = Array.from(table.tBodies[0].rows).map((row) => ({ row, text: normalize(row.textContent) }));
  const total = rows.length;
  const plural = (n) => n === 1 ? 'publicación' : 'publicaciones';

  function filter() {
    const words = normalize(input.value).split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const { row, text } of rows) {
      const match = words.every((word) => text.includes(word));
      row.hidden = !match;
      if (match) visible++;
    }
    count.textContent = words.length
      ? `${visible} de ${total} ${plural(total)}`
      : `${total} ${plural(total)}`;

    const url = new URL(window.location);
    if (input.value.trim()) url.searchParams.set('q', input.value.trim());
    else url.searchParams.delete('q');
    history.replaceState(null, '', url);
  }

  input.value = new URLSearchParams(window.location.search).get('q') || '';
  input.addEventListener('input', filter);
  filter();
})();
