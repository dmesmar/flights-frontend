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
      ['showAllAirportsCheck', 'exShowAllAirportsCheck', 'chShowAllAirportsCheck', 'dirShowAllAirportsCheck', 'hmShowAllAirportsCheck', 'mcShowAllAirportsCheck', 'surShowAllAirportsCheck'].forEach(id => {
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
      /* Expose min-price-per-route so route-map.js can paint price chips on arcs */
      window.rtRouteMinPrices = function rtRouteMinPrices() {
        const map = new Map();
        function consider(routeKey, price) {
          if (!Number.isFinite(price) || price <= 0) return;
          const prev = map.get(routeKey);
          if (prev == null || price < prev) map.set(routeKey, price);
        }
        for (const g of rtRawGroups) {
          const out = g.outbound;
          consider(`${out.origen}→${out.destino}`, parsePrice(out.precio));
          for (const r of g.returns) {
            const f = r.flight;
            consider(`${f.origen}→${f.destino}`, parsePrice(f.precio));
          }
        }
        return map;
      };
      rtElapsedS    = ((Date.now() - searchStart) / 1000).toFixed(1);
      rtMinStayCur  = minStay;
      rtMaxStayCur  = maxStay;
      rtFilterState = _buildInitialFilterState(groups);

      resultsEl.innerHTML =
        _buildFilterBarHtml(groups) +
        _buildRtResultsHeader() +
        _buildRtMatrixHtml(groups) +
        `<div id="rtGrid"></div>`;

      _renderGrid();
      _bindFilterEvents();
      _bindMatrixEvents(resultsEl);
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
      outboundDow:    null,   // null = all (filter by day-of-week of outbound)
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

      /* Filter changes reset to page 1, keep pageSize and DoW filter */
      const pageSize    = rtFilterState.pageSize    || 10;
      const outboundDow = rtFilterState.outboundDow ?? null;
      rtFilterState = {
        maxTotalVal, outOriAirports, outAirports, retAirports, retDstAirports,
        outboundDow,
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

      /* Clear day-of-week filter (set via #24 insight) */
      rtFilterState.outboundDow = null;

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
            outboundDow, minNights, maxNights, sort } = rtFilterState;

    /* Apply filters */
    const filtered = rtRawGroups.map(group => {
      /* Filter by outbound origin / arrival airport */
      if (outOriAirports && !outOriAirports.has(group.outbound.origen))  return null;
      if (outAirports    && !outAirports.has(group.outbound.destino))    return null;

      /* Filter by outbound day-of-week (set via #24 insight) */
      if (outboundDow != null &&
          parseDateYMD(group.outbound.fecha).getDay() !== outboundDow) return null;

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

    /* Insight panel: analyses *filtered* (so it adapts to the active filters)
       but ignores the night-range filter when computing the recommendation
       to surface a genuinely useful suggestion. */
    const insightHtml = _buildInsightsHtml(rtRawGroups, rtFilterState);

    grid.innerHTML = insightHtml + topPag + groupsHtml + bottomPag;

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

    /* Insight action buttons */
    _bindInsightEvents(grid);

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
     INSIGHTS — small analytical panel(s) above the
     trip list. Each insight is a self-contained block.
  ═══════════════════════════════════════════ */

  /**
   * Returns HTML for all insights that apply to the current dataset.
   * `groups` is the unfiltered raw pairings; `state` is the current
   * filter state — used so we don't recommend the user something they
   * already explicitly opted out of (e.g. via airport filters).
   */
  function _buildInsightsHtml(groups, state) {
    if (!groups.length) return '';

    const blocks = [];
    const cholloBlock = _insightChollos(groups, state);
    if (cholloBlock) blocks.push(cholloBlock);

    /* Cross-insight first — when both optimal-nights and cheapest-weekday
       point to the same (dow, stay) combination, surface it as a single
       richer recommendation and suppress the individual variants. */
    const combinedBlock = _insightCombined(groups, state);
    if (combinedBlock) {
      blocks.push(combinedBlock);
    } else {
      const nightsBlock = _insightOptimalNights(groups, state);
      if (nightsBlock) blocks.push(nightsBlock);
      const dowBlock = _insightCheapestWeekday(groups, state);
      if (dowBlock) blocks.push(dowBlock);
    }

    /* "Extend trip" insight is independent — it surfaces a longer stay
       option when the per-extra-night cost is low or zero */
    const extendBlock = _insightExtendTrip(groups, state);
    if (extendBlock) blocks.push(extendBlock);

    if (!blocks.length) return '';
    return `<div class="rt-insights">${blocks.join('')}</div>`;
  }

  /**
   * "Staying X more nights only costs +Y€" insight.
   * Identifies the cheapest stay-length, then finds the LONGEST stay
   * whose per-extra-night cost stays under a small threshold (15€/night
   * by default). Surfaces this so the user can extend their trip with
   * minimal price impact.
   */
  function _insightExtendTrip(groups, state) {
    const candidates = [];
    for (const g of groups) {
      if (state.outOriAirports && !state.outOriAirports.has(g.outbound.origen))  continue;
      if (state.outAirports    && !state.outAirports.has(g.outbound.destino))    continue;
      for (const r of g.returns) {
        if (state.retAirports    && !state.retAirports.has(r.flight.origen))   continue;
        if (state.retDstAirports && !state.retDstAirports.has(r.flight.destino)) continue;
        if (state.maxTotalVal < Infinity && r.total > state.maxTotalVal) continue;
        candidates.push(r);
      }
    }
    if (candidates.length < 6) return '';

    const byStay = new Map();
    for (const r of candidates) {
      const prev = byStay.get(r.stay);
      if (prev == null || r.total < prev) byStay.set(r.stay, r.total);
    }
    if (byStay.size < 2) return '';

    /* Anchor on the cheapest stay-length overall */
    const entries = [...byStay.entries()].sort((a, b) => a[1] - b[1]);
    const [shortStay, shortTotal] = entries[0];

    /* Find the longest stay whose extra cost stays under 15€/night */
    const PER_NIGHT_THRESHOLD = 15;
    let bestLong = null;
    for (const [stay, total] of byStay) {
      if (stay <= shortStay) continue;
      const extraDays = stay - shortStay;
      const extraCost = total - shortTotal;
      if (extraCost > extraDays * PER_NIGHT_THRESHOLD) continue;
      if (!bestLong || stay > bestLong.stay) {
        bestLong = { stay, total, extraDays, extraCost };
      }
    }
    if (!bestLong) return '';

    /* Skip if the user has already filtered to a single specific stay */
    if (state.minNights === state.maxNights) return '';

    const isFree = bestLong.extraCost <= 1;
    const headline = isFree
      ? t('rt_insight_extend_free', bestLong.extraDays)
      : t('rt_insight_extend', bestLong.extraDays, Math.round(bestLong.extraCost));

    return `
      <div class="rt-insight rt-insight-extend" data-stay="${bestLong.stay}">
        <div class="rt-insight-icon">🌴</div>
        <div class="rt-insight-body">
          <div class="rt-insight-head">
            <span class="rt-insight-tag rt-insight-tag-extend">${t('rt_insight_extend_title')}</span>
            <span class="rt-insight-headline">${headline}</span>
          </div>
          <div class="rt-insight-detail">
            ${t('rt_insight_based_on', candidates.length)}
          </div>
        </div>
        <div class="rt-insight-actions">
          <button type="button" class="rt-insight-apply-extend-btn" data-stay="${bestLong.stay}">
            ${t('rt_insight_extend_apply', bestLong.stay)}
          </button>
        </div>
      </div>`;
  }

  /**
   * Cross-insight: looks at the min total per (outbound DoW, stay-nights)
   * pair. If the cheapest pair beats the average of the others by a
   * meaningful margin, surfaces a single richer recommendation. Returns
   * null when there isn't enough signal — the caller falls back to the
   * separate nights/weekday insights.
   */
  function _insightCombined(groups, state) {
    /* Candidate set respects all current filters except minNights/maxNights
       and outboundDow (we're trying to *recommend* a value for those) */
    const candidates = [];
    for (const g of groups) {
      if (state.outOriAirports && !state.outOriAirports.has(g.outbound.origen))  continue;
      if (state.outAirports    && !state.outAirports.has(g.outbound.destino))    continue;
      const dow = parseDateYMD(g.outbound.fecha).getDay();
      for (const r of g.returns) {
        if (state.retAirports    && !state.retAirports.has(r.flight.origen))   continue;
        if (state.retDstAirports && !state.retDstAirports.has(r.flight.destino)) continue;
        if (state.maxTotalVal < Infinity && r.total > state.maxTotalVal) continue;
        candidates.push({ dow, stay: r.stay, total: r.total });
      }
    }
    if (candidates.length < 12) return null;

    /* Min total per (dow, stay) pair + sample size */
    const byPair = new Map();   // "dow|stay" → { dow, stay, min, count }
    for (const c of candidates) {
      const key = `${c.dow}|${c.stay}`;
      const prev = byPair.get(key);
      if (!prev) byPair.set(key, { dow: c.dow, stay: c.stay, min: c.total, count: 1 });
      else { prev.count++; if (c.total < prev.min) prev.min = c.total; }
    }
    if (byPair.size < 6) return null;

    const entries = [...byPair.values()].sort((a, b) => a.min - b.min);
    const best = entries[0];
    if (best.count < 2) return null;   /* require ≥2 samples for the winner */
    const others = entries.slice(1);
    const avgOther = others.reduce((s, e) => s + e.min, 0) / others.length;
    const savings = avgOther - best.min;

    /* Need a meaningful margin AND it must be at least 8% — higher bar
       than the single-axis insights because we're claiming a stronger
       pattern (the combined effect). */
    if (savings < 25 || savings / avgOther < 0.08) return null;

    /* Don't recommend something the user already applied */
    if (state.outboundDow === best.dow &&
        state.minNights === best.stay && state.maxNights === best.stay) return null;

    const dayPlural   = (t('weekdays_plural') || t('weekdays'))[best.dow] || '?';
    /* The return DoW is just (best.dow + best.stay) mod 7 */
    const retDay      = (t('weekdays') || [])[(best.dow + best.stay) % 7] || '?';
    const nightWord   = best.stay === 1 ? t('rt_night') : t('rt_nights');
    const fmt         = n => Math.round(n) + ' €';

    return `
      <div class="rt-insight rt-insight-combo" data-dow="${best.dow}" data-stay="${best.stay}">
        <div class="rt-insight-icon">✨</div>
        <div class="rt-insight-body">
          <div class="rt-insight-head">
            <span class="rt-insight-tag rt-insight-tag-combo">${t('rt_insight_title')}</span>
            <span class="rt-insight-headline">${t('rt_insight_combo', dayPlural, retDay, best.stay, nightWord)}</span>
          </div>
          <div class="rt-insight-detail">
            ${t('rt_insight_savings', Math.round(savings), Math.round(avgOther))}
            · ${t('rt_insight_min', fmt(best.min))}
            · ${t('rt_insight_based_on', candidates.length)}
          </div>
        </div>
        <div class="rt-insight-actions">
          <button type="button" class="rt-insight-apply-combo-btn"
                  data-dow="${best.dow}" data-stay="${best.stay}">
            ${t('rt_insight_apply_combo')}
          </button>
        </div>
      </div>`;
  }

  /**
   * #23 — Surfaces how many displayed trips are below the historical
   * average for their outbound route. Uses chollo.js globals.
   */
  function _insightChollos(groups, state) {
    if (typeof window.buildPriceHistory !== 'function') return '';
    const history = window.buildPriceHistory();
    if (!history.size) return '';

    let cholloCount = 0;
    let maxSavings  = 0;
    for (const g of groups) {
      const out = g.outbound;
      if (state.outOriAirports && !state.outOriAirports.has(out.origen))  continue;
      if (state.outAirports    && !state.outAirports.has(out.destino))    continue;
      const c = window.checkChollo(out, history);
      if (c) {
        cholloCount++;
        if (c.savings > maxSavings) maxSavings = c.savings;
      }
    }
    if (cholloCount < 1) return '';

    return `
      <div class="rt-insight rt-insight-chollo">
        <div class="rt-insight-icon">⭐</div>
        <div class="rt-insight-body">
          <div class="rt-insight-head">
            <span class="rt-insight-tag rt-insight-tag-chollo">${t('chollo_title')}</span>
            <span class="rt-insight-headline">${t('chollo_insight', cholloCount, maxSavings)}</span>
          </div>
        </div>
        <div class="rt-insight-actions">
          <button type="button" class="rt-chollo-thresholds-btn">
            ${t('chollo_threshold_btn')}
          </button>
        </div>
      </div>`;
  }

  /**
   * "Stays of N nights are the cheapest" insight.
   * Compares the minimum total per stay-length and highlights the winner
   * when the savings vs. average of other stay-lengths is meaningful (>5%
   * AND ≥ 20€). Respects airport filters (so the insight is consistent
   * with what's on screen) but ignores the night-range filter so the
   * suggestion is actionable even when the user has restricted nights.
   */
  function _insightOptimalNights(groups, state) {
    /* Build a candidate-eligible filter that mirrors current filters
       except for the nights range. */
    const candidates = [];
    for (const g of groups) {
      if (state.outOriAirports && !state.outOriAirports.has(g.outbound.origen))  continue;
      if (state.outAirports    && !state.outAirports.has(g.outbound.destino))    continue;
      for (const r of g.returns) {
        if (state.retAirports    && !state.retAirports.has(r.flight.origen))   continue;
        if (state.retDstAirports && !state.retDstAirports.has(r.flight.destino)) continue;
        if (state.maxTotalVal < Infinity && r.total > state.maxTotalVal) continue;
        candidates.push(r);
      }
    }
    if (candidates.length < 4) return '';

    /* Min total per stay length */
    const byStay = new Map();
    for (const r of candidates) {
      const prev = byStay.get(r.stay);
      if (prev == null || r.total < prev) byStay.set(r.stay, r.total);
    }
    if (byStay.size < 2) return '';

    const entries = [...byStay.entries()].sort((a, b) => a[1] - b[1]);
    const [bestStay, bestPrice] = entries[0];
    const others = entries.slice(1);
    const avgOther = others.reduce((s, [, p]) => s + p, 0) / others.length;
    const savings = avgOther - bestPrice;

    /* Skip if savings aren't meaningful — avoids noisy "save 3€" tips */
    if (savings < 20 || savings / avgOther < 0.05) return '';

    /* Skip if the user already filtered to that stay-length exclusively */
    if (state.minNights === bestStay && state.maxNights === bestStay) return '';

    const nightWord = bestStay === 1 ? t('rt_night') : t('rt_nights');
    const fmt = n => n.toFixed(2).replace('.', ',') + ' €';

    return `
      <div class="rt-insight rt-insight-nights" data-stay="${bestStay}">
        <div class="rt-insight-icon">💡</div>
        <div class="rt-insight-body">
          <div class="rt-insight-head">
            <span class="rt-insight-tag">${t('rt_insight_title')}</span>
            <span class="rt-insight-headline">${t('rt_insight_best_nights', bestStay, nightWord)}</span>
          </div>
          <div class="rt-insight-detail">
            ${t('rt_insight_savings', Math.round(savings), Math.round(avgOther))}
            · ${t('rt_insight_min', fmt(bestPrice))}
            · ${t('rt_insight_based_on', candidates.length)}
          </div>
        </div>
        <div class="rt-insight-actions">
          <button type="button" class="rt-insight-apply-btn" data-stay="${bestStay}">
            ${t('rt_insight_apply')}
          </button>
        </div>
      </div>`;
  }

  /**
   * "Departing on <day> is cheaper" insight.
   * For each outbound day-of-week, finds the minimum total. If the
   * cheapest DoW beats the average of the others by a meaningful margin,
   * surface it with a one-click filter. When the user already filtered to
   * that DoW, the panel switches to a "✓ active" mode with a clear button.
   */
  function _insightCheapestWeekday(groups, state) {
    /* Mirror current filters except outboundDow (so the insight always
       analyses the broadest applicable dataset) */
    const byDow = new Map();   // dow → min total
    let totalCandidates = 0;
    for (const g of groups) {
      if (state.outOriAirports && !state.outOriAirports.has(g.outbound.origen))  continue;
      if (state.outAirports    && !state.outAirports.has(g.outbound.destino))    continue;
      const dow = parseDateYMD(g.outbound.fecha).getDay();
      for (const r of g.returns) {
        if (state.retAirports    && !state.retAirports.has(r.flight.origen))   continue;
        if (state.retDstAirports && !state.retDstAirports.has(r.flight.destino)) continue;
        if (state.maxTotalVal < Infinity && r.total > state.maxTotalVal) continue;
        if (r.stay < state.minNights || r.stay > state.maxNights) continue;
        totalCandidates++;
        const prev = byDow.get(dow);
        if (prev == null || r.total < prev) byDow.set(dow, r.total);
      }
    }
    if (totalCandidates < 6) return '';
    if (byDow.size < 3) return '';   /* need ≥3 different DoWs for a meaningful pattern */

    const entries = [...byDow.entries()].sort((a, b) => a[1] - b[1]);
    const [bestDow, bestPrice] = entries[0];
    const others = entries.slice(1);
    const avgOther = others.reduce((s, [, p]) => s + p, 0) / others.length;
    const savings = avgOther - bestPrice;
    if (savings < 20 || savings / avgOther < 0.05) return '';

    const dayPlural = (t('weekdays_plural') || t('weekdays'))[bestDow] || '?';
    const isActive  = state.outboundDow === bestDow;
    const fmt = n => Math.round(n) + ' €';

    if (isActive) {
      /* User is already filtered to the recommended day */
      return `
        <div class="rt-insight rt-insight-dow rt-insight-active" data-dow="${bestDow}">
          <div class="rt-insight-icon">✓</div>
          <div class="rt-insight-body">
            <div class="rt-insight-head">
              <span class="rt-insight-tag rt-insight-tag-active">${t('rt_insight_title')}</span>
              <span class="rt-insight-headline">${t('rt_insight_active_dow', dayPlural)}</span>
            </div>
            <div class="rt-insight-detail">
              ${t('rt_insight_savings', Math.round(savings), Math.round(avgOther))}
              · ${t('rt_insight_based_on', totalCandidates)}
            </div>
          </div>
          <div class="rt-insight-actions">
            <button type="button" class="rt-insight-clear-dow-btn">
              ${t('rt_insight_clear')}
            </button>
          </div>
        </div>`;
    }

    return `
      <div class="rt-insight rt-insight-dow" data-dow="${bestDow}">
        <div class="rt-insight-icon">📅</div>
        <div class="rt-insight-body">
          <div class="rt-insight-head">
            <span class="rt-insight-tag">${t('rt_insight_title')}</span>
            <span class="rt-insight-headline">${t('rt_insight_cheapest_dow', dayPlural)}</span>
          </div>
          <div class="rt-insight-detail">
            ${t('rt_insight_savings', Math.round(savings), Math.round(avgOther))}
            · ${t('rt_insight_min', fmt(bestPrice))}
            · ${t('rt_insight_based_on', totalCandidates)}
          </div>
        </div>
        <div class="rt-insight-actions">
          <button type="button" class="rt-insight-apply-dow-btn" data-dow="${bestDow}">
            ${t('rt_insight_apply_dow')}
          </button>
        </div>
      </div>`;
  }

  /**
   * Bound after grid render. Wires the "Filter by this duration" button.
   * Sets min/max nights to the recommended stay and re-renders.
   */
  function _bindInsightEvents(grid) {
    grid.querySelectorAll('.rt-insight-apply-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const stay = parseInt(btn.dataset.stay);
        if (!Number.isInteger(stay)) return;
        const minNEl = document.getElementById('rtFbNightsMin');
        const maxNEl = document.getElementById('rtFbNightsMax');
        if (minNEl) minNEl.value = stay;
        if (maxNEl) maxNEl.value = stay;
        rtFilterState.minNights = stay;
        rtFilterState.maxNights = stay;
        rtFilterState.page = 1;
        /* Also update the strong label in the filter bar */
        const nightWord = stay === 1 ? t('rt_night') : t('rt_nights');
        const nightsValEl = document.getElementById('rtFbNightsVal');
        if (nightsValEl) nightsValEl.textContent = `${stay}–${stay} ${nightWord}`;
        _renderGrid();
      });
    });

    /* #24 — apply / clear the outbound day-of-week filter */
    grid.querySelectorAll('.rt-insight-apply-dow-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dow = parseInt(btn.dataset.dow);
        if (!Number.isInteger(dow)) return;
        rtFilterState.outboundDow = dow;
        rtFilterState.page = 1;
        _renderGrid();
      });
    });
    grid.querySelectorAll('.rt-insight-clear-dow-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        rtFilterState.outboundDow = null;
        rtFilterState.page = 1;
        _renderGrid();
      });
    });

    /* Chollo thresholds — open the management modal */
    grid.querySelectorAll('.rt-chollo-thresholds-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (typeof window.openCholloThresholdsModal === 'function') {
          window.openCholloThresholdsModal();
        }
      });
    });

    /* "Extend the trip" — apply the recommended longer stay */
    grid.querySelectorAll('.rt-insight-apply-extend-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const stay = parseInt(btn.dataset.stay);
        if (!Number.isInteger(stay)) return;
        rtFilterState.minNights = stay;
        rtFilterState.maxNights = stay;
        rtFilterState.page = 1;
        const minNEl = document.getElementById('rtFbNightsMin');
        const maxNEl = document.getElementById('rtFbNightsMax');
        if (minNEl) minNEl.value = stay;
        if (maxNEl) maxNEl.value = stay;
        const nightWord = stay === 1 ? t('rt_night') : t('rt_nights');
        const nightsValEl = document.getElementById('rtFbNightsVal');
        if (nightsValEl) nightsValEl.textContent = `${stay}–${stay} ${nightWord}`;
        _renderGrid();
      });
    });

    /* Cross-insight: apply BOTH the recommended DoW and the stay-length */
    grid.querySelectorAll('.rt-insight-apply-combo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const dow  = parseInt(btn.dataset.dow);
        const stay = parseInt(btn.dataset.stay);
        if (!Number.isInteger(dow) || !Number.isInteger(stay)) return;
        rtFilterState.outboundDow = dow;
        rtFilterState.minNights   = stay;
        rtFilterState.maxNights   = stay;
        rtFilterState.page = 1;
        /* Sync the visible inputs so the user sees what's been applied */
        const minNEl = document.getElementById('rtFbNightsMin');
        const maxNEl = document.getElementById('rtFbNightsMax');
        if (minNEl) minNEl.value = stay;
        if (maxNEl) maxNEl.value = stay;
        const nightWord = stay === 1 ? t('rt_night') : t('rt_nights');
        const nightsValEl = document.getElementById('rtFbNightsVal');
        if (nightsValEl) nightsValEl.textContent = `${stay}–${stay} ${nightWord}`;
        _renderGrid();
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

    /* #23 — chollo badge on outbound leg */
    let cholloBadge = '';
    if (typeof window.checkChollo === 'function') {
      try {
        const c = window.checkChollo(out);
        if (c) cholloBadge = `<span class="rt-chollo-badge" title="${t('chollo_tooltip', c.savings, c.pctOff)}">${t('chollo_badge')} -${c.pctOff}%</span>`;
      } catch {}
    }

    return `
      <div class="rt-trip-group${isFirst ? ' rt-trip-first' : ''}${cholloBadge ? ' rt-trip-chollo' : ''}">
        <div class="rt-outbound">
          <div class="rt-out-top">
            <span class="rt-out-label">✈ ${t('rt_card_outbound_label')}</span>
            <span class="rt-out-route">
              <strong>${escapeHtml(out.origen)}</strong>
              <span class="rt-out-arrow">→</span>
              <strong>${escapeHtml(out.destino)}</strong>
              <span class="rt-out-cities">${escapeHtml(oriInfo.city)} · ${escapeHtml(dstInfo.city)}</span>
            </span>
            ${cholloBadge}
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
     OUTBOUND × RETURN PRICE MATRIX
     For each (outbound date, return date) pair, the cheapest total
     is painted with a colour scale. Clicking a cell filters the
     grid to that specific stay length and outbound day-of-week.
  ═══════════════════════════════════════════ */
  const RT_MX_MAX_AXIS = 16;   // skip the matrix beyond this many dates

  function _shortDate(ymd) {
    /* ymd is DD-MM-YYYY → "DD/MM" */
    if (!ymd) return '';
    const m = ymd.match(/^(\d{2})-(\d{2})/);
    return m ? `${m[1]}/${m[2]}` : ymd;
  }

  function _buildRtMatrixHtml(groups) {
    if (!groups.length) return '';

    /* Build matrix: "outDate|retDate" → minTotal */
    const matrix = new Map();
    const outDateSet = new Set();
    const retDateSet = new Set();
    for (const g of groups) {
      outDateSet.add(g.outbound.fecha);
      for (const r of g.returns) {
        retDateSet.add(r.flight.fecha);
        const k = `${g.outbound.fecha}|${r.flight.fecha}`;
        const prev = matrix.get(k);
        if (prev == null || r.total < prev) matrix.set(k, r.total);
      }
    }
    if (matrix.size < 4) return '';

    const outDates = [...outDateSet].sort((a, b) => parseDateYMD(a) - parseDateYMD(b));
    const retDates = [...retDateSet].sort((a, b) => parseDateYMD(a) - parseDateYMD(b));

    /* If either axis is too large, render is too noisy — skip */
    if (outDates.length > RT_MX_MAX_AXIS || retDates.length > RT_MX_MAX_AXIS) return '';

    const allVals = [...matrix.values()];
    const lo = Math.min(...allVals);
    const hi = Math.max(...allVals);
    function colorFor(v) {
      if (lo === hi) return 'hsl(135 70% 40%)';
      const tx = (v - lo) / (hi - lo);
      const hue = 135 - tx * 127;
      return `hsl(${Math.round(hue)} 65% 42%)`;
    }

    const header = `<th class="rt-mx-corner"></th>` + retDates.map(d =>
      `<th class="rt-mx-col-h" title="${escapeHtml(d)}">${escapeHtml(_shortDate(d))}</th>`
    ).join('');

    const rows = outDates.map(outD => {
      const outDt = parseDateYMD(outD);
      const cells = retDates.map(retD => {
        const v = matrix.get(`${outD}|${retD}`);
        const retDt = parseDateYMD(retD);
        const stay = Math.round((retDt - outDt) / 86400000);
        if (v == null) {
          /* No data — distinguish "invalid pair" (return ≤ outbound) from "no flight" */
          const cls = stay < 1 ? 'rt-mx-invalid' : 'rt-mx-empty';
          return `<td class="rt-mx-cell ${cls}"></td>`;
        }
        const tip = `${_shortDate(outD)} → ${_shortDate(retD)} · ${stay}n · ${Math.round(v)} €`;
        return `<td class="rt-mx-cell" style="background:${colorFor(v)}"
                    data-out="${escapeHtml(outD)}" data-ret="${escapeHtml(retD)}"
                    data-stay="${stay}" title="${escapeHtml(tip)}">
                  <span class="rt-mx-price">${Math.round(v)}€</span>
                </td>`;
      }).join('');
      return `<tr><th class="rt-mx-row-h" title="${escapeHtml(outD)}">${escapeHtml(_shortDate(outD))}</th>${cells}</tr>`;
    }).join('');

    return `
      <details class="rt-mx-details" id="rtMxDetails" open>
        <summary class="rt-mx-summary">
          <span class="rt-mx-title">${t('rt_mx_title')}</span>
          <span class="rt-mx-hint">${t('rt_mx_hint')}</span>
          <span class="rt-fb-chevron">▾</span>
        </summary>
        <div class="rt-mx-body">
          <div class="rt-mx-axis-labels">
            <span class="rt-mx-axis-out">${t('rt_mx_axis_out')}</span>
            <span class="rt-mx-axis-ret">${t('rt_mx_axis_ret')}</span>
          </div>
          <div class="rt-mx-scroll">
            <table class="rt-mx-table">
              <thead><tr>${header}</tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div class="rt-mx-legend">
            <span class="rt-mx-legend-label">${t('rt_mx_legend_cheap')}</span>
            <span class="rt-mx-legend-gradient"></span>
            <span class="rt-mx-legend-label">${t('rt_mx_legend_pricey')}</span>
          </div>
        </div>
      </details>`;
  }

  function _bindMatrixEvents(root) {
    root.querySelectorAll('.rt-mx-cell[data-stay]').forEach(cell => {
      cell.addEventListener('click', () => {
        const stay = parseInt(cell.dataset.stay);
        const outDate = cell.dataset.out;
        if (!Number.isInteger(stay) || !outDate) return;
        /* Apply both the stay-length and outbound day-of-week — gives the
           user a tight view that matches the cell they clicked */
        rtFilterState.minNights = stay;
        rtFilterState.maxNights = stay;
        rtFilterState.outboundDow = parseDateYMD(outDate).getDay();
        rtFilterState.page = 1;
        /* Sync the inputs visually */
        const minNEl = document.getElementById('rtFbNightsMin');
        const maxNEl = document.getElementById('rtFbNightsMax');
        if (minNEl) minNEl.value = stay;
        if (maxNEl) maxNEl.value = stay;
        const nightWord = stay === 1 ? t('rt_night') : t('rt_nights');
        const nightsValEl = document.getElementById('rtFbNightsVal');
        if (nightsValEl) nightsValEl.textContent = `${stay}–${stay} ${nightWord}`;
        _renderGrid();
        _scrollToTopOfGrid();
      });
    });
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
          <button type="button" class="results-action-btn" id="rtBtnShare" title="${t('share_btn_title')}">${t('share_btn')}</button>
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
    document.getElementById('rtBtnShare')?.addEventListener('click', async () => {
      const params = {
        kind:     'roundtrip',
        outFrom,  outTo,  retFrom,  retTo,
        dateIni:  document.getElementById('rtFechaIni')?.value || '',
        dateFin:  document.getElementById('rtFechaFin')?.value || '',
        minStay:  parseInt(document.getElementById('rtMinStay')?.value) || 3,
        maxStay:  parseInt(document.getElementById('rtMaxStay')?.value) || 7,
        maxStops: parseInt(document.getElementById('rtMaxStops')?.value) || 0,
      };
      if (typeof window.copyShareUrl === 'function') {
        const ok = await window.copyShareUrl(params);
        const btn = document.getElementById('rtBtnShare');
        if (ok && btn) {
          const orig = btn.textContent;
          btn.textContent = t('share_copied');
          btn.disabled = true;
          setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2200);
        }
      }
    });
  }

  /* Exposed for share.js to restore a round-trip search from a shared link */
  window.rtApplyShared = function rtApplyShared(p) {
    if (p.dateIni) { const el = document.getElementById('rtFechaIni'); if (el) el.value = p.dateIni; }
    if (p.dateFin) { const el = document.getElementById('rtFechaFin'); if (el) el.value = p.dateFin; }
    if (p.minStay != null) { const el = document.getElementById('rtMinStay'); if (el) el.value = p.minStay; }
    if (p.maxStay != null) { const el = document.getElementById('rtMaxStay'); if (el) el.value = p.maxStay; }
    if (Array.isArray(p.outFrom)) rtSelectorOutFrom.setSelected(p.outFrom);
    if (Array.isArray(p.outTo))   rtSelectorOutTo.setSelected(p.outTo);
    if (Array.isArray(p.retFrom)) rtSelectorRetFrom.setSelected(p.retFrom);
    if (Array.isArray(p.retTo))   rtSelectorRetTo.setSelected(p.retTo);
    if (p.maxStops != null) {
      const row = document.getElementById('rtStopsRow');
      row?.querySelectorAll('.stop-btn').forEach(b => b.classList.toggle('active', b.dataset.value == p.maxStops));
      const hidden = document.getElementById('rtMaxStops');
      if (hidden) hidden.value = p.maxStops;
    }
  };

  /* ═══════════════════════════════════════════
     PERSISTENCE — localStorage
  ═══════════════════════════════════════════ */
  const RT_SAVED_KEY = 'savedRoundTrips';

  function loadSavedRoundTripsList() {
    try { return JSON.parse(localStorage.getItem(RT_SAVED_KEY) || '[]'); }
    catch { return []; }
  }
  /* Expose for chollo.js / stats.js */
  window.loadSavedRoundTripsList = loadSavedRoundTripsList;
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
