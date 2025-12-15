(function() {
  const table = document.getElementById('archive-table');
  if (!table) return;

  const tbody = table.querySelector('tbody');
  const headers = table.querySelectorAll('th.sortable');
  const originalRows = Array.from(tbody.querySelectorAll('tr'));

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

    // Sort rows
    const rows = Array.from(tbody.querySelectorAll('tr'));
    const sortedRows = rows.sort((a, b) => {
      const aCell = a.cells[col];
      const bCell = b.cells[col];
      let aVal, bVal;

      if (sortType === 'date') {
        aVal = aCell.dataset.value || aCell.textContent;
        bVal = bCell.dataset.value || bCell.textContent;
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      } else if (sortType === 'number') {
        aVal = parseInt(aCell.textContent) || 0;
        bVal = parseInt(bCell.textContent) || 0;
      } else {
        aVal = aCell.textContent.trim().toLowerCase();
        bVal = bCell.textContent.trim().toLowerCase();
      }

      let comparison = 0;
      if (aVal < bVal) comparison = -1;
      else if (aVal > bVal) comparison = 1;

      return currentSortState === 1 ? comparison : -comparison;
    });

    sortedRows.forEach(row => tbody.appendChild(row));
  }
})();
