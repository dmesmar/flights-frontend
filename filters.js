/* -------------------------------------------
   FILTERS, SORTING & ROUTE TABS
------------------------------------------- */
let activeDayFilter = [];
let activeDepDayFilter = [];
let activeArrDayFilter = [];

document.getElementById('dayBtnsRow')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.day-btn');
  if (!btn) return;
  btn.classList.toggle('active');
});

function filterByDays(vuelos) {
  if (!activeDayFilter.length) return vuelos;
  return vuelos.filter(v => activeDayFilter.includes(parseDateYMD(v.fecha).getDay()));
}

let lastResults = null;
let lastReturnData = null;
let activeRoute = '__flat__';
let activeReturnRoute = '__flat__';
let excludedRoutes = new Set();
let excludedReturnRoutes = new Set();
let activeDestFilter = '';
let activeReturnDestFilter = '';

function bindRouteTabs(container, onTabChange) {
  const tabs = container.querySelectorAll('.route-tab');
  if (!tabs.length) return;
  const isReturn = container.id === 'returnGrid';
  let current = isReturn ? activeReturnRoute : activeRoute;
  const excluded = isReturn ? excludedReturnRoutes : excludedRoutes;
  // '__flat__' is always valid; only reset specific route keys that no longer exist
  if (current !== '__flat__' && current) {
    const existingRoutes = new Set([...container.querySelectorAll('.route-section')].map(s => s.dataset.route));
    if (!existingRoutes.has(current)) {
      current = '__flat__';
      if (isReturn) activeReturnRoute = '__flat__';
      else activeRoute = '__flat__';
    }
  }

  function syncTabClasses() {
    const cur = isReturn ? activeReturnRoute : activeRoute;
    const excl = isReturn ? excludedReturnRoutes : excludedRoutes;
    tabs.forEach(btn => {
      const val = btn.dataset.route === '' ? null : btn.dataset.route;
      const key = val;
      btn.classList.remove('active', 'tab-excluded');
      if (excl.has(key)) {
        btn.classList.add('tab-excluded');
      } else if (val === (cur === null ? null : cur) ||
                 (val === '__flat__' && cur === '__flat__') ||
                 (val === null && cur === null)) {
        btn.classList.add('active');
      }
    });
    // Always mark Todos flat active when no include route set and nothing excluded
    if (cur === '__flat__') {
      container.querySelector('[data-route="__flat__"]')?.classList.add('active');
    }
    // Update "Todos" and "Todos (por destino)" counts to reflect excluded routes
    const sections = container.querySelectorAll('.route-section');
    let visibleCount = 0;
    sections.forEach(sec => {
      if (!excl.has(sec.dataset.route)) {
        visibleCount += sec.querySelectorAll('.flight-card').length;
      }
    });
    container.querySelectorAll('.route-tab[data-route="__flat__"] .route-tab-count, .route-tab[data-route=""] .route-tab-count').forEach(el => {
      el.textContent = visibleCount;
    });
  }

  syncTabClasses();
  applyRouteTabVisibility(container, current, isReturn ? excludedReturnRoutes : excludedRoutes);

  tabs.forEach(btn => {
    btn.addEventListener('click', () => {
      const routeVal = btn.dataset.route === '' ? null : btn.dataset.route;
      const excl = isReturn ? excludedReturnRoutes : excludedRoutes;

      if (!routeVal || routeVal === '__flat__') {
        // Todos tabs: clear everything
        excl.clear();
        if (isReturn) activeReturnRoute = routeVal;
        else activeRoute = routeVal;
      } else {
        const curActive = isReturn ? activeReturnRoute : activeRoute;
        if (excl.has(routeVal)) {
          // excluded → neutral
          excl.delete(routeVal);
          // only stay on __flat__ (don't re-activate this route)
        } else if (curActive === routeVal) {
          // included → excluded
          excl.add(routeVal);
          if (isReturn) activeReturnRoute = '__flat__';
          else activeRoute = '__flat__';
        } else {
          // neutral/other included → include only this
          if (isReturn) activeReturnRoute = routeVal;
          else activeRoute = routeVal;
          // do NOT touch excl — leave other exclusions in place
        }
      }

      syncTabClasses();
      const newActive = isReturn ? activeReturnRoute : activeRoute;
      if (onTabChange) {
        onTabChange();
      } else {
        applyRouteTabVisibility(container, newActive, excl);
      }
    });
  });
}

function applyRouteTabVisibility(container, route, excl) {
  const excluded = excl || new Set();
  if (route === '__flat__') {
    container.classList.add('results-flat');
    container.querySelectorAll('.route-section').forEach(sec => {
      sec.style.display = excluded.has(sec.dataset.route) ? 'none' : '';
    });
  } else if (route === null || route === undefined) {
    // grouped mode — show all sections with headers
    container.classList.remove('results-flat');
    container.querySelectorAll('.route-section').forEach(sec => {
      sec.style.display = excluded.has(sec.dataset.route) ? 'none' : '';
    });
  } else {
    // include-only a specific route
    container.classList.remove('results-flat');
    container.querySelectorAll('.route-section').forEach(sec => {
      sec.style.display = sec.dataset.route === route ? '' : 'none';
    });
  }
}

function applyFiltersAndSort() {
  if (!lastResults) return;

  const dateFrom  = document.getElementById('fDateFrom')?.value;
  const dateTo    = document.getElementById('fDateTo')?.value;
  const maxPrice  = parseFloat(document.getElementById('fPrice')?.value ?? Infinity);
  const stopsVal  = document.querySelector('.filter-stop-btn.active')?.dataset.val ?? '';
  const airline   = document.getElementById('fAirline')?.value ?? '';
  const sortKey   = document.getElementById('fSort')?.value ?? 'date-asc';
  const depFrom   = parseInt(document.getElementById('fDepFrom')?.value ?? '0');
  const depTo     = parseInt(document.getElementById('fDepTo')?.value   ?? '23');
  const arrFrom   = parseInt(document.getElementById('fArrFrom')?.value ?? '0');
  const arrTo     = parseInt(document.getElementById('fArrTo')?.value   ?? '23');

  const dfrom = parseDateInput(dateFrom);
  const dto   = parseDateInput(dateTo);

  const filtered = lastResults.vuelos.filter(v => {
    const vDate = parseDateYMD(v.fecha);
    if (dfrom && vDate < dfrom) return false;
    if (dto   && vDate > dto)   return false;
    if (parsePrice(v.precio) > maxPrice) return false;
    if (airline && v.aerolinea !== airline) return false;
    if (stopsVal === '0' && v.escalas !== 0) return false;
    if (stopsVal === '1' && v.escalas !== 1) return false;
    if (stopsVal === '2' && v.escalas < 2)   return false;
    if (activeDestFilter && v.destino !== activeDestFilter) return false;
    if (activeDayFilter.length > 0 && !activeDayFilter.includes(parseDateYMD(v.fecha).getDay())) return false;
    if (activeDepDayFilter.length > 0 && !activeDepDayFilter.includes(parseDateYMD(v.fecha).getDay())) return false;
    if (activeArrDayFilter.length > 0) {
      const arrDate = new Date(parseDateYMD(v.fecha).getTime() + (parseInt(v.adelanto_llegada) || 0) * 86400000);
      if (!activeArrDayFilter.includes(arrDate.getDay())) return false;
    }
    const depHour = parseInt((v.salida  || '0:0').split(':')[0]);
    const arrHour = parseInt((v.llegada || '0:0').split(':')[0]);
    if (depHour < depFrom || depHour > depTo) return false;
    if (arrHour < arrFrom || arrHour > arrTo) return false;
    return true;
  });

  filtered.sort((a, b) => {
    switch (sortKey) {
      case 'date-asc':      return parseDateYMD(a.fecha) - parseDateYMD(b.fecha);
      case 'date-desc':     return parseDateYMD(b.fecha) - parseDateYMD(a.fecha);
      case 'price-asc':     return parsePrice(a.precio) - parsePrice(b.precio);
      case 'price-desc':    return parsePrice(b.precio) - parsePrice(a.precio);
      case 'duration-asc':  return durationMins(a.duracion) - durationMins(b.duracion);
      case 'stops-asc':     return a.escalas - b.escalas;
      case 'dep-asc':       return a.salida.localeCompare(b.salida);
      case 'dep-desc':      return b.salida.localeCompare(a.salida);
      case 'arr-asc':       return a.llegada.localeCompare(b.llegada);
      case 'arr-desc':      return b.llegada.localeCompare(a.llegada);
      default:              return 0;
    }
  });

  const virtualData = { ...lastResults, vuelos: filtered, total_vuelos: filtered.length };
  const resultsGrid = document.getElementById('resultsGrid');
  if (resultsGrid) {
    resultsGrid.innerHTML = renderResultsGridInner(virtualData, '', activeRoute === '__flat__', excludedRoutes);
    bindSaveBtns(resultsGrid, filtered);
    bindReturnBtns(resultsGrid, filtered);
    bindRouteTabs(resultsGrid, applyFiltersAndSort);
  }

  const countEl = document.querySelector('.results-count');
  if (countEl) countEl.innerHTML = t('flights_found', filtered.length);
}

function bindFilterBarEvents() {
  document.getElementById('fDateFrom')?.addEventListener('change', applyFiltersAndSort);
  document.getElementById('fDateTo')?.addEventListener('change', applyFiltersAndSort);
  document.getElementById('fAirline')?.addEventListener('change', applyFiltersAndSort);
  document.getElementById('fSort')?.addEventListener('change', applyFiltersAndSort);

  const priceInput = document.getElementById('fPrice');
  const priceVal   = document.getElementById('fPriceVal');
  priceInput?.addEventListener('input', () => {
    if (priceVal) priceVal.textContent = `${priceInput.value}€`;
    applyFiltersAndSort();
  });

  document.getElementById('fStops')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-stop-btn');
    if (!btn) return;
    document.querySelectorAll('.filter-stop-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyFiltersAndSort();
  });

  document.getElementById('fDest')?.addEventListener('change', (e) => {
    activeDestFilter = e.target.value;
    applyFiltersAndSort();
  });

  function updateTimeLabel(fromId, toId, fromValId, toValId) {
    const f = document.getElementById(fromId);
    const t = document.getElementById(toId);
    if (f) document.getElementById(fromValId).textContent = String(f.value).padStart(2, '0') + ':00';
    if (t) document.getElementById(toValId).textContent   = String(t.value).padStart(2, '0') + ':00';
  }
  ['fDepFrom', 'fDepTo'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      updateTimeLabel('fDepFrom', 'fDepTo', 'fDepFromVal', 'fDepToVal');
      applyFiltersAndSort();
    });
  });
  ['fArrFrom', 'fArrTo'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      updateTimeLabel('fArrFrom', 'fArrTo', 'fArrFromVal', 'fArrToVal');
      applyFiltersAndSort();
    });
  });

  document.getElementById('fDepDays')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-day-btn');
    if (!btn) return;
    btn.classList.toggle('active');
    activeDepDayFilter = [...document.querySelectorAll('#fDepDays .filter-day-btn.active')].map(b => parseInt(b.dataset.day));
    applyFiltersAndSort();
  });

  document.getElementById('fArrDays')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-day-btn');
    if (!btn) return;
    btn.classList.toggle('active');
    activeArrDayFilter = [...document.querySelectorAll('#fArrDays .filter-day-btn.active')].map(b => parseInt(b.dataset.day));
    applyFiltersAndSort();
  });

  document.getElementById('filterResetBtn')?.addEventListener('click', () => {
    if (!lastResults) return;
    activeDestFilter = '';
    activeDepDayFilter = [];
    activeArrDayFilter = [];
    excludedRoutes.clear();
    activeRoute = '__flat__';
    const resultsEl = document.getElementById('results');
    const header = buildResultsHeader(lastResults);
    resultsEl.innerHTML = header + buildFilterBar(lastResults) + '<div id="resultsGrid">' + renderResultsGridInner(lastResults, '', true, excludedRoutes) + '</div>';
    bindFilterBarEvents();
    bindResultsHeaderBtns(lastResults);
    const resultsGrid = document.getElementById('resultsGrid');
    bindSaveBtns(resultsGrid, lastResults.vuelos);
    bindReturnBtns(resultsGrid, lastResults.vuelos);
    bindRouteTabs(resultsGrid, applyFiltersAndSort);
  });
}

function bindSaveBtns(container, vuelos) {
  container.querySelectorAll('.save-btn').forEach(btn => {
    const id = btn.dataset.id;
    const v  = vuelos.find(f => flightId(f) === id);
    if (v) btn.addEventListener('click', () => toggleSave(v));
  });
}

function bindReturnBtns(container, vuelos) {
  container.querySelectorAll('.return-btn').forEach(btn => {
    const id = btn.dataset.id;
    const v  = vuelos.find(f => flightId(f) === id);
    if (v) btn.addEventListener('click', () => openReturnModal(v));
  });
}

function bindSelectReturnBtns(container, vuelos, outbound) {
  container.querySelectorAll('.select-return-btn').forEach(btn => {
    const id = btn.dataset.id;
    const v  = vuelos.find(f => flightId(f) === id);
    if (v) btn.addEventListener('click', () => showTripSummary(outbound, v));
  });
}

function applyReturnFiltersAndSort(outbound) {
  if (!lastReturnData) return;
  const dateFrom = document.getElementById('rfDateFrom')?.value;
  const dateTo   = document.getElementById('rfDateTo')?.value;
  const maxPrice = parseFloat(document.getElementById('rfPrice')?.value ?? Infinity);
  const stopsVal = document.querySelector('.rfstop.active')?.dataset.val ?? '';
  const airline  = document.getElementById('rfAirline')?.value ?? '';
  const sortKey  = document.getElementById('rfSort')?.value ?? 'date-asc';
  const depFrom  = parseInt(document.getElementById('rfDepFrom')?.value ?? '0');
  const depTo    = parseInt(document.getElementById('rfDepTo')?.value   ?? '23');
  const arrFrom  = parseInt(document.getElementById('rfArrFrom')?.value ?? '0');
  const arrTo    = parseInt(document.getElementById('rfArrTo')?.value   ?? '23');
  const dfrom = parseDateInput(dateFrom);
  const dto   = parseDateInput(dateTo);
  const filtered = lastReturnData.vuelos.filter(v => {
    const vDate = parseDateYMD(v.fecha);
    if (dfrom && vDate < dfrom) return false;
    if (dto   && vDate > dto)   return false;
    if (parsePrice(v.precio) > maxPrice) return false;
    if (airline && v.aerolinea !== airline) return false;
    if (stopsVal === '0' && v.escalas !== 0) return false;
    if (stopsVal === '1' && v.escalas !== 1) return false;
    if (stopsVal === '2' && v.escalas < 2)   return false;
    if (activeReturnDestFilter && v.destino !== activeReturnDestFilter) return false;
    const depHour = parseInt((v.salida  || '0:0').split(':')[0]);
    const arrHour = parseInt((v.llegada || '0:0').split(':')[0]);
    if (depHour < depFrom || depHour > depTo) return false;
    if (arrHour < arrFrom || arrHour > arrTo) return false;
    return true;
  });
  filtered.sort((a, b) => {
    switch (sortKey) {
      case 'date-asc':     return parseDateYMD(a.fecha) - parseDateYMD(b.fecha);
      case 'date-desc':    return parseDateYMD(b.fecha) - parseDateYMD(a.fecha);
      case 'price-asc':    return parsePrice(a.precio) - parsePrice(b.precio);
      case 'price-desc':   return parsePrice(b.precio) - parsePrice(a.precio);
      case 'duration-asc': return durationMins(a.duracion) - durationMins(b.duracion);
      case 'stops-asc':    return a.escalas - b.escalas;
      case 'dep-asc':      return a.salida.localeCompare(b.salida);
      case 'dep-desc':     return b.salida.localeCompare(a.salida);
      case 'arr-asc':      return a.llegada.localeCompare(b.llegada);
      case 'arr-desc':     return b.llegada.localeCompare(a.llegada);
      default:             return 0;
    }
  });
  const virtualData = { ...lastReturnData, vuelos: filtered, total_vuelos: filtered.length };
  const returnGrid = document.getElementById('returnGrid');
  if (returnGrid) {
    returnGrid.innerHTML = renderResultsGridInner(virtualData, 'return', activeReturnRoute === '__flat__', excludedReturnRoutes);
    bindSaveBtns(returnGrid, filtered);
    bindSelectReturnBtns(returnGrid, filtered, outbound);
    bindRouteTabs(returnGrid);
  }
  const countEl = document.querySelector('#returnSection .results-count');
  if (countEl) countEl.innerHTML = t('flights_found', filtered.length);
}

function bindReturnFilterBarEvents(outbound) {
  ['rfDateFrom','rfDateTo','rfAirline','rfSort'].forEach(id =>
    document.getElementById(id)?.addEventListener('change', () => applyReturnFiltersAndSort(outbound))
  );
  const priceInput = document.getElementById('rfPrice');
  const priceVal   = document.getElementById('rfPriceVal');
  priceInput?.addEventListener('input', () => {
    if (priceVal) priceVal.textContent = `${priceInput.value}€`;
    applyReturnFiltersAndSort(outbound);
  });
  document.getElementById('rfStops')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.rfstop');
    if (!btn) return;
    document.querySelectorAll('.rfstop').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    applyReturnFiltersAndSort(outbound);
  });

  document.getElementById('rfDest')?.addEventListener('change', (e) => {
    activeReturnDestFilter = e.target.value;
    applyReturnFiltersAndSort(outbound);
  });
  function updateTimeLabel(fId, tId, fValId, tValId) {
    const f = document.getElementById(fId), t = document.getElementById(tId);
    if (f) document.getElementById(fValId).textContent = String(f.value).padStart(2,'0') + ':00';
    if (t) document.getElementById(tValId).textContent = String(t.value).padStart(2,'0') + ':00';
  }
  ['rfDepFrom','rfDepTo'].forEach(id => document.getElementById(id)?.addEventListener('input', () => {
    updateTimeLabel('rfDepFrom','rfDepTo','rfDepFromVal','rfDepToVal');
    applyReturnFiltersAndSort(outbound);
  }));
  ['rfArrFrom','rfArrTo'].forEach(id => document.getElementById(id)?.addEventListener('input', () => {
    updateTimeLabel('rfArrFrom','rfArrTo','rfArrFromVal','rfArrToVal');
    applyReturnFiltersAndSort(outbound);
  }));
  document.getElementById('rFilterResetBtn')?.addEventListener('click', () => {
    if (!lastReturnData) return;
    activeReturnDestFilter = '';
    excludedReturnRoutes.clear();
    activeReturnRoute = '__flat__';
    const rFilterBar = document.getElementById('rFilterBar');
    if (rFilterBar) {
      const newBar = document.createElement('div');
      newBar.innerHTML = buildReturnFilterBar(lastReturnData);
      rFilterBar.replaceWith(newBar.firstElementChild);
      bindReturnFilterBarEvents(outbound);
    }
    const returnGrid = document.getElementById('returnGrid');
    if (returnGrid) {
      returnGrid.innerHTML = renderResultsGridInner(lastReturnData, 'return', true, excludedReturnRoutes);
      bindSaveBtns(returnGrid, lastReturnData.vuelos);
      bindSelectReturnBtns(returnGrid, lastReturnData.vuelos, outbound);
      bindRouteTabs(returnGrid, () => applyReturnFiltersAndSort(outbound));
    }
  });
}

