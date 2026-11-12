(function() {
  // Card photos that fail (an author without a Gravatar: d=404) go away, and so does the room kept for
  // them, unless the card has an initial under the photo (authors), which then shows
  document.addEventListener('error', (event) => {
    if (!event.target.matches?.('.facet-cards__image')) return;
    const card = event.target.closest('.facet-cards__card');
    if (!card?.querySelector('.facet-cards__initial')) card?.classList.remove('facet-cards__card--image');
    event.target.remove();
  }, true);

  const table = document.getElementById('archive-table');
  const input = document.getElementById('archive-search');
  const count = document.getElementById('archive-search-count');
  if (!table || !input) return;

  // Lowercase, without accents: "Björk" -> "bjork"
  const normalize = (text) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

  // Table rows, or the items of a card list (facet indexes: partials/facet-index.njk)
  const items = table.tBodies ? table.tBodies[0].rows : table.children;
  // Publication year of a table row (its first cell's data-value, "yyyy-MM-dd …"), for the year select
  const rows = Array.from(items).map((row) => ({ row, text: normalize(row.textContent), year: row.cells?.[0]?.dataset.value?.slice(0, 4) }));
  const select = document.getElementById('archive-year');
  const empty = document.getElementById('archive-search-empty');
  let year = '';
  const total = rows.length;
  // Counted noun, "singular|plural" (data-noun on the counter; facet indexes count artists, authors…)
  const [one, many] = (count.dataset.noun || 'publicación|publicaciones').split('|');
  const plural = (n) => n === 1 ? one : many;
  // 1891 -> "1.891" (same as the `thousands` filter)
  const thousands = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  function filter() {
    const words = normalize(input.value).split(/\s+/).filter(Boolean);
    let visible = 0;
    for (const { row, text, year: rowYear } of rows) {
      const match = words.every((word) => text.includes(word)) && (!year || rowYear === year);
      row.hidden = !match;
      if (match) visible++;
    }
    if (empty) empty.hidden = visible > 0;
    if (select) select.value = year;
    count.textContent = words.length || year
      ? `${thousands(visible)} de ${thousands(total)} ${plural(total)}`
      : `${thousands(total)} ${plural(total)}`;

    const url = new URL(window.location);
    if (input.value.trim()) url.searchParams.set('q', input.value.trim());
    else url.searchParams.delete('q');
    if (year) url.searchParams.set('year', year);
    else url.searchParams.delete('year');
    history.replaceState(null, '', url);
  }

  const params = new URLSearchParams(window.location.search);
  input.value = params.get('q') || '';
  if (select && [...select.options].some((option) => option.value === params.get('year'))) year = params.get('year');
  input.addEventListener('input', filter);
  select?.addEventListener('change', () => { year = select.value; filter(); });
  filter();
})();
