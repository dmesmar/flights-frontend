/* -------------------------------------------
   ROUND-TRIP PLANNER
   Two-phase search: outbound flights first,
   then return flights in the computed date
   window, paired client-side by stay duration.

   Depends on (all globals, load order):
     i18n.js           → t(), onLangChange()
     airports.js       → AIRPORTS
     render.js         → parsePrice, flightDateLabel, timeOnly,
                         stopsLabel, renderSpinner, renderError,
                         parseDateYMD, airportInfo, escapeHtml
     saved.js          → flightId, isSaved, toggleSave
     app.js            → createAirportSelector, executeSearch,
                         isAirportAllowed, startPriceResolution
     nearby-inline.js  → initNearbyInlinePanel  (loads before this file)
------------------------------------------- */

(function initRoundTripPlanner() {

  /* ── Airport selectors ──────────────────── */
  const rtSelectorOutFrom = createAirportSelector(
    document.getElementById('rtSelectorOutFrom'),
    document.getElementById('rtTagsOutFrom')
  );
  const rtSelectorOutTo = createAirportSelector(
    document.getElementById('rtSelectorOutTo'),
    document.getElementById('rtTagsOutTo')
  );
  const rtSelectorRetFrom = createAirportSelector(
    document.getElementById('rtSelectorRetFrom'),
    document.getElementById('rtTagsRetFrom')
  );
  const rtSelectorRetTo = createAirportSelector(
    document.getElementById('rtSelectorRetTo'),
    document.getElementById('rtTagsRetTo')
  );

  /* Apply the same "show important airports" filter as the other tabs */
  [rtSelectorOutFrom, rtSelectorOutTo, rtSelectorRetFrom, rtSelectorRetTo]
    .forEach(s => s.setGetAllowed(isAirportAllowed));

  /* ── Swap outbound origin ↔ destination ── */
  document.getElementById('swapRt')?.addEventListener('click', () => {
    const a = rtSelectorOutFrom.getSelected();
    const b = rtSelectorOutTo.getSelected();
    rtSelectorOutFrom.setSelected(b);
    rtSelectorOutTo.setSelected(a);
  });

  /* ── Stops row ─────────────────────────── */
  document.getElementById('rtStopsRow')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.stop-btn');
    if (!btn) return;
    document.querySelectorAll('#rtStopsRow .stop-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('rtMaxStops').value = btn.dataset.value;
  });

  /* ── Date presets ───────────────────────── */
  setupDatePresets('rtDatePresets', 'rtFechaIni', 'rtFechaFin');

  /* ── Nearby inline panels ───────────────── */
  function _attachNearby(selector, elId, panelId) {
    const el = document.getElementById(elId);
    if (!selector || !el) return;
    const fg = el.closest('.form-group');
    if (!fg) return;
    initNearbyInlinePanel(selector, fg, panelId);
  }
  _attachNearby(rtSelectorOutFrom, 'rtSelectorOutFrom', 'ni-rt-out-from');
  _attachNearby(rtSelectorOutTo,   'rtSelectorOutTo',   'ni-rt-out-to');
  _attachNearby(rtSelectorRetFrom, 'rtSelectorRetFrom', 'ni-rt-ret-from');
  _attachNearby(rtSelectorRetTo,   'rtSelectorRetTo',   'ni-rt-ret-to');

  /* ── Simple search checkbox ────────────────
     Mirrors the global simpleSearchMode flag, like the other tabs. */
  const rtSimpleChk = document.getElementById('rtSimpleSearchCheck');
  if (rtSimpleChk) {
    rtSimpleChk.checked = simpleSearchMode;
    rtSimpleChk.addEventListener('change', () => {
      setSimpleSearchMode(rtSimpleChk.checked);
      ['simpleSearchCheck', 'exSimpleSearchCheck', 'chSimpleSearchCheck'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        el.checked = simpleSearchMode;
        const row = el.closest('.simple-search-row');
        if (row) { if (!simpleSearchMode) showSimpleSearchWarning(row); else hideSimpleSearchWarning(row); }
      });
      const row = rtSimpleChk.closest('.simple-search-row');
      if (row) { if (!simpleSearchMode) showSimpleSearchWarning(row); else hideSimpleSearchWarning(row); }
    });
  }

  /* ── Show-all-airports checkbox ────────────
     Stays in sync with the global showAllAirports flag via the
     'showAllAirportsChanged' event dispatched by applyShowAllAirports().   */
  const rtShowAllChk = document.getElementById('rtShowAllAirportsCheck');
  if (rtShowAllChk) {
    rtShowAllChk.checked = showAllAirports;
    rtShowAllChk.addEventListener('change', () => {
      applyShowAllAirports(rtShowAllChk.checked);
      ['showAllAirportsCheck', 'exShowAllAirportsCheck', 'chShowAllAirportsCheck'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.checked = showAllAirports;
      });
    });
  }

  document.addEventListener('showAllAirportsChanged', (e) => {
    /* Re-apply the (possibly updated) isAirportAllowed filter on all 4 selectors */
    [rtSelectorOutFrom, rtSelectorOutTo, rtSelectorRetFrom, rtSelectorRetTo].forEach(s => {
      s.setGetAllowed(isAirportAllowed);
      s.clearDisallowed?.();
      s.refresh?.();
    });
    /* Sync the checkbox UI */
    if (rtShowAllChk) rtShowAllChk.checked = e.detail;
  });

  /* ── Module state ───────────────────────── */
  let rtRawGroups   = [];  // full paired results, never filtered in-place
  let rtRawOut      = [];  // raw outbound flights (for save/snapshot)
  let rtRawRet      = [];  // raw return flights (for save/snapshot)
  let rtElapsedS    = '?'; // last search elapsed time in seconds
  let rtMinStayCur  = 1;   // last search min stay
  let rtMaxStayCur  = 7;   // last search max stay
  let rtFilterState = {};  // current filter/sort values

  /* ═══════════════════════════════════════════
     FORM SUBMIT
  ═══════════════════════════════════════════ */
  document.getElementById('roundTripForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const fechaIni  = document.getElementById('rtFechaIni').value;
    const fechaFin  = document.getElementById('rtFechaFin').value;
    const outFrom   = rtSelectorOutFrom.getSelected();
    const outTo     = rtSelectorOutTo.getSelected();
    const retFrom   = rtSelectorRetFrom.getSelected();
    const retTo     = rtSelectorRetTo.getSelected();
    const minStay   = Math.max(1, parseInt(document.getElementById('rtMinStay').value)   || 1);
    let   maxStay   = Math.max(minStay, parseInt(document.getElementById('rtMaxStay').value) || 7);
    const maxStops  = parseInt(document.getElementById('rtMaxStops').value) || 0;
    const maxResults = Math.max(1, parseInt(document.getElementById('rtMaxResults')?.value) || 3);

    /* Validation */
    if (!fechaIni || !fechaFin)  { alert(t('alert_dates'));          return; }
    if (!outFrom.length)         { alert(t('rt_alert_out_from'));    return; }
    if (!outTo.length)           { alert(t('rt_alert_out_to'));      return; }
    if (!retFrom.length)         { alert(t('rt_alert_ret_from'));    return; }
    if (!retTo.length)           { alert(t('rt_alert_ret_to'));      return; }

    const submitBtn = document.getElementById('rtSubmitBtn');
    submitBtn.disabled    = true;
    submitBtn.textContent = t('rt_phase_1');

    const resultsEl = document.getElementById('rtResults');

    /* Convert YYYY-MM-DD → DD-MM-YYYY for the backend */
    const toBack = s => s.split('-').reverse().join('-');

    /* Show spinner */
    const allRoutes = outFrom.flatMap(f => outTo.map(d => `${f} → ${d}`));
    resultsEl.innerHTML = renderSpinner(allRoutes);

    const searchStart = Date.now();
    const timerInterval = setInterval(() => {
      const el = resultsEl.querySelector('#spinnerTimer');
      if (el) el.textContent = Math.floor((Date.now() - searchStart) / 1000) + ' s';
    }, 1000);

    const controller = new AbortController();
    resultsEl.querySelector('#searchCancelBtn')?.addEventListener('click',
      () => controller.abort(), { once: true });

    /* ── Phase 1 payload ── */
    const payloadOut = {
      search_id:    crypto.randomUUID(),
      fecha_ini:    toBack(fechaIni),
      fecha_fin:    toBack(fechaFin),
      airport_from: outFrom,
      airport_to:   outTo,
      max_stops:    maxStops,
      max_results:  maxResults,
    };

    try {
      /* ─── Phase 1: outbound ─────────────── */
      const { data: dataOut } = await executeSearch(payloadOut, resultsEl, controller, {
        showEta:           true,
        progressTransform: pct => pct * 0.5,   // 0 → 50 %
      });

      if (!dataOut.vuelos?.length) {
        resultsEl.innerHTML =
          `<div class="results-placeholder"><span class="placeholder-icon">✈️</span>` +
          `${t('rt_no_outbound')}</div>`;
        return;
      }

      /* Update phase label in spinner */
      const statusEl = resultsEl.querySelector('#progressStatus');
      if (statusEl) statusEl.textContent = t('rt_phase_2');
      submitBtn.textContent = t('rt_phase_2');

      /* ─── Compute return date window ──── */
      const outDates  = dataOut.vuelos.map(v => parseDateYMD(v.fecha));
      const minOutMs  = Math.min(...outDates.map(d => d.getTime()));
      const maxOutMs  = Math.max(...outDates.map(d => d.getTime()));
      const retIni    = new Date(minOutMs); retIni.setDate(retIni.getDate() + minStay);
      const retFin    = new Date(maxOutMs); retFin.setDate(retFin.getDate() + maxStay);

      const fmtBack = d => {
        const dd = String(d.getDate()).padStart(2,'0');
        const mm = String(d.getMonth() + 1).padStart(2,'0');
        return `${dd}-${mm}-${d.getFullYear()}`;
      };

      /* ── Phase 2 payload ── */
      const payloadRet = {
        search_id:    crypto.randomUUID(),
        fecha_ini:    fmtBack(retIni),
        fecha_fin:    fmtBack(retFin),
        airport_from: retFrom,
        airport_to:   retTo,
        max_stops:    maxStops,
        max_results:  maxResults,
      };

      /* ─── Phase 2: return ───────────────── */
      const { data: dataRet } = await executeSearch(payloadRet, resultsEl, controller, {
        showEta:           true,
        progressTransform: pct => 50 + pct * 0.5,  // 50 → 100 %
      });

      if (!dataRet.vuelos?.length) {
        resultsEl.innerHTML =
          `<div class="results-placeholder"><span class="placeholder-icon">↩️</span>` +
          `${t('rt_no_return')}</div>`;
        return;
      }

      /* ─── Phase 3: pair client-side ──────── */
      const groups = _pairTrips(dataOut.vuelos, dataRet.vuelos, minStay, maxStay);

      if (!groups.length) {
        resultsEl.innerHTML =
          `<div class="results-placeholder"><span class="placeholder-icon">🌍</span>` +
          `${t('rt_no_trips')}</div>`;
        return;
      }

      /* Build results UI */
      rtRawGroups   = groups;
      rtRawOut      = dataOut.vuelos;
      rtRawRet      = dataRet.vuelos;
      rtElapsedS    = ((Date.now() - searchStart) / 1000).toFixed(1);
      rtMinStayCur  = minStay;
      rtMaxStayCur  = maxStay;
      rtFilterState = _buildInitialFilterState(groups);

      resultsEl.innerHTML =
        _buildFilterBarHtml(groups) +
        _buildRtResultsHeader() +
        `<div id="rtGrid"></div>`;

      _renderGrid();
      _bindFilterEvents();
      _bindRtResultsHeaderBtns(outFrom, outTo, retFrom, retTo);

      /* Kick off hidden-price resolution on the rendered cards */
      const grid = document.getElementById('rtGrid');
      if (grid) startPriceResolution(grid);

    } catch (err) {
      if (err.name === 'AbortError') {
        resultsEl.innerHTML = renderError(t('search_cancelled'));
      } else {
        resultsEl.innerHTML = renderError(err.isApiError ? err.message : t('conn_error_full'));
      }
    } finally {
      clearInterval(timerInterval);
      submitBtn.disabled    = false;
      submitBtn.textContent = t('rt_btn_search');
    }
  });

  /* ═══════════════════════════════════════════
     CORE: PAIR TRIPS
  ═══════════════════════════════════════════ */

  /**
   * Returns true only when the price string represents a real,
   * positive amount. "-", "", null, "0 €", etc. all return false —
   * those flights must not contribute to totals or bestTotal.
   */
  function _isPriceUsable(priceStr) {
    if (priceStr == null) return false;
    const s = String(priceStr).trim();
    if (!s || s === '-' || s === '—' || s === '?' || s.toLowerCase() === 'n/a') return false;
    return parsePrice(s) > 0;
  }

  /**
   * For each outbound flight, find all return flights whose departure date
   * falls within [outbound_date + minStay, outbound_date + maxStay].
   * Returns groups sorted by cheapest available total price.
   */
  function _pairTrips(outVuelos, retVuelos, minStay, maxStay) {
    const groups = new Map();  // outboundId → group object

    for (const out of outVuelos) {
      const outDate = parseDateYMD(out.fecha);
      const validReturns = [];

      for (const ret of retVuelos) {
        const retDate = parseDateYMD(ret.fecha);
        const stay = Math.round((retDate.getTime() - outDate.getTime()) / 86400000);
        if (stay < minStay || stay > maxStay) continue;

        /* Skip pairs where EITHER price is unknown / "-".
           A missing price would otherwise be treated as 0 and the trip
           would appear artificially cheap (poisoning sort + bestTotal). */
        if (!_isPriceUsable(out.precio) || !_isPriceUsable(ret.precio)) continue;

        const outP = parsePrice(out.precio);
        const retP = parsePrice(ret.precio);
        validReturns.push({ flight: ret, total: outP + retP, stay });
      }

      if (!validReturns.length) continue;

      /* Sort each outbound's returns by total price ascending, then by stay */
      validReturns.sort((a, b) => a.total - b.total || a.stay - b.stay);

      const key = flightId(out);
      if (!groups.has(key)) {
        groups.set(key, {
          outbound:  out,
          returns:   validReturns,
          bestTotal: validReturns[0].total,
        });
      }
    }

    /* Sort outbound groups by their cheapest return trip */
    return [...groups.values()].sort((a, b) => a.bestTotal - b.bestTotal);
  }

  /* ═══════════════════════════════════════════
     FILTER STATE
  ═══════════════════════════════════════════ */
  function _buildInitialFilterState(groups) {
    const allTotals = groups.flatMap(g => g.returns.map(r => r.total)).filter(v => v > 0);
    const maxTotal  = allTotals.length ? Math.ceil(Math.max(...allTotals) / 5) * 5 : 2000;
    const nights    = groups.flatMap(g => g.returns.map(r => r.stay));
    const prevSize  = parseInt(localStorage.getItem('rtPageSize')) || 10;
    return {
      maxSlider:   maxTotal,
      maxTotalVal: maxTotal,
      outOriAirports: null,   // null = all (outbound origin)
      outAirports:    null,   // null = all (outbound destination)
      retAirports:    null,   // null = all (return origin)
      retDstAirports: null,   // null = all (return destination)
      minNights:  Math.min(...nights),
      maxNights:  Math.max(...nights),
      sort: 'total-asc',
      page: 1,
      pageSize: prevSize,
    };
  }

  /* ═══════════════════════════════════════════
     FILTER BAR HTML
  ═══════════════════════════════════════════ */
  function _buildFilterBarHtml(groups) {
    const allTotals = groups.flatMap(g => g.returns.map(r => r.total)).filter(v => v > 0);
    const maxTotal  = allTotals.length ? Math.ceil(Math.max(...allTotals) / 5) * 5 : 2000;

    const outOriAirports = [...new Set(groups.map(g => g.outbound.origen))].sort();
    const outDstAirports = [...new Set(groups.map(g => g.outbound.destino))].sort();
    const retOriAirports = [...new Set(groups.flatMap(g => g.returns.map(r => r.flight.origen)))].sort();
    const retDstAirports = [...new Set(groups.flatMap(g => g.returns.map(r => r.flight.destino)))].sort();
    const nights      = groups.flatMap(g => g.returns.map(r => r.stay));
    const minN        = Math.min(...nights);
    const maxN        = Math.max(...nights);

    const _airChecks = (airports, cls) =>
      airports.map(a =>
        `<label class="rt-fb-check">
          <input type="checkbox" class="${cls}" value="${escapeHtml(a)}" checked />
          <span>${escapeHtml(a)} · ${escapeHtml(airportInfo(a).city)}</span>
        </label>`
      ).join('');

    const outOriFilter = outOriAirports.length > 1
      ? `<div class="rt-fb-group">
          <label class="rt-fb-label">${t('rt_filter_out_origin')}</label>
          <div class="rt-fb-checks">${_airChecks(outOriAirports, 'rt-out-ori-chk')}</div>
        </div>`
      : '';

    const outAirFilter = outDstAirports.length > 1
      ? `<div class="rt-fb-group">
          <label class="rt-fb-label">${t('rt_filter_out_airport')}</label>
          <div class="rt-fb-checks">${_airChecks(outDstAirports, 'rt-out-air-chk')}</div>
        </div>`
      : '';

    const retAirFilter = retOriAirports.length > 1
      ? `<div class="rt-fb-group">
          <label class="rt-fb-label">${t('rt_filter_ret_airport')}</label>
          <div class="rt-fb-checks">${_airChecks(retOriAirports, 'rt-ret-air-chk')}</div>
        </div>`
      : '';

    const retDstFilter = retDstAirports.length > 1
      ? `<div class="rt-fb-group">
          <label class="rt-fb-label">${t('rt_filter_ret_dest')}</label>
          <div class="rt-fb-checks">${_airChecks(retDstAirports, 'rt-ret-dst-chk')}</div>
        </div>`
      : '';

    /* Count how many airport filter sections will be visible */
    const airportFilters = [outOriFilter, outAirFilter, retAirFilter, retDstFilter]
      .filter(Boolean);
    /* Open by default only when there are 2 or fewer filters (1-2 are compact);
       collapse them when 3+ so the bar stays tidy. */
    const openByDefault = airportFilters.length > 0 && airportFilters.length <= 2;
    const airportsBlock = airportFilters.length ? `
      <details class="rt-fb-airports-details" id="rtFbAirportsDetails"${openByDefault ? ' open' : ''}>
        <summary class="rt-fb-airports-summary">
          <span>${t('rt_filter_airports_toggle', airportFilters.length)}</span>
          <span class="rt-fb-chevron">▾</span>
        </summary>
        <div class="rt-fb-airports-body">
          ${airportFilters.join('')}
        </div>
      </details>` : '';

    return `
      <div class="rt-filter-bar" id="rtFilterBar">
        <div class="rt-fb-row rt-fb-row-primary">
          <div class="rt-fb-group rt-fb-group-price">
            <label class="rt-fb-label" for="rtFbPrice">
              ${t('rt_filter_total_price')}: <strong id="rtFbPriceVal">${maxTotal}&nbsp;€</strong>
            </label>
            <input type="range" id="rtFbPrice" class="rt-fb-slider"
                   min="0" max="${maxTotal}" value="${maxTotal}" step="5" />
          </div>
          <div class="rt-fb-group">
            <label class="rt-fb-label">
              ${t('rt_filter_stay')}: <strong id="rtFbNightsVal">${minN}–${maxN} ${t('rt_nights')}</strong>
            </label>
            <div class="rt-fb-nights-row">
              <input type="number" id="rtFbNightsMin" class="rt-fb-nights-input"
                     min="${minN}" max="${maxN}" value="${minN}" />
              <span>–</span>
              <input type="number" id="rtFbNightsMax" class="rt-fb-nights-input"
                     min="${minN}" max="${maxN}" value="${maxN}" />
            </div>
          </div>
          <div class="rt-fb-group">
            <label class="rt-fb-label" for="rtFbSort">${t('filter_sort')}</label>
            <select id="rtFbSort" class="rt-fb-sel">
              <option value="total-asc">${t('rt_sort_total_asc')}</option>
              <option value="total-desc">${t('rt_sort_total_desc')}</option>
              <option value="date-asc">${t('sort_date_asc')}</option>
              <option value="date-desc">${t('sort_date_desc')}</option>
            </select>
          </div>
          <button type="button" class="rt-fb-reset" id="rtFbReset">${t('filter_reset')}</button>
        </div>
        ${airportsBlock}
      </div>`;
  }

  function _bindFilterEvents() {
    const bar = document.getElementById('rtFilterBar');
    if (!bar) return;

    function _readAndRender() {
      const priceEl    = document.getElementById('rtFbPrice');
      const nightsMinEl = document.getElementById('rtFbNightsMin');
      const nightsMaxEl = document.getElementById('rtFbNightsMax');
      const sortEl     = document.getElementById('rtFbSort');
      const priceValEl = document.getElementById('rtFbPriceVal');
      const nightsValEl = document.getElementById('rtFbNightsVal');

      const maxTotalVal = parseFloat(priceEl?.value) || Infinity;
      const minNights   = parseInt(nightsMinEl?.value) || 0;
      const maxNights   = parseInt(nightsMaxEl?.value) || 999;
      const sortVal     = sortEl?.value || 'total-asc';

      const _readChecks = (cls) => {
        const els = bar.querySelectorAll(`.${cls}`);
        return els.length
          ? new Set([...els].filter(c => c.checked).map(c => c.value))
          : null;
      };
      const outOriAirports = _readChecks('rt-out-ori-chk');
      const outAirports    = _readChecks('rt-out-air-chk');
      const retAirports    = _readChecks('rt-ret-air-chk');
      const retDstAirports = _readChecks('rt-ret-dst-chk');

      if (priceValEl) priceValEl.innerHTML = `${maxTotalVal}&nbsp;€`;
      if (nightsValEl) {
        const nightWord = maxNights === 1 ? t('rt_night') : t('rt_nights');
        nightsValEl.textContent = `${minNights}–${maxNights} ${nightWord}`;
      }

      /* Filter changes reset to page 1, keep pageSize */
      const pageSize = rtFilterState.pageSize || 10;
      rtFilterState = {
        maxTotalVal, outOriAirports, outAirports, retAirports, retDstAirports,
        minNights, maxNights, sort: sortVal, page: 1, pageSize,
      };
      _renderGrid();
    }

    bar.addEventListener('input',  _readAndRender);
    bar.addEventListener('change', _readAndRender);

    document.getElementById('rtFbReset')?.addEventListener('click', () => {
      /* Restore slider to max */
      const allTotals = rtRawGroups.flatMap(g => g.returns.map(r => r.total)).filter(v => v > 0);
      const maxTotal  = allTotals.length ? Math.ceil(Math.max(...allTotals) / 5) * 5 : 2000;
      const priceEl   = document.getElementById('rtFbPrice');
      if (priceEl) { priceEl.max = maxTotal; priceEl.value = maxTotal; }

      /* Restore checkboxes (all 4 airport filters) */
      bar.querySelectorAll(
        '.rt-out-ori-chk, .rt-out-air-chk, .rt-ret-air-chk, .rt-ret-dst-chk'
      ).forEach(c => { c.checked = true; });

      /* Restore night inputs */
      const nights  = rtRawGroups.flatMap(g => g.returns.map(r => r.stay));
      const minNEl  = document.getElementById('rtFbNightsMin');
      const maxNEl  = document.getElementById('rtFbNightsMax');
      if (minNEl) minNEl.value = Math.min(...nights);
      if (maxNEl) maxNEl.value = Math.max(...nights);

      /* Restore sort */
      const sortEl = document.getElementById('rtFbSort');
      if (sortEl) sortEl.value = 'total-asc';

      _readAndRender();
    });
  }

  /* ═══════════════════════════════════════════
     RENDER GRID
  ═══════════════════════════════════════════ */
  function _renderGrid() {
    const grid   = document.getElementById('rtGrid');
    const lblEl  = document.getElementById('rtFoundLabel');
    if (!grid) return;

    const { maxTotalVal, outOriAirports, outAirports, retAirports, retDstAirports,
            minNights, maxNights, sort } = rtFilterState;

    /* Apply filters */
    const filtered = rtRawGroups.map(group => {
      /* Filter by outbound origin / arrival airport */
      if (outOriAirports && !outOriAirports.has(group.outbound.origen))  return null;
      if (outAirports    && !outAirports.has(group.outbound.destino))    return null;

      /* Filter returns */
      const filteredReturns = group.returns.filter(r => {
        if (maxTotalVal < Infinity && r.total > maxTotalVal) return false;
        if (retAirports    && !retAirports.has(r.flight.origen))   return false;
        if (retDstAirports && !retDstAirports.has(r.flight.destino)) return false;
        if (r.stay < minNights || r.stay > maxNights) return false;
        return true;
      });
      if (!filteredReturns.length) return null;

      return { ...group, returns: filteredReturns, bestTotal: filteredReturns[0].total };
    }).filter(Boolean);

    /* Sort groups */
    switch (sort) {
      case 'total-asc':  filtered.sort((a, b) => a.bestTotal - b.bestTotal); break;
      case 'total-desc': filtered.sort((a, b) => b.bestTotal - a.bestTotal); break;
      case 'date-asc':   filtered.sort((a, b) => parseDateYMD(a.outbound.fecha) - parseDateYMD(b.outbound.fecha)); break;
      case 'date-desc':  filtered.sort((a, b) => parseDateYMD(b.outbound.fecha) - parseDateYMD(a.outbound.fecha)); break;
    }

    /* Update found label */
    const totalTrips = filtered.reduce((s, g) => s + g.returns.length, 0);
    if (lblEl) lblEl.innerHTML = t('rt_found', filtered.length, totalTrips);

    if (!filtered.length) {
      grid.innerHTML =
        `<div class="results-placeholder"><span class="placeholder-icon">🔍</span>` +
        `${t('no_match_filters')}</div>`;
      return;
    }

    /* ── Pagination ── */
    const pageSize  = Math.max(1, rtFilterState.pageSize || 10);
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
    let curPage = Math.min(Math.max(1, rtFilterState.page || 1), totalPages);
    rtFilterState.page = curPage;

    const fromIdx = (curPage - 1) * pageSize;
    const toIdx   = Math.min(fromIdx + pageSize, filtered.length);
    const pageGroups = filtered.slice(fromIdx, toIdx);

    /* Render only the current page */
    const groupsHtml = pageGroups.map((g, i) =>
      _renderTripGroup(g, i === 0 && curPage === 1)
    ).join('');
    /* Pagination both at top (compact) and bottom (full) when >1 page */
    const showTopPag = totalPages > 1;
    const topPag     = showTopPag
      ? _buildPaginationHtml(fromIdx + 1, toIdx, filtered.length, curPage, totalPages, pageSize, true)
      : '';
    const bottomPag  = _buildPaginationHtml(fromIdx + 1, toIdx, filtered.length, curPage, totalPages, pageSize, false);
    grid.innerHTML = topPag + groupsHtml + bottomPag;

    /* Expand buttons */
    grid.querySelectorAll('.rt-expand-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const list = btn.closest('.rt-returns-list');
        list?.querySelectorAll('.rt-return-row-hidden').forEach(row =>
          row.classList.remove('rt-return-row-hidden')
        );
        btn.remove();
      });
    });

    /* Pagination handlers */
    _bindPaginationEvents(grid, totalPages);

    /* Save buttons — only operate on page-visible groups */
    grid.querySelectorAll('.rt-save-btn').forEach(btn => {
      const fid = btn.dataset.id;
      if (!fid) return;

      /* Find the flight object by id (search across full filtered list so
         the visible save buttons still resolve correctly) */
      let flight = null;
      outer:
      for (const g of pageGroups) {
        if (flightId(g.outbound) === fid) { flight = g.outbound; break outer; }
        for (const r of g.returns) {
          if (flightId(r.flight) === fid) { flight = r.flight; break outer; }
        }
      }
      if (!flight) return;

      btn.addEventListener('click', () => {
        toggleSave(flight);
        const saved = isSaved(flight);
        btn.textContent = saved ? '♥' : '♡';
        btn.classList.toggle('save-btn-active', saved);
        btn.title = t(saved ? 'save_title_saved' : 'save_title_save');
      });
    });
  }

  /* ═══════════════════════════════════════════
     PAGINATION
  ═══════════════════════════════════════════ */
  const PAGE_SIZE_OPTIONS = [5, 10, 25, 50, 100];

  function _buildPaginationHtml(from, to, total, curPage, totalPages, pageSize, compact) {
    /* Page-number list with ellipsis: 1 … cur-1 cur cur+1 … N */
    const pageNumbers = [];
    const push = n => pageNumbers.push(n);
    const pushGap = () => pageNumbers.push('…');

    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) push(i);
    } else {
      push(1);
      if (curPage > 3) pushGap();
      const start = Math.max(2, curPage - 1);
      const end   = Math.min(totalPages - 1, curPage + 1);
      for (let i = start; i <= end; i++) push(i);
      if (curPage < totalPages - 2) pushGap();
      push(totalPages);
    }

    const pageBtns = pageNumbers.map(n => {
      if (n === '…') return `<span class="rt-page-ellipsis">…</span>`;
      const active = n === curPage ? ' rt-page-num-active' : '';
      return `<button type="button" class="rt-page-num${active}" data-page="${n}">${n}</button>`;
    }).join('');

    /* Compact (top) variant: only nav, no info / size selector */
    if (compact) {
      return `
        <div class="rt-pagination rt-pagination-compact" id="rtPaginationTop">
          <span class="rt-pag-showing-mini">${t('rt_showing', from, to, total)}</span>
          <div class="rt-pag-nav">
            <button type="button" class="rt-page-btn rt-page-btn-prev-top"${curPage === 1 ? ' disabled' : ''} aria-label="${t('rt_page_prev')}">←</button>
            <div class="rt-page-nums">${pageBtns}</div>
            <button type="button" class="rt-page-btn rt-page-btn-next-top"${curPage === totalPages ? ' disabled' : ''} aria-label="${t('rt_page_next')}">→</button>
          </div>
        </div>`;
    }

    const sizeOpts = PAGE_SIZE_OPTIONS.map(n =>
      `<option value="${n}"${n === pageSize ? ' selected' : ''}>${n}</option>`
    ).join('');

    return `
      <div class="rt-pagination" id="rtPagination">
        <div class="rt-pag-info">
          <span class="rt-pag-showing">${t('rt_showing', from, to, total)}</span>
          <label class="rt-pag-size-label">
            <span>${t('rt_page_size')}:</span>
            <select class="rt-pag-size-sel" id="rtPagSize">${sizeOpts}</select>
          </label>
        </div>
        <div class="rt-pag-nav">
          <button type="button" class="rt-page-btn" id="rtPagPrev"${curPage === 1 ? ' disabled' : ''}>${t('rt_page_prev')}</button>
          <div class="rt-page-nums">${pageBtns}</div>
          <button type="button" class="rt-page-btn" id="rtPagNext"${curPage === totalPages ? ' disabled' : ''}>${t('rt_page_next')}</button>
        </div>
      </div>`;
  }

  function _bindPaginationEvents(grid, totalPages) {
    /* Cover both the top compact bar and the bottom full bar with delegation */
    grid.querySelectorAll('.rt-pagination').forEach(pag => {
      pag.addEventListener('click', (ev) => {
        const target = ev.target.closest('button');
        if (!target || target.disabled) return;

        if (target.matches('#rtPagPrev, .rt-page-btn-prev-top')) {
          if (rtFilterState.page > 1) {
            rtFilterState.page -= 1;
            _renderGrid();
            _scrollToTopOfGrid();
          }
          return;
        }
        if (target.matches('#rtPagNext, .rt-page-btn-next-top')) {
          if (rtFilterState.page < totalPages) {
            rtFilterState.page += 1;
            _renderGrid();
            _scrollToTopOfGrid();
          }
          return;
        }
        if (target.matches('.rt-page-num')) {
          const n = parseInt(target.dataset.page);
          if (Number.isInteger(n) && n !== rtFilterState.page) {
            rtFilterState.page = n;
            _renderGrid();
            _scrollToTopOfGrid();
          }
        }
      });

      pag.querySelector('#rtPagSize')?.addEventListener('change', (e) => {
        const newSize = parseInt(e.target.value) || 10;
        rtFilterState.pageSize = newSize;
        rtFilterState.page = 1;
        try { localStorage.setItem('rtPageSize', String(newSize)); } catch(e) {}
        _renderGrid();
        _scrollToTopOfGrid();
      });
    });
  }

  function _scrollToTopOfGrid() {
    const grid = document.getElementById('rtGrid');
    if (!grid) return;
    const top = grid.getBoundingClientRect().top + window.scrollY - 16;
    window.scrollTo({ top, behavior: 'smooth' });
  }

  /* ═══════════════════════════════════════════
     RENDER ONE TRIP GROUP
  ═══════════════════════════════════════════ */
  const VISIBLE_RETURNS = 3;

  function _renderTripGroup(group, isFirst) {
    const out      = group.outbound;
    const oriInfo  = airportInfo(out.origen);
    const dstInfo  = airportInfo(out.destino);
    const arrival  = out.adelanto_llegada
      ? `<sup class="next-day">${escapeHtml(out.adelanto_llegada)}</sup>` : '';
    const outSaved = isSaved(out);
    const outId    = flightId(out);
    const outBook  = out.url
      ? `<a class="book-btn rt-out-book" href="${escapeHtml(out.url)}" target="_blank" rel="noopener noreferrer"
            title="${t('book_btn_title')}">${t('rt_book_out')}</a>`
      : '';

    /* ── Return rows ── */
    const returnsHtml = group.returns.map((r, i) => {
      const isBest     = i === 0;
      const isHidden   = i >= VISIBLE_RETURNS;
      const ret        = r.flight;
      const retOri     = airportInfo(ret.origen);
      const retDst     = airportInfo(ret.destino);
      const retArrival = ret.adelanto_llegada
        ? `<sup class="next-day">${escapeHtml(ret.adelanto_llegada)}</sup>` : '';
      const retSaved   = isSaved(ret);
      const retId      = flightId(ret);
      const totalStr   = r.total > 0
        ? r.total.toFixed(2).replace('.', ',') + ' €' : '?';
      const nightWord  = r.stay === 1 ? t('rt_night') : t('rt_nights');

      const retBookBtn = ret.url
        ? `<a class="book-btn rt-book-ret" href="${escapeHtml(ret.url)}" target="_blank" rel="noopener noreferrer"
              title="${t('book_btn_title')}">${t('rt_book_ret')}</a>`
        : '';

      return `
        <div class="rt-return-row${isBest ? ' rt-return-best' : ''}${isHidden ? ' rt-return-row-hidden' : ''}">
          <div class="rt-ret-when">
            ${isBest ? '<span class="rt-best-badge" title="✦">✦</span>' : ''}
            <span class="rt-ret-date-text">${flightDateLabel(ret.fecha)}</span>
            <span class="rt-stay-badge">${r.stay} ${nightWord}</span>
          </div>
          <div class="rt-ret-flight">
            <div class="rt-ret-line-1">
              <span class="rt-ret-route">${escapeHtml(ret.origen)} → ${escapeHtml(ret.destino)}</span>
              <span class="rt-ret-airline">${escapeHtml(ret.aerolinea)}</span>
            </div>
            <div class="rt-ret-line-2">
              <span class="rt-ret-times">${timeOnly(ret.salida)} → ${timeOnly(ret.llegada)}${retArrival}</span>
              ${stopsLabel(ret.escalas)}
              <span class="rt-ret-price-tag">${escapeHtml(ret.precio)}</span>
            </div>
          </div>
          <div class="rt-ret-total-col">
            <span class="rt-ret-total-label">${t('rt_total')}</span>
            <span class="rt-ret-total-val">${totalStr}</span>
            <div class="rt-ret-actions">
              ${outBook}
              ${retBookBtn}
              <button class="rt-save-btn${retSaved ? ' save-btn-active' : ''}"
                      data-id="${escapeHtml(retId)}"
                      title="${t(retSaved ? 'save_title_saved' : 'save_title_save')}">${retSaved ? '♥' : '♡'}</button>
            </div>
          </div>
        </div>`;
    }).join('');

    const hiddenCount = Math.max(0, group.returns.length - VISIBLE_RETURNS);
    const expandBtn   = hiddenCount > 0
      ? `<button class="rt-expand-btn" type="button">${t('rt_show_more', hiddenCount)}</button>`
      : '';

    const bestTotalStr = group.bestTotal > 0
      ? group.bestTotal.toFixed(2).replace('.', ',') + ' €' : '?';

    return `
      <div class="rt-trip-group${isFirst ? ' rt-trip-first' : ''}">
        <div class="rt-outbound">
          <div class="rt-out-top">
            <span class="rt-out-label">✈ ${t('rt_card_outbound_label')}</span>
            <span class="rt-out-route">
              <strong>${escapeHtml(out.origen)}</strong>
              <span class="rt-out-arrow">→</span>
              <strong>${escapeHtml(out.destino)}</strong>
              <span class="rt-out-cities">${escapeHtml(oriInfo.city)} · ${escapeHtml(dstInfo.city)}</span>
            </span>
            <span class="rt-out-price">${escapeHtml(out.precio)}</span>
            <button class="rt-save-btn${outSaved ? ' save-btn-active' : ''}"
                    data-id="${escapeHtml(outId)}"
                    title="${t(outSaved ? 'save_title_saved' : 'save_title_save')}">${outSaved ? '♥' : '♡'}</button>
          </div>
          <div class="rt-out-bottom">
            <span class="rt-out-chip rt-out-date">${flightDateLabel(out.fecha)}</span>
            <span class="rt-out-chip rt-out-times">${timeOnly(out.salida)} → ${timeOnly(out.llegada)}${arrival}</span>
            <span class="rt-out-chip rt-out-duration">${escapeHtml(out.duracion)}</span>
            <span class="rt-out-chip rt-out-airline">${escapeHtml(out.aerolinea)}</span>
            ${stopsLabel(out.escalas)}
          </div>
        </div>
        <div class="rt-returns-header">
          <span class="rt-returns-label">↩ ${t('rt_returns_label', group.returns.length)}</span>
          <span class="rt-best-total">${t('rt_best_from', bestTotalStr)}</span>
        </div>
        <div class="rt-returns-list">
          ${returnsHtml}
          ${expandBtn}
        </div>
      </div>`;
  }

  /* ═══════════════════════════════════════════
     RESULTS HEADER — Save / Download
  ═══════════════════════════════════════════ */
  function _buildRtResultsHeader() {
    return `
      <div class="rt-results-header">
        <span id="rtFoundLabel"></span>
        <div class="results-header-actions">
          <button type="button" class="results-action-btn" id="rtBtnSave">${t('btn_save_search')}</button>
          <button type="button" class="results-action-btn" id="rtBtnDownload">${t('btn_download_json')}</button>
        </div>
      </div>`;
  }

  function _bindRtResultsHeaderBtns(outFrom, outTo, retFrom, retTo) {
    const name =
      `${outFrom.join(', ')} → ${outTo.join(', ')}  /  ` +
      `${retFrom.join(', ')} → ${retTo.join(', ')}`;
    const totalTrips = rtRawGroups.reduce((s, g) => s + g.returns.length, 0);
    const snapshot = {
      kind:      'round-trip',
      id:        Date.now().toString(36),
      name,
      savedAt:   new Date().toLocaleString(t('locale_tag'), { dateStyle: 'short', timeStyle: 'short' }),
      vuelosOut: rtRawOut,
      vuelosRet: rtRawRet,
      minStay:   rtMinStayCur,
      maxStay:   rtMaxStayCur,
      elapsedS:  rtElapsedS,
      groups:    rtRawGroups.length,
      total:     totalTrips,
    };

    document.getElementById('rtBtnSave')?.addEventListener('click', () => {
      saveRtSnapshot(snapshot);
      const btn = document.getElementById('rtBtnSave');
      if (btn) { btn.textContent = t('btn_save_done'); btn.disabled = true; }
      if (!document.getElementById('tab-saved').classList.contains('hidden')) renderSavedTab();
    });
    document.getElementById('rtBtnDownload')?.addEventListener('click', () => {
      downloadRtJSON(snapshot);
    });
  }

  /* ═══════════════════════════════════════════
     PERSISTENCE — localStorage
  ═══════════════════════════════════════════ */
  const RT_SAVED_KEY = 'savedRoundTrips';

  function loadSavedRoundTripsList() {
    try { return JSON.parse(localStorage.getItem(RT_SAVED_KEY) || '[]'); }
    catch { return []; }
  }
  function storeSavedRoundTripsList(list) {
    try { localStorage.setItem(RT_SAVED_KEY, JSON.stringify(list)); }
    catch { alert(t('storage_full')); }
  }
  function saveRtSnapshot(snapshot) {
    const list = loadSavedRoundTripsList();
    list.unshift(snapshot);
    storeSavedRoundTripsList(list);
  }
  function deleteRtSnapshot(id) {
    storeSavedRoundTripsList(loadSavedRoundTripsList().filter(s => s.id !== id));
  }
  function renameRtSnapshot(id, newName) {
    const list = loadSavedRoundTripsList();
    const entry = list.find(s => s.id === id);
    if (entry) { entry.name = newName; storeSavedRoundTripsList(list); }
  }
  function downloadRtJSON(snapshot) {
    const safeName = snapshot.name.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'viaje';
    const date     = new Date().toISOString().slice(0, 10);
    const filename = `roundtrip_${safeName}_${date}.json`;
    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  /* ═══════════════════════════════════════════
     LOAD SNAPSHOT — restore results from saved/imported data
  ═══════════════════════════════════════════ */
  function loadRtSnapshot(snapshot) {
    rtRawOut     = snapshot.vuelosOut || [];
    rtRawRet     = snapshot.vuelosRet || [];
    rtElapsedS   = snapshot.elapsedS  || '?';
    rtMinStayCur = snapshot.minStay   || 1;
    rtMaxStayCur = snapshot.maxStay   || 30;

    const groups = _pairTrips(rtRawOut, rtRawRet, rtMinStayCur, rtMaxStayCur);
    const resultsEl = document.getElementById('rtResults');
    if (!resultsEl) return;

    if (!groups.length) {
      resultsEl.innerHTML =
        `<div class="results-placeholder"><span class="placeholder-icon">🌍</span>` +
        `${t('rt_no_trips')}</div>`;
      document.querySelector('[data-tab="roundtrip"]')?.click();
      return;
    }

    rtRawGroups   = groups;
    rtFilterState = _buildInitialFilterState(groups);

    resultsEl.innerHTML =
      _buildFilterBarHtml(groups) +
      _buildRtResultsHeader() +
      `<div id="rtGrid"></div>`;

    _renderGrid();
    _bindFilterEvents();

    /* Re-snapshot wrapping so a re-save uses the loaded data */
    const origin = (rtRawOut[0] || {}).origen ? [rtRawOut[0].origen] : [];
    const dest   = (rtRawOut[0] || {}).destino ? [rtRawOut[0].destino] : [];
    const retOri = (rtRawRet[0] || {}).origen ? [rtRawRet[0].origen] : [];
    const retDst = (rtRawRet[0] || {}).destino ? [rtRawRet[0].destino] : [];
    _bindRtResultsHeaderBtns(origin, dest, retOri, retDst);

    const grid = document.getElementById('rtGrid');
    if (grid) startPriceResolution(grid);

    document.querySelector('[data-tab="roundtrip"]')?.click();
    resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ═══════════════════════════════════════════
     SAVED-TAB SECTION — exposed as window.renderSavedRoundTrips
  ═══════════════════════════════════════════ */
  window.renderSavedRoundTrips = function renderSavedRoundTrips() {
    const container = document.getElementById('savedRoundTrips');
    if (!container) return;
    const list = loadSavedRoundTripsList();
    if (!list.length) { container.innerHTML = ''; return; }

    let html = `<div class="saved-searches-section">
      <div class="saved-searches-header">
        <span class="saved-searches-title">${t('saved_rt_title')}</span>
      </div>
      <div class="saved-searches-list">`;
    for (const s of list) {
      html += `
        <div class="saved-search-card" data-id="${escapeHtml(s.id)}">
          <div class="ss-info">
            <span class="ss-name" data-id="${escapeHtml(s.id)}" title="${t('ss_load_title')}">${escapeHtml(s.name)}</span>
            <span class="ss-meta">${t('rt_ss_trips_count', s.groups || 0, s.total || 0, s.savedAt)}</span>
          </div>
          <div class="ss-actions">
            <button class="ss-btn ss-restore" data-id="${escapeHtml(s.id)}">${t('ss_load')}</button>
            <button class="ss-btn ss-rename" data-id="${escapeHtml(s.id)}">${t('ss_rename')}</button>
            <button class="ss-btn ss-dl" data-id="${escapeHtml(s.id)}">${t('btn_download_json')}</button>
            <button class="ss-btn ss-del" data-id="${escapeHtml(s.id)}">${t('ss_del')}</button>
          </div>
        </div>`;
    }
    html += `</div></div>`;
    container.innerHTML = html;

    container.querySelectorAll('.ss-restore').forEach(btn => {
      btn.addEventListener('click', () => {
        const entry = loadSavedRoundTripsList().find(s => s.id === btn.dataset.id);
        if (entry) loadRtSnapshot(entry);
      });
    });
    container.querySelectorAll('.ss-name').forEach(nameEl => {
      nameEl.style.cursor = 'pointer';
      nameEl.addEventListener('click', () => {
        const entry = loadSavedRoundTripsList().find(s => s.id === nameEl.dataset.id);
        if (entry) loadRtSnapshot(entry);
      });
    });
    container.querySelectorAll('.ss-rename').forEach(btn => {
      btn.addEventListener('click', () => {
        const id     = btn.dataset.id;
        const card   = container.querySelector(`.saved-search-card[data-id="${id}"]`);
        const nameEl = card?.querySelector('.ss-name');
        if (!nameEl) return;
        const current = nameEl.textContent;
        const input   = document.createElement('input');
        input.type = 'text'; input.value = current; input.className = 'ss-rename-input';
        nameEl.replaceWith(input);
        btn.disabled = true;
        input.focus(); input.select();
        let committed = false;
        const commit = () => {
          if (committed) return;
          committed = true;
          const newName = input.value.trim() || current;
          renameRtSnapshot(id, newName);
          window.renderSavedRoundTrips();
        };
        input.addEventListener('blur', commit);
        input.addEventListener('keydown', ev => {
          if (ev.key === 'Enter')  { ev.preventDefault(); input.blur(); }
          if (ev.key === 'Escape') { input.value = current; input.blur(); }
        });
      });
    });
    container.querySelectorAll('.ss-dl').forEach(btn => {
      btn.addEventListener('click', () => {
        const entry = loadSavedRoundTripsList().find(s => s.id === btn.dataset.id);
        if (entry) downloadRtJSON(entry);
      });
    });
    container.querySelectorAll('.ss-del').forEach(btn => {
      btn.addEventListener('click', () => {
        deleteRtSnapshot(btn.dataset.id);
        window.renderSavedRoundTrips();
      });
    });
  };

  /* ═══════════════════════════════════════════
     IMPORT JSON
  ═══════════════════════════════════════════ */
  document.getElementById('rtBtnImport')?.addEventListener('click', () => {
    document.getElementById('rtImportFileInput')?.click();
  });
  document.getElementById('rtImportFileInput')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data.vuelosOut) || !Array.isArray(data.vuelosRet)) {
          alert(t('import_invalid'));
          return;
        }
        loadRtSnapshot(data);
      } catch {
        alert(t('import_invalid'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  /* ═══════════════════════════════════════════
     LANGUAGE CHANGE — refresh translated labels in
     long-lived UI (filter bar, results) without touching
     user state (slider values, checked checkboxes, page).
  ═══════════════════════════════════════════ */
  function _refreshFilterBarLabels() {
    const bar = document.getElementById('rtFilterBar');
    if (!bar) return;

    /* Price label (keeps current strong value) */
    const priceLabel = bar.querySelector('label[for="rtFbPrice"]');
    if (priceLabel) {
      const priceVal = document.getElementById('rtFbPriceVal')?.innerHTML || '';
      priceLabel.innerHTML = `${t('rt_filter_total_price')}: <strong id="rtFbPriceVal">${priceVal}</strong>`;
    }

    /* Stay label (keeps current strong value with translated unit) */
    const minNEl = document.getElementById('rtFbNightsMin');
    const maxNEl = document.getElementById('rtFbNightsMax');
    const stayLabel = minNEl?.closest('.rt-fb-group')?.querySelector('.rt-fb-label');
    if (stayLabel && minNEl && maxNEl) {
      const maxN = parseInt(maxNEl.value) || 0;
      const word = maxN === 1 ? t('rt_night') : t('rt_nights');
      stayLabel.innerHTML =
        `${t('rt_filter_stay')}: <strong id="rtFbNightsVal">${minNEl.value}–${maxNEl.value} ${word}</strong>`;
    }

    /* Sort label + dropdown option text (keeps selected value) */
    const sortSel = document.getElementById('rtFbSort');
    const sortLabel = sortSel?.closest('.rt-fb-group')?.querySelector('.rt-fb-label');
    if (sortLabel) sortLabel.textContent = t('filter_sort');
    if (sortSel) {
      const cur = sortSel.value;
      const optMap = {
        'total-asc':  t('rt_sort_total_asc'),
        'total-desc': t('rt_sort_total_desc'),
        'date-asc':   t('sort_date_asc'),
        'date-desc':  t('sort_date_desc'),
      };
      [...sortSel.options].forEach(o => { if (optMap[o.value]) o.textContent = optMap[o.value]; });
      sortSel.value = cur;
    }

    /* Reset button */
    const resetBtn = document.getElementById('rtFbReset');
    if (resetBtn) resetBtn.textContent = t('filter_reset');

    /* Airport-filter labels (preserves all checkbox states) */
    const labelByClass = {
      'rt-out-ori-chk': 'rt_filter_out_origin',
      'rt-out-air-chk': 'rt_filter_out_airport',
      'rt-ret-air-chk': 'rt_filter_ret_airport',
      'rt-ret-dst-chk': 'rt_filter_ret_dest',
    };
    Object.entries(labelByClass).forEach(([cls, key]) => {
      const firstChk = bar.querySelector(`.${cls}`);
      const group    = firstChk?.closest('.rt-fb-group');
      const lbl      = group?.querySelector('.rt-fb-label');
      if (lbl) lbl.textContent = t(key);
    });

    /* Airports collapsible summary */
    const summarySpan = bar.querySelector('.rt-fb-airports-summary span:first-child');
    if (summarySpan) {
      const visible = ['rt-out-ori-chk','rt-out-air-chk','rt-ret-air-chk','rt-ret-dst-chk']
        .filter(c => bar.querySelector(`.${c}`)).length;
      summarySpan.textContent = t('rt_filter_airports_toggle', visible);
    }
  }

  function _refreshResultsHeaderLabels() {
    const saveBtn = document.getElementById('rtBtnSave');
    if (saveBtn && !saveBtn.disabled) saveBtn.textContent = t('btn_save_search');
    const dlBtn = document.getElementById('rtBtnDownload');
    if (dlBtn) dlBtn.textContent = t('btn_download_json');
  }

  onLangChange(() => {
    /* Re-render results grid (trip cards + pagination — all translated text) */
    if (rtRawGroups.length && document.getElementById('rtGrid')) {
      _renderGrid();
    }
    /* Refresh sticky filter bar labels (preserves user state) */
    _refreshFilterBarLabels();
    /* Refresh save / download button labels */
    _refreshResultsHeaderLabels();
    /* Re-render saved section if visible */
    if (typeof window.renderSavedRoundTrips === 'function' &&
        document.getElementById('savedRoundTrips')?.children.length) {
      window.renderSavedRoundTrips();
    }
  });

})();
