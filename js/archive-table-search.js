(function() {
  const table = document.getElementById('archive-table');
  const input = document.getElementById('archive-search');
  const count = document.getElementById('archive-search-count');
  if (!table || !input) return;

  // Lowercase, without accents: "Björk" -> "bjork"
  const normalize = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Table rows, or the items of a card list (facet indexes: partials/facet-index.njk)
  const items = table.tBodies ? table.tBodies[0].rows : table.children;
  const rows = Array.from(items).map((row) => ({ row, text: normalize(row.textContent) }));
  const total = rows.length;
  // Counted noun, "singular|plural" (data-noun on the counter; facet indexes count artists, authors…)
  const [one, many] = (count.dataset.noun || 'publicación|publicaciones').split('|');
  const plural = (n) => n === 1 ? one : many;
  // 1891 -> "1.891" (same as the `thousands` filter)
  const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  function filter() {
    const words = normalize(input.value).split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const { row, text } of rows) {
      const match = words.every((word) => text.includes(word));
      row.hidden = !match;
      if (match) visible++;
    }
    count.textContent = words.length
      ? `${thousands(visible)} de ${thousands(total)} ${plural(total)}`
      : `${thousands(total)} ${plural(total)}`;

    const url = new URL(window.location);
    if (input.value.trim()) url.searchParams.set('q', input.value.trim());
    else url.searchParams.delete('q');
    history.replaceState(null, '', url);
  }

  input.value = new URLSearchParams(window.location.search).get('q') || '';
  input.addEventListener('input', filter);
  filter();
})();
