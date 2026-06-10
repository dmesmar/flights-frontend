/* -------------------------------------------
   BARATOS (CHEAP DEALS) TAB
   Depends on: airports.js, render.js, saved.js,
               filters.js, app.js (createAirportSelector,
               executeSearch, simpleSearchMode, etc.)
------------------------------------------- */

/* ── Airport selectors ── */
const chSelectorFrom = createAirportSelector(
  document.getElementById('chSelectorFrom'),
  document.getElementById('chTagsFrom')
);
const chSelectorTo = createAirportSelector(
  document.getElementById('chSelectorTo'),
  document.getElementById('chTagsTo')
);

chSelectorFrom.setGetAllowed(isAirportAllowed);
chSelectorTo.setGetAllowed(isAirportAllowed);
chSelectorFrom.setOnChange(() => chSelectorTo.refresh());
chSelectorTo.setOnChange(() => chSelectorFrom.refresh());

/* ── Swap origin ↔ destination ── */
document.getElementById('swapCheap')?.addEventListener('click', () => {
  const fromSel = chSelectorFrom.getSelected();
  const toSel   = chSelectorTo.getSelected();
  chSelectorFrom.setSelected(toSel);
  chSelectorTo.setSelected(fromSel);
});

/* ── Simple search checkbox sync ── */
const chSimpleSearchCheck = document.getElementById('chSimpleSearchCheck');
if (chSimpleSearchCheck) {
  chSimpleSearchCheck.checked = simpleSearchMode;
  chSimpleSearchCheck.addEventListener('change', () => {
    setSimpleSearchMode(chSimpleSearchCheck.checked);
    ['simpleSearchCheck', 'exSimpleSearchCheck'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      el.checked = simpleSearchMode;
      const row = el.closest('.simple-search-row');
      if (row) { if (!simpleSearchMode) showSimpleSearchWarning(row); else hideSimpleSearchWarning(row); }
    });
    const row = chSimpleSearchCheck.closest('.simple-search-row');
    if (row) { if (!simpleSearchMode) showSimpleSearchWarning(row); else hideSimpleSearchWarning(row); }
  });
}

/* ── Show-all-airports checkbox sync ── */
const chShowAllAirportsCheck = document.getElementById('chShowAllAirportsCheck');
if (chShowAllAirportsCheck) {
  chShowAllAirportsCheck.checked = showAllAirports;
  chShowAllAirportsCheck.addEventListener('change', () => {
    applyShowAllAirports(chShowAllAirportsCheck.checked);
    ['showAllAirportsCheck', 'exShowAllAirportsCheck'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.checked = showAllAirports;
    });
  });
}

/* ── Max stops ── */
document.getElementById('chStopsRow')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.stop-btn');
  if (!btn) return;
  document.querySelectorAll('#chStopsRow .stop-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('chMaxStops').value = btn.dataset.value;
});

/* ── Day buttons ── */
document.getElementById('chDayBtnsRow')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.day-btn');
  if (!btn) return;
  btn.classList.toggle('active');
});

/* ── Date presets ── */
setupDatePresets('chDatePresets', 'chFechaIni', 'chFechaFin');

/* ── State ── */
let chRawData        = null;
let chSearchedFrom   = [];
let chSearchedDateIni = '';
let chSearchedDateFin = '';
let chAllCollapsed    = false;
let chGroupByOrigin   = false;

/* ═══════════════════════════════════════════
   FORM SUBMIT
═══════════════════════════════════════════ */
document.getElementById('cheapForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const fechaIni = document.getElementById('chFechaIni').value;
  const fechaFin = document.getElementById('chFechaFin').value;
  const from     = chSelectorFrom.getSelected();
  const to       = chSelectorTo.getSelected();
  const stops    = parseInt(document.getElementById('chMaxStops').value);

  if (!fechaIni || !fechaFin) { alert(t('alert_dates'));  return; }
  if (from.length === 0)      { alert(t('alert_origin')); return; }
  if (to.length === 0)        { alert(t('alert_dest'));   return; }

  const submitBtn = document.getElementById('chSubmitBtn');
  const resultsEl = document.getElementById('cheapResults');
  submitBtn.disabled    = true;
  submitBtn.textContent = t('btn_searching');

  const basePayload = {
    fecha_ini:    fechaIni.split('-').reverse().join('-'),
    fecha_fin:    fechaFin.split('-').reverse().join('-'),
    airport_to:   to,
    max_stops:    stops,
    max_results:  50, // fetch plenty to allow filtering (top 5 is applied client-side)
  };
  // Una petición por aeropuerto de origen, lanzadas en paralelo
  const payloads = from.map(origin => ({
    ...basePayload,
    search_id:    crypto.randomUUID(),
    airport_from: [origin],
  }));

  const dayFilter = [...document.querySelectorAll('#chDayBtnsRow .day-btn.active')].map(b => parseInt(b.dataset.day));

  const controller = new AbortController();
  resultsEl.innerHTML = renderSpinner(from.flatMap(f => to.map(t2 => `${f} \u2192 ${t2}`)));
  resultsEl.querySelector('#searchCancelBtn')?.addEventListener('click', () => controller.abort(), { once: true });

  try {
    const { data, elapsedMs } = await executeSearchParallel(payloads, resultsEl, controller, {
      showTimer: true,
      showEta:   true,
    });

    let vuelos = data.vuelos || [];
    if (dayFilter.length) {
      vuelos = vuelos.filter(v => dayFilter.includes(parseDateYMD(v.fecha).getDay()));
    }

    chRawData         = { ...data, vuelos };
    chSearchedFrom    = from;
    chSearchedDateIni = fechaIni;
    chSearchedDateFin = fechaFin;
    chAllCollapsed    = false;

    renderCheapSection(elapsedMs);

  } catch (err) {
    if (err.name === 'AbortError') {
      resultsEl.innerHTML = renderError(t('search_cancelled'));
    } else {
      resultsEl.innerHTML = renderError(err.isApiError ? err.message : t('conn_error_full'));
    }
  } finally {
    submitBtn.disabled    = false;
    submitBtn.textContent = t('cheap_btn_search');
  }
});

/* ═══════════════════════════════════════════
   RENDER
═══════════════════════════════════════════ */
function renderCheapSection(elapsedMs) {
  if (!chRawData) return;
  const resultsEl = document.getElementById('cheapResults');
  const airlines  = [...new Set(chRawData.vuelos.map(v => v.aerolinea))].sort();
  const prices    = chRawData.vuelos.map(v => parsePrice(v.precio)).filter(p => p > 0);
  const maxPrice  = prices.length ? Math.ceil(Math.max(...prices) / 10) * 10 : 1000;

  const elapsed = elapsedMs != null ? `${(elapsedMs / 1000).toFixed(1)} s` : '';
  resultsEl.innerHTML =
    buildCheapFilterBar(airlines, maxPrice) +
    `<div class="cheap-results-header">
       <span class="cheap-results-count" id="chResultsCount"></span>
       <span class="cheap-elapsed">${elapsed}</span>
       <button type="button" class="filter-reset-btn" id="chSaveSearchBtn">${t('ch_ss_save')}</button>
       <button type="button" class="filter-reset-btn" id="chDownloadBtn">${t('btn_download_json')}</button>
       <button type="button" class="filter-reset-btn" id="chCollapseAllBtn">${t('cheap_collapse_all')}</button>
     </div>` +
    `<div id="cheapGrid"></div>`;

  renderCheapGrid();
  bindCheapFilterEvents();

  document.getElementById('chSaveSearchBtn')?.addEventListener('click', () => {
    saveCheapSnapshot(chRawData, {
      from:     chSearchedFrom,
      fechaIni: chSearchedDateIni,
      fechaFin: chSearchedDateFin,
    });
    const btn = document.getElementById('chSaveSearchBtn');
    if (btn) { btn.textContent = t('btn_save_done'); btn.disabled = true; }
    if (!document.getElementById('tab-saved').classList.contains('hidden')) renderSavedCheapSearches();
  });

  document.getElementById('chDownloadBtn')?.addEventListener('click', () => {
    const origins = chSearchedFrom.join('_').replace(/[^a-zA-Z0-9_\-]/g, '') || 'baratos';
    const date = new Date().toISOString().slice(0, 10);
    const filename = `cheap_${origins}_${date}.json`;
    const blob = new Blob([JSON.stringify(chRawData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  });
}

function buildCheapFilterBar(airlines, maxPrice) {
  return `
    <div class="filter-bar" id="chFilterBar">
      <div class="filter-bar-top">
        <span class="filter-bar-title">${t('filter_title')}</span>
        <button type="button" class="filter-reset-btn" id="chFilterResetBtn">${t('filter_reset')}</button>
      </div>
      <div class="filter-section">
        <div class="filter-row">
          <div class="filter-group filter-group-price">
            <label class="filter-label">${t('cheap_max_price_label')} <span class="filter-price-val" id="chMaxPriceVal">${maxPrice}\u202f\u20ac</span></label>
            <input type="range" class="filter-range" id="chFMaxPrice" min="0" max="${maxPrice}" value="${maxPrice}" step="5" />
          </div>
          <div class="filter-group">
            <label class="filter-label">${t('filter_airline')}</label>
            <select class="filter-select" id="chFAirline">
              <option value="">${t('filter_all')}</option>
              ${airlines.map(a => `<option value="${escapeHtml(a)}">${escapeHtml(a)}</option>`).join('')}
            </select>
          </div>
          <div class="filter-group">
            <label class="filter-label">${t('cheap_sort_dests_label')}</label>
            <select class="filter-select" id="chFSort">
              <option value="price-asc">${t('cheap_sort_price_asc')}</option>
              <option value="price-desc">${t('cheap_sort_price_desc')}</option>
              <option value="alpha">${t('cheap_sort_alpha')}</option>
              <option value="count-desc">${t('cheap_sort_count')}</option>
            </select>
          </div>
        </div>
        <div class="filter-row filter-row-pills">
          <div class="filter-group filter-group-pills">
            <label class="filter-label">${t('filter_stops_label')}</label>
            <div class="filter-stops-row" id="chFStops">
              <button type="button" class="filter-stop-btn active" data-val="">${t('filter_all')}</button>
              <button type="button" class="filter-stop-btn" data-val="0">${t('badge_direct')}</button>
              <button type="button" class="filter-stop-btn" data-val="1">1</button>
              <button type="button" class="filter-stop-btn" data-val="2">2+</button>
            </div>
          </div>
          <div class="filter-group filter-group-pills filter-group-pills--compact">
            <label class="filter-label">${t('cheap_view_label')}</label>
            <div class="filter-stops-row" id="chFView">
              <button type="button" class="filter-stop-btn${!chGroupByOrigin ? ' active' : ''}" data-val="combined">${t('cheap_view_combined')}</button>
              <button type="button" class="filter-stop-btn${chGroupByOrigin ? ' active' : ''}" data-val="by-origin">${t('cheap_view_by_origin')}</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}

/* ── Render the destination grid ── */
function renderCheapGrid() {
  if (!chRawData) return;

  const topN     = 5;
  const maxPrice = parseFloat(document.getElementById('chFMaxPrice')?.value ?? Infinity);
  const airline  = document.getElementById('chFAirline')?.value ?? '';
  const sort     = document.getElementById('chFSort')?.value ?? 'price-asc';
  const stopsVal = document.querySelector('#chFStops .filter-stop-btn.active')?.dataset.val ?? '';

  // Update live max-price label
  const maxPriceEl  = document.getElementById('chMaxPriceVal');
  if (maxPriceEl) maxPriceEl.textContent = `${maxPrice}\u202f\u20ac`;

  // ── Shared helpers ──────────────────────────────────────────
  function buildDestGroups(vuelos) {
    const byDest = {};
    vuelos.forEach(v => { (byDest[v.destino] = byDest[v.destino] || []).push(v); });
    return Object.entries(byDest).map(([dest, dVuelos]) => {
      let filtered = dVuelos;
      if (airline)          filtered = filtered.filter(v => v.aerolinea === airline);
      if (stopsVal === '0') filtered = filtered.filter(v => v.escalas === 0);
      if (stopsVal === '1') filtered = filtered.filter(v => v.escalas === 1);
      if (stopsVal === '2') filtered = filtered.filter(v => v.escalas >= 2);
      if (!filtered.length) return null;

      filtered.sort((a, b) => {
        const pa = parsePrice(a.precio), pb = parsePrice(b.precio);
        if (!pa && !pb) return 0;
        if (!pa) return 1;
        if (!pb) return -1;
        return pa - pb;
      });
      const topFlights = filtered.slice(0, topN);
      const resolvedPrices = topFlights.map(v => parsePrice(v.precio)).filter(p => p > 0);
      const minPrice = resolvedPrices.length ? Math.min(...resolvedPrices) : null;
      if (minPrice !== null && minPrice > maxPrice) return null;
      return { dest, flights: topFlights, minPrice, totalFiltered: filtered.length };
    }).filter(Boolean);
  }

  function sortDestGroups(groups) {
    if (sort === 'price-asc')  groups.sort((a, b) => {
      if (a.minPrice === null && b.minPrice === null) return 0;
      if (a.minPrice === null) return 1;
      if (b.minPrice === null) return -1;
      return a.minPrice - b.minPrice;
    });
    if (sort === 'price-desc') groups.sort((a, b) => {
      if (a.minPrice === null && b.minPrice === null) return 0;
      if (a.minPrice === null) return 1;
      if (b.minPrice === null) return -1;
      return b.minPrice - a.minPrice;
    });
    if (sort === 'alpha')      groups.sort((a, b) => a.dest.localeCompare(b.dest));
    if (sort === 'count-desc') groups.sort((a, b) => b.totalFiltered - a.totalFiltered);
    return groups;
  }

  function renderDestCardHtml({ dest, flights, minPrice, totalFiltered }, origin) {
    const dstInfo   = airportInfo(dest);
    const hasMore   = totalFiltered > topN;
    const minFmt    = minPrice !== null ? `${minPrice.toFixed(2).replace('.', ',')}\u202f\u20ac` : '\u2013';
    const originAttr = origin ? ` data-origin="${escapeHtml(origin)}"` : '';
    return `
      <div class="cheap-dest-card" data-dest="${escapeHtml(dest)}"${originAttr}>
        <div class="cheap-dest-header">
          <div class="cheap-dest-info">
            <span class="cheap-dest-iata">${escapeHtml(dest)}</span>
            <span class="cheap-dest-sep">\u00b7</span>
            <span class="cheap-dest-city">${escapeHtml(dstInfo.city)}</span>
            <span class="cheap-dest-country">${countryLabel(dstInfo.country)}</span>
          </div>
          <div class="cheap-dest-meta">
            <span class="cheap-min-price">${t('cheap_from')} <strong>${minFmt}</strong></span>
            <span class="cheap-count-pill">${t('cheap_n_flights', flights.length)}</span>
            ${hasMore ? `<span class="cheap-more-badge">+${totalFiltered - topN} ${t('cheap_more')}</span>` : ''}
          </div>
          <div class="cheap-dest-actions">
            <button type="button" class="cheap-route-btn" data-dest="${escapeHtml(dest)}" title="${t('cheap_search_route_title')}">${t('cheap_search_route')} \u2197</button>
            <span class="cheap-chevron">${chAllCollapsed ? '\u25b6' : '\u25bc'}</span>
          </div>
        </div>
        <div class="cheap-flights flights-grid${chAllCollapsed ? ' cheap-collapsed' : ''}">
          ${flights.map(v => renderCheapCard(v)).join('')}
        </div>
      </div>`;
  }

  // ── Build HTML ───────────────────────────────────────────────
  const grid = document.getElementById('cheapGrid');
  if (!grid) return;

  let html = '';
  let totalDestsCount = 0, totalVuelosCount = 0;

  if (chGroupByOrigin) {
    // One section per origin, with its own dest groups
    const origins = chSearchedFrom.length
      ? chSearchedFrom
      : [...new Set((chRawData.vuelos || []).map(v => v.origen))];

    for (const origin of origins) {
      const oriFlights  = (chRawData.vuelos || []).filter(v => v.origen === origin);
      const destGroups  = sortDestGroups(buildDestGroups(oriFlights));
      if (!destGroups.length) continue;

      const oriInfo   = airportInfo(origin);
      const oriDests  = destGroups.length;
      const oriVuelos = destGroups.reduce((s, g) => s + g.flights.length, 0);
      totalDestsCount  += oriDests;
      totalVuelosCount += oriVuelos;

      html += `
        <div class="cheap-origin-section" data-origin="${escapeHtml(origin)}">
          <div class="cheap-origin-header">
            <span class="cheap-origin-iata">${escapeHtml(origin)}</span>
            <span class="cheap-origin-sep">\u00b7</span>
            <span class="cheap-origin-city">${escapeHtml(oriInfo.city)}</span>
            <span class="cheap-origin-count">${t('cheap_dests_found', oriDests, oriVuelos)}</span>
          </div>
          ${destGroups.map(g => renderDestCardHtml(g, origin)).join('')}
        </div>`;
    }
  } else {
    // All origins combined, grouped only by destination
    const destGroups = sortDestGroups(buildDestGroups(chRawData.vuelos || []));
    totalDestsCount  = destGroups.length;
    totalVuelosCount = destGroups.reduce((s, g) => s + g.flights.length, 0);
    html = destGroups.map(g => renderDestCardHtml(g)).join('');
  }

  // Update summary count
  const countEl = document.getElementById('chResultsCount');
  if (countEl) countEl.innerHTML = t('cheap_dests_found', totalDestsCount, totalVuelosCount);

  if (!totalDestsCount) {
    grid.innerHTML = renderError(t('cheap_no_results'));
    return;
  }

  grid.innerHTML = html;

  // Collapse/expand per-card clicks
  grid.querySelectorAll('.cheap-dest-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.cheap-route-btn')) return;
      const card    = header.closest('.cheap-dest-card');
      const body    = card.querySelector('.cheap-flights');
      const chevron = header.querySelector('.cheap-chevron');
      const isNowCollapsed = body.classList.toggle('cheap-collapsed');
      if (chevron) chevron.textContent = isNowCollapsed ? '\u25b6' : '\u25bc';
    });
  });

  // Bind save + route + return buttons after render
  _bindCheapSaveBtns(grid);
  _bindCheapRouteBtns(grid);
  _bindCheapReturnBtns(grid);
  startPriceResolution(grid);
}

/* ── Compact flight card for cheap tab ── */
function renderCheapCard(v) {
  const oriInfo  = airportInfo(v.origen);
  const dstInfo  = airportInfo(v.destino);
  const arrival  = v.adelanto_llegada ? `<sup class="next-day">${v.adelanto_llegada}</sup>` : '';
  const id       = flightId(v);
  const savedNow = isSaved(v);

  const needsResolve = v.precio === '\u2013';
  const resolveAttrs = needsResolve
    ? ` data-resolve-key="${escapeHtml(id)}" data-resolve-payload="${encodeURIComponent(JSON.stringify({ fecha: v.fecha, origen: v.origen, destino: v.destino, salida: timeOnly(v.salida), aerolinea: v.aerolinea, escalas: v.escalas }))}"`
    : '';
  const priceBlock = needsResolve
    ? `<div class="card-price-block">
        <span class="card-price price-resolving" data-resolve-price>\u2013</span>
        <span class="price-resolve-row">
          <span class="price-resolve-status">${t('price_resolving_status')}</span>
          <span class="price-resolve-tip-anchor" tabindex="0" aria-label="${t('price_resolving_tip_aria')}">&#x2139;<span class="price-resolve-tooltip" role="tooltip">${t('price_resolving_tooltip')}</span></span>
        </span>
      </div>`
    : `<span class="card-price">${v.precio}</span>`;

  return `
    <div class="flight-card" data-flight-id="${escapeHtml(id)}"${resolveAttrs}>
      <div class="card-top">
        <span class="card-date-label">${flightDateLabel(v.fecha)}</span>
        <span class="card-airline-name">${escapeHtml(v.aerolinea)}</span>
      </div>
      <div class="card-body">
        <div class="card-timeline">
          <div class="card-endpoint dep">
            <span class="endpoint-time">${timeOnly(v.salida)}</span>
            <span class="endpoint-iata">${escapeHtml(v.origen)}</span>
            <span class="endpoint-city">${escapeHtml(oriInfo.city)}</span>
          </div>
          <div class="card-mid">
            <span class="card-duration-label">${escapeHtml(v.duracion)}</span>
            <div class="card-flight-line"></div>
            ${stopsLabel(v.escalas)}
          </div>
          <div class="card-endpoint arr">
            <span class="endpoint-time">${timeOnly(v.llegada)}${arrival}</span>
            <span class="endpoint-iata">${escapeHtml(v.destino)}</span>
            <span class="endpoint-city">${escapeHtml(dstInfo.city)}</span>
          </div>
        </div>
      </div>
      <div class="card-footer">
        ${priceBlock}
        <div class="card-footer-right">
          ${v.url ? `<a class="book-btn" href="${escapeHtml(v.url)}" target="_blank" rel="noopener noreferrer" title="${t('book_btn_title')}">${t('book_btn_text')}</a>` : ''}
          <button class="return-btn" data-id="${escapeHtml(id)}" title="${t('btn_return_title')}">${t('btn_return_short')}</button>
          <button class="save-btn ${savedNow ? 'save-btn-active' : ''}" data-id="${escapeHtml(id)}"
            title="${t(savedNow ? 'save_title_saved' : 'save_title_save')}">
            ${savedNow ? '\u2665' : '\u2661'}
          </button>
        </div>
      </div>
    </div>`;
}

/* ── Update a destination card header with the current min resolved price ── */
function _updateCheapDestHeader(dest, origin) {
  if (!chRawData?.vuelos) return;
  const selector = origin
    ? `#cheapGrid .cheap-dest-card[data-dest="${CSS.escape(dest)}"][data-origin="${CSS.escape(origin)}"]`
    : `#cheapGrid .cheap-dest-card[data-dest="${CSS.escape(dest)}"]`;
  document.querySelectorAll(selector).forEach(card => {
    const prices = chRawData.vuelos
      .filter(v => v.destino === dest && (!origin || v.origen === origin))
      .map(v => parsePrice(v.precio))
      .filter(p => p > 0);
    if (!prices.length) return;
    const minPrice = Math.min(...prices);
    const priceEl = card.querySelector('.cheap-min-price strong');
    if (priceEl) priceEl.textContent = `${minPrice.toFixed(2).replace('.', ',')}\u202f\u20ac`;
  });
}

/* ── Bind save buttons (in-place, no full re-render) ── */
function _bindCheapSaveBtns(container) {
  container.querySelectorAll('.save-btn').forEach(btn => {
    const id = btn.dataset.id;
    const v  = chRawData?.vuelos.find(f => flightId(f) === id);
    if (!v) return;
    btn.addEventListener('click', () => {
      toggleSave(v);
      const saved = isSaved(v);
      btn.textContent = saved ? '\u2665' : '\u2661';
      btn.classList.toggle('save-btn-active', saved);
      btn.title = t(saved ? 'save_title_saved' : 'save_title_save');
    });
  });
}

/* ── "Buscar vuelta" buttons ── */
function _bindCheapReturnBtns(container) {
  container.querySelectorAll('.return-btn').forEach(btn => {
    const id = btn.dataset.id;
    const v  = chRawData?.vuelos.find(f => flightId(f) === id);
    if (!v) return;
    btn.addEventListener('click', () => openReturnModal(v));
  });
}

/* ── "Buscar ruta" buttons: pre-fill main search and switch tab ── */
function _bindCheapRouteBtns(container) {
  container.querySelectorAll('.cheap-route-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dest = btn.dataset.dest;
      // Switch to Search tab
      document.querySelector('.tab-btn[data-tab="search"]').click();
      // Pre-fill airports and dates
      selectorFrom.setSelected(chSearchedFrom);
      selectorTo.setSelected([dest]);
      document.getElementById('fechaIni').value = chSearchedDateIni;
      document.getElementById('fechaFin').value = chSearchedDateFin;
      // Scroll to top so the form is visible
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });
}

/* ── Filter bar events ── */
function bindCheapFilterEvents() {
  document.getElementById('chFMaxPrice')?.addEventListener('input', () => {
    const el = document.getElementById('chMaxPriceVal');
    if (el) el.textContent = `${document.getElementById('chFMaxPrice').value}\u202f\u20ac`;
    renderCheapGrid();
  });

  document.getElementById('chFAirline')?.addEventListener('change', renderCheapGrid);
  document.getElementById('chFSort')?.addEventListener('change', renderCheapGrid);

  document.getElementById('chFStops')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-stop-btn');
    if (!btn) return;
    document.querySelectorAll('#chFStops .filter-stop-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderCheapGrid();
  });

  document.getElementById('chFView')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-stop-btn');
    if (!btn) return;
    document.querySelectorAll('#chFView .filter-stop-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    chGroupByOrigin = btn.dataset.val === 'by-origin';
    renderCheapGrid();
  });

  document.getElementById('chCollapseAllBtn')?.addEventListener('click', () => {
    chAllCollapsed = !chAllCollapsed;
    const colBtn = document.getElementById('chCollapseAllBtn');
    if (colBtn) colBtn.textContent = t(chAllCollapsed ? 'cheap_expand_all' : 'cheap_collapse_all');
    document.querySelectorAll('#cheapGrid .cheap-flights').forEach(el =>
      el.classList.toggle('cheap-collapsed', chAllCollapsed));
    document.querySelectorAll('#cheapGrid .cheap-chevron').forEach(el =>
      { el.textContent = chAllCollapsed ? '\u25b6' : '\u25bc'; });
  });

  document.getElementById('chFilterResetBtn')?.addEventListener('click', () => {
    if (!chRawData) return;
    const airlines = [...new Set(chRawData.vuelos.map(v => v.aerolinea))].sort();
    const prices   = chRawData.vuelos.map(v => parsePrice(v.precio)).filter(p => p > 0);
    const maxPrice = prices.length ? Math.ceil(Math.max(...prices) / 10) * 10 : 1000;
    const bar      = document.getElementById('chFilterBar');
    if (bar) {
      const tmp = document.createElement('div');
      tmp.innerHTML = buildCheapFilterBar(airlines, maxPrice);
      bar.replaceWith(tmp.firstElementChild);
      bindCheapFilterEvents();
    }
    chAllCollapsed = false;
    renderCheapGrid();
  });
}

/* ── Language change: refresh selectors and rebuild results if visible ── */
onLangChange(() => {
  chSelectorFrom.refresh();
  chSelectorTo.refresh();
  if (chRawData && !document.getElementById('tab-cheap').classList.contains('hidden')) {
    renderCheapSection();
  }
});
