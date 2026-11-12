(function() {
  const table = document.getElementById('archive-table');
  if (!table) return;

  const tbody = table.querySelector('tbody');

  // A click on a row (or card) outside its links opens the post, as its title link would (new tab with
  // Ctrl/⌘ or the middle button); selecting text doesn't
  function openRow(event) {
    if (event.target.closest('a, button') || String(getSelection())) return;
    const link = event.target.closest('tr')?.querySelector('.archive-table__cell--title a');
    if (!link) return;
    if (event.ctrlKey || event.metaKey || event.button === 1) window.open(link.href, '_blank');
    else location.href = link.href;
  }
  tbody?.addEventListener('click', openRow);
  tbody?.addEventListener('auxclick', (event) => { if (event.button === 1) openRow(event); });
  const headers = table.querySelectorAll('th.sortable');
  const originalRows = Array.from(tbody.querySelectorAll('tr'));

  const collator = new Intl.Collator('es', { sensitivity: 'base', numeric: true });

  // Sort states: 0 = none, 1 = asc, 2 = desc
  let currentSortCol = null;
  let currentSortState = 0;

  headers.forEach(header => {
    header.style.cursor = 'pointer';
    header.addEventListener('click', () => handleSort(header));
  });

  function handleSort(header) {
    const col = parseInt(header.dataset.col);
    const sortType = header.dataset.sort;

    // Determine next state
    if (currentSortCol === col) {
      currentSortState = (currentSortState + 1) % 3;
    } else {
      currentSortCol = col;
      currentSortState = 1;
    }

    // Reset all indicators
    headers.forEach(h => {
      h.classList.remove('sort-asc', 'sort-desc');
      h.querySelector('.sort-indicator').textContent = '';
    });

    if (currentSortState === 0) {
      // Reset to original order
      currentSortCol = null;
      originalRows.forEach(row => tbody.appendChild(row));
      return;
    }

    // Set indicator
    const indicator = header.querySelector('.sort-indicator');
    if (currentSortState === 1) {
      header.classList.add('sort-asc');
      indicator.textContent = ' ▲';
    } else {
      header.classList.add('sort-desc');
      indicator.textContent = ' ▼';
    }

    // Sort rows. Dates compare as their "YYYY-MM-DD hh:mm:ss" string (Safari and Firefox don't parse
    // that format as a Date); text in Spanish order, ignoring accents, case and leading punctuation
    // ("¿", "(", quotes); empty cells always last, whatever the direction.
    const value = (cell) => {
      if (sortType === 'date') return cell.dataset.value || '';
      const text = cell.textContent.trim();
      if (sortType === 'number') return text === '' ? '' : (parseInt(text, 10) || 0);
      return text.replace(/^[^\p{L}\p{N}]+/u, '') || text;   // all punctuation (an album "✝"): as is
    };
    const sign = currentSortState === 1 ? 1 : -1;
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const keyed = rows.map((row) => ({ row, key: value(row.cells[col]) }));
    keyed.sort((a, b) => {
      if (a.key === '' || b.key === '') return (a.key === '') - (b.key === '');
      if (sortType === 'number') return sign * (a.key - b.key);
      if (sortType === 'date') return sign * (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
      return sign * collator.compare(a.key, b.key);
    });
    const sortedRows = keyed.map(({ row }) => row);

    sortedRows.forEach(row => tbody.appendChild(row));
  }
})();
