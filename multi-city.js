/* -------------------------------------------
   MULTI-CITY PLANNER — Feature #21 (v2)

   User picks: origin + ordered list of destinations + date
   range + min/max nights per destination. The planner searches
   each leg's possible departure-date window and enumerates every
   valid (n1, ..., nN) nights tuple that fits in the range, picking
   the cheapest flight per leg for each tuple.

   New in this iteration:
     • Try-all-orders mode — also explores every permutation of
       destinations, so the planner can recommend the *best order*.
       Requires N×(N+1) searches instead of N+1, so it's opt-in.
     • Combo filters — by airline, by max stops per leg, by
       earliest departure / latest arrival, and an "avoid overnight
       flights" toggle. Filters re-render without re-searching.
     • Pareto chart — scatter plot of (total nights × total price)
       with Pareto-optimal combinations highlighted.
     • Save combination — pin an itinerary to localStorage so it
       persists across sessions (key: 'savedMcCombos').

   Depends on: createAirportSelector, executeSearch,
   isAirportAllowed (app.js); parsePrice, parseDateYMD,
   renderSpinner, renderError, airportInfo, escapeHtml,
   flightDateLabel, timeOnly, stopsLabel (render.js);
   flightId (saved.js); i18n.js;
   initNearbyInlinePanel (nearby-inline.js).
------------------------------------------- */

(function initMultiCity() {

  const MAX_DESTS              = 5;
  const MAX_COMBINATIONS       = 50;   // cap displayed results
  const MAX_TRAVERSE           = 5000; // safety brake on enumeration per permutation
  const SAVED_MC_KEY           = 'savedMcCombos';
  const MAX_DESTS_PERMUTATIONS = 4;    // hard cap for permutation mode (N! grows fast)

  /* ── Origin selector ── */
  const originSel = createAirportSelector(
    document.getElementById('mcSelectorOrigin'),
    document.getElementById('mcTagsOrigin')
  );
  originSel.setGetAllowed(isAirportAllowed);

  const destinationsContainer = document.getElementById('mcDestinationsContainer');
  const destinations = []; /* [{ wrap, selector }, ...] */

  /* ── Module state (results of last search) ── */
  let mcRawCombos     = [];
  let mcOriginSet     = [];
  let mcDestSets      = [];
  let mcReturnToOrig  = false;
  let mcStartDateStr  = '';
  let mcEndDateStr    = '';
  let mcMinNights     = 1;
  let mcMaxNights     = 4;
  let mcFilterState   = _buildInitialFilterState();

  /* ── Sync show-all-airports flag ── */
  document.addEventListener('showAllAirportsChanged', () => {
    originSel.setGetAllowed(isAirportAllowed);
    originSel.clearDisallowed?.();
    originSel.refresh?.();
    destinations.forEach(d => {
      d.selector.setGetAllowed(isAirportAllowed);
      d.selector.clearDisallowed?.();
      d.selector.refresh?.();
    });
  });

  /* ── Add / remove destination rows ── */
  function _addDestination() {
    if (destinations.length >= MAX_DESTS) { alert(t('multicity_max_dests')); return; }
    const idx  = destinations.length + 1;
    const wrap = document.createElement('div');
    wrap.className = 'mc-dest-row';
    wrap.innerHTML = `
      <div class="mc-dest-head">
        <span class="mc-dest-label">${t('multicity_dest_n', idx)}</span>
        <button type="button" class="mc-dest-remove">${t('multicity_dest_remove')}</button>
      </div>
      <div class="form-group">
        <div class="airport-selector mc-dest-selector">
          <div class="airport-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false">
            <div class="airport-trigger-tokens"></div>
            <input type="text" class="dropdown-search-input" placeholder="Seleccionar…" autocomplete="off" spellcheck="false" />
            <span class="airport-trigger-arrow">&#x25BE;</span>
          </div>
          <div class="airport-dropdown" role="listbox"><div class="dropdown-list"></div></div>
        </div>
      </div>`;
    destinationsContainer.appendChild(wrap);

    const selector = createAirportSelector(
      wrap.querySelector('.mc-dest-selector'),
      wrap.querySelector('.airport-trigger-tokens')
    );
    selector.setGetAllowed(isAirportAllowed);

    const dest = { wrap, selector };
    destinations.push(dest);

    wrap.querySelector('.mc-dest-remove').addEventListener('click', () => _removeDestination(dest));

    if (typeof initNearbyInlinePanel === 'function') {
      const fg = wrap.querySelector('.mc-dest-selector')?.closest('.form-group');
      const stamp = Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36);
      if (fg) initNearbyInlinePanel(selector, fg, `ni-mcdest-${stamp}`);
    }

    _renumberDestinations();
  }

  function _removeDestination(dest) {
    if (destinations.length <= 1) { alert(t('multicity_min_dests')); return; }
    const i = destinations.indexOf(dest);
    if (i < 0) return;
    destinations.splice(i, 1);
    dest.wrap.remove();
    _renumberDestinations();
  }

  function _renumberDestinations() {
    destinations.forEach((d, i) => {
      const lbl = d.wrap.querySelector('.mc-dest-label');
      if (lbl) lbl.textContent = t('multicity_dest_n', i + 1);
    });
  }

  if (typeof initNearbyInlinePanel === 'function') {
    const fg = document.getElementById('mcSelectorOrigin')?.closest('.form-group');
    if (fg) initNearbyInlinePanel(originSel, fg, 'ni-mc-origin');
  }

  document.getElementById('mcAddDestBtn').addEventListener('click', _addDestination);

  /* Start with one destination */
  _addDestination();

  /* ─── Saved-combo storage ────────────── */
  function _loadSavedCombos() {
    try {
      const raw = localStorage.getItem(SAVED_MC_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch { return []; }
  }
  function _saveSavedCombos(list) {
    try { localStorage.setItem(SAVED_MC_KEY, JSON.stringify(list)); } catch {}
  }
  function _comboKey(combo) {
    return (combo.flights || []).map(f =>
      `${f.origen}|${f.destino}|${f.fecha}|${f.salida}|${f.aerolinea}|${f.precio}`).join('::');
  }
  function _isSavedCombo(combo) {
    const k = _comboKey(combo);
    return _loadSavedCombos().some(c => _comboKey(c) === k);
  }
  function _toggleSavedCombo(combo) {
    const list = _loadSavedCombos();
    const k = _comboKey(combo);
    const idx = list.findIndex(c => _comboKey(c) === k);
    if (idx >= 0) list.splice(idx, 1);
    else list.push({
      flights:        combo.flights,
      nights:         combo.nights,
      total:          combo.total,
      totalNights:    combo.totalNights,
      savedAt:        Date.now(),
    });
    _saveSavedCombos(list);
    return idx < 0;
  }
  /* Expose for stats / migrations */
  window.loadSavedMcCombos = _loadSavedCombos;

  /* ═══════════════════════════════════════════
     SUBMIT
  ═══════════════════════════════════════════ */
  document.getElementById('multicityForm').addEventListener('submit', async (e) => {
    e.preventDefault();

    const origin = originSel.getSelected();
    if (!origin.length) { alert(t('multicity_alert_origin')); return; }

    const dests = destinations
      .map(d => d.selector.getSelected())
      .filter(arr => arr.length > 0);
    if (!dests.length) { alert(t('multicity_alert_dest')); return; }

    const startStr = document.getElementById('mcStartDate').value;
    const endStr   = document.getElementById('mcEndDate').value;
    if (!startStr || !endStr) { alert(t('multicity_alert_dates')); return; }
    if (startStr >= endStr)   { alert(t('multicity_alert_dates_order')); return; }

    const minNights = Math.max(1, parseInt(document.getElementById('mcMinNights').value) || 1);
    const maxNights = Math.max(minNights, parseInt(document.getElementById('mcMaxNights').value) || minNights);
    if (minNights > maxNights) { alert(t('multicity_alert_nights')); return; }

    const returnToOrigin = document.getElementById('mcReturnToOrigin').checked;
    const tryAllOrders   = document.getElementById('mcTryAllOrders')?.checked || false;

    if (tryAllOrders && dests.length > MAX_DESTS_PERMUTATIONS) {
      alert(t('multicity_alert_permutations_too_many', MAX_DESTS_PERMUTATIONS));
      return;
    }

    const startDate = new Date(startStr + 'T00:00:00');
    const endDate   = new Date(endStr   + 'T00:00:00');
    const dateRangeDays = Math.floor((endDate - startDate) / 86400000);

    const baseSeqLen = dests.length + 1 + (returnToOrigin ? 1 : 0);
    const baseLegCount = baseSeqLen - 1;
    if (baseLegCount * minNights > dateRangeDays) {
      alert(t('multicity_alert_range_short'));
      return;
    }

    const submitBtn = document.getElementById('mcSubmitBtn');
    const resultsEl = document.getElementById('mcResults');
    submitBtn.disabled = true;

    function fmtBack(d) {
      const dd = String(d.getDate()).padStart(2, '0');
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      return `${dd}-${mm}-${d.getFullYear()}`;
    }
    function addDays(d, n) {
      const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x;
    }
    function ymdKey(d) {
      return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
    }

    /* ───────────────────────────────────────
       Build the set of leg pairs to search.

       Plain mode: N+1 pairs in the fixed order O→D1, D1→D2, ..., Dn→(O?)
       Permutation mode: ALL (i, j) pairs needed for any permutation
                         (covers every directed leg that could appear)
    ─────────────────────────────────────── */
    /* Nodes: 0 = origin (set), 1..N = dests[i-1] (set) */
    const nodes = [origin, ...dests];
    const N = dests.length;

    /* pairs: array of { from, to, depMinDate, depMaxDate } */
    /* We use FULL date range for each pair because in permutation mode
       any pair can show up at any position; this keeps the indexing
       trivially simple at modest extra search cost. */
    const pairs = [];
    const pairKeys = new Set();
    function addPair(fromIdx, toIdx, depMinDate, depMaxDate) {
      const key = `${fromIdx}|${toIdx}`;
      if (pairKeys.has(key)) return;
      pairKeys.add(key);
      pairs.push({
        fromIdx, toIdx,
        from: nodes[fromIdx],
        to:   nodes[toIdx],
        depMinDate, depMaxDate,
      });
    }
    if (tryAllOrders) {
      /* All directed (i, j), i ≠ j, where i, j are reachable nodes */
      const reachable = Array.from({ length: N + 1 }, (_, i) => i);
      for (const i of reachable) {
        for (const j of reachable) {
          if (i === j) continue;
          /* Origin → origin shouldn't happen */
          /* If !returnToOrigin, we never need j === 0 */
          if (!returnToOrigin && j === 0) continue;
          /* Origin's outgoing legs always start at startDate (depMin=0) */
          /* All other legs can start as early as start + minNights (1 stop in) */
          addPair(i, j, startDate, endDate);
        }
      }
    } else {
      /* Fixed sequence */
      const seq = [0, ...dests.map((_, i) => i + 1)];
      if (returnToOrigin) seq.push(0);
      for (let i = 0; i < seq.length - 1; i++) {
        /* Per-position windows for fast searches */
        const depMinDay = i * minNights;
        let   depMaxDay = i * maxNights;
        const remainingMinAfter = (seq.length - 1 - i - 1) * minNights;
        depMaxDay = Math.min(depMaxDay, dateRangeDays - remainingMinAfter);
        if (depMaxDay < depMinDay) depMaxDay = depMinDay;
        addPair(seq[i], seq[i + 1],
                addDays(startDate, depMinDay),
                addDays(startDate, depMaxDay));
      }
    }

    /* ── Issue searches sequentially ── */
    /* Cache: "fromIdx→toIdx" → Map<ymdKey, flight> */
    const legCache = new Map();
    try {
      for (let i = 0; i < pairs.length; i++) {
        const pair = pairs[i];
        submitBtn.textContent = t('multicity_searching_leg', i + 1, pairs.length);

        const allRoutes = pair.from.flatMap(f => pair.to.map(d => `${f} → ${d}`));
        resultsEl.innerHTML = renderSpinner(allRoutes);
        const controller = new AbortController();
        resultsEl.querySelector('#searchCancelBtn')?.addEventListener('click',
          () => controller.abort(), { once: true });

        const payload = {
          search_id:    crypto.randomUUID(),
          fecha_ini:    fmtBack(pair.depMinDate),
          fecha_fin:    fmtBack(pair.depMaxDate),
          airport_from: pair.from,
          airport_to:   pair.to,
          max_stops:    0,
          max_results:  50,
        };

        const lo   = (i / pairs.length) * 100;
        const span = (1 / pairs.length) * 100;

        const { data } = await executeSearch(payload, resultsEl, controller, {
          showTimer:         true,
          showEta:           true,
          progressTransform: pct => lo + (pct / 100) * span,
        });

        const byDate = new Map();
        for (const v of (data.vuelos || [])) {
          const p = parsePrice(v.precio);
          if (!p || p <= 0) continue;
          if (!v.fecha) continue;
          const prev = byDate.get(v.fecha);
          if (!prev || parsePrice(prev.precio) > p) {
            byDate.set(v.fecha, v);
          }
        }
        legCache.set(`${pair.fromIdx}→${pair.toIdx}`, byDate);
      }
    } catch (err) {
      if (err.name === 'AbortError') {
        resultsEl.innerHTML = renderError(t('search_cancelled'));
      } else {
        resultsEl.innerHTML = renderError(err.isApiError ? err.message : t('conn_error_full'));
      }
      submitBtn.disabled = false;
      submitBtn.textContent = t('multicity_btn_search');
      return;
    }

    /* ───────────────────────────────────────
       Enumerate combinations
    ─────────────────────────────────────── */
    /* For each permutation of destinations, build sequence and recur */
    const perms = tryAllOrders
      ? _permutations(dests.map((_, i) => i + 1))
      : [dests.map((_, i) => i + 1)];

    const combos = [];

    for (const perm of perms) {
      const sequence = [0, ...perm];
      if (returnToOrigin) sequence.push(0);
      const legCount  = sequence.length - 1;
      const nightSlots = legCount - (returnToOrigin ? 1 : 0);
      let traversed = 0;

      function recur(legIdx, nightsSoFar, nightsArr, totalSoFar, flightsArr) {
        if (traversed >= MAX_TRAVERSE) return;
        traversed++;

        if (legIdx === legCount) {
          if (nightsSoFar <= dateRangeDays) {
            combos.push({
              nights:    nightsArr.slice(),
              flights:   flightsArr.slice(),
              total:     totalSoFar,
              totalNights: nightsSoFar,
              permutation: perm.slice(),
              sequence:   sequence.slice(),
            });
          }
          return;
        }

        const fromIdx = sequence[legIdx];
        const toIdx   = sequence[legIdx + 1];
        const cache = legCache.get(`${fromIdx}→${toIdx}`);
        if (!cache) return;
        const depDate = addDays(startDate, nightsSoFar);
        const fkey = ymdKey(depDate);
        const flight = cache.get(fkey);
        if (!flight) return;
        const price = parsePrice(flight.precio);
        if (price <= 0) return;

        flightsArr.push(flight);

        if (legIdx === legCount - 1) {
          recur(legIdx + 1, nightsSoFar, nightsArr, totalSoFar + price, flightsArr);
        } else {
          for (let n = minNights; n <= maxNights; n++) {
            const remainingMinAfter = (legCount - legIdx - 1) * minNights;
            if (nightsSoFar + n + remainingMinAfter > dateRangeDays) break;
            nightsArr.push(n);
            recur(legIdx + 1, nightsSoFar + n, nightsArr, totalSoFar + price, flightsArr);
            nightsArr.pop();
          }
        }
        flightsArr.pop();
      }
      recur(0, 0, [], 0, []);
    }

    if (!combos.length) {
      resultsEl.innerHTML =
        `<div class="results-placeholder"><span class="placeholder-icon">🛫</span>` +
        `${t('multicity_no_combinations')}</div>`;
      submitBtn.disabled = false;
      submitBtn.textContent = t('multicity_btn_search');
      return;
    }

    combos.sort((a, b) => a.total - b.total);

    /* Persist state for filter interactions */
    mcRawCombos     = combos;
    mcOriginSet     = origin;
    mcDestSets      = dests;
    mcReturnToOrig  = returnToOrigin;
    mcStartDateStr  = startStr;
    mcEndDateStr    = endStr;
    mcMinNights     = minNights;
    mcMaxNights     = maxNights;
    mcFilterState   = _buildInitialFilterState(combos);

    _renderResults();

    submitBtn.disabled = false;
    submitBtn.textContent = t('multicity_btn_search');
  });

  /* ═══════════════════════════════════════════
     PERMUTATIONS HELPER (Heap's algorithm)
  ═══════════════════════════════════════════ */
  function _permutations(arr) {
    const result = [];
    const a = arr.slice();
    const c = new Array(a.length).fill(0);
    result.push(a.slice());
    let i = 1;
    while (i < a.length) {
      if (c[i] < i) {
        const swap = i % 2 === 0 ? 0 : c[i];
        const tmp = a[swap]; a[swap] = a[i]; a[i] = tmp;
        result.push(a.slice());
        c[i]++;
        i = 1;
      } else {
        c[i] = 0;
        i++;
      }
    }
    return result;
  }

  /* ═══════════════════════════════════════════
     FILTER STATE & FILTERING
  ═══════════════════════════════════════════ */
  function _buildInitialFilterState(combos) {
    const all = combos || [];
    const airlines = new Set();
    let maxStopsAny = 0;
    let maxNights = 0;
    let minNights = Infinity;
    for (const c of all) {
      for (const f of c.flights) {
        if (f.aerolinea) airlines.add(f.aerolinea);
        const s = parseInt(f.escalas) || 0;
        if (s > maxStopsAny) maxStopsAny = s;
      }
      if (c.totalNights > maxNights) maxNights = c.totalNights;
      if (c.totalNights < minNights) minNights = c.totalNights;
    }
    return {
      airlines:     null,         /* null = all */
      maxStopsLeg:  maxStopsAny,  /* allow up to N stops per leg */
      depAfter:     null,         /* HH:MM or null */
      arrBefore:    null,         /* HH:MM or null */
      avoidOvernight: false,
      sort: 'price',              /* price | duration | pareto */
    };
  }

  function _flightDepartureTime(f)   { return _parseHM(f.salida); }
  function _flightArrivalTime(f)     { return _parseHM(f.llegada); }
  function _parseHM(str) {
    if (!str) return null;
    const m = String(str).match(/(\d{1,2}):(\d{2})/);
    if (!m) return null;
    return parseInt(m[1]) * 60 + parseInt(m[2]);
  }
  function _isOvernight(f) {
    /* adelanto_llegada is typically "+1" or "+2" meaning arrival lands the next day(s) */
    const a = String(f.adelanto_llegada || '').trim();
    return /^\+\d+/.test(a);
  }

  function _applyFilters(combos) {
    const f = mcFilterState;
    return combos.filter(c => {
      for (const flight of c.flights) {
        if (f.airlines && !f.airlines.has(flight.aerolinea)) return false;
        const stops = parseInt(flight.escalas) || 0;
        if (stops > f.maxStopsLeg) return false;
        if (f.avoidOvernight && _isOvernight(flight)) return false;
        if (f.depAfter != null) {
          const t = _flightDepartureTime(flight);
          if (t != null && t < f.depAfter) return false;
        }
        if (f.arrBefore != null) {
          const t = _flightArrivalTime(flight);
          if (t != null && t > f.arrBefore) return false;
        }
      }
      return true;
    });
  }

  /* Mark Pareto-optimal combos: no other combo with both ≤ price and ≤ duration */
  function _markPareto(combos) {
    const out = combos.map(c => ({ ...c, pareto: true }));
    for (let i = 0; i < out.length; i++) {
      for (let j = 0; j < out.length; j++) {
        if (i === j) continue;
        const a = out[i];
        const b = out[j];
        if (b.total <= a.total && b.totalNights <= a.totalNights &&
            (b.total < a.total || b.totalNights < a.totalNights)) {
          a.pareto = false;
          break;
        }
      }
    }
    return out;
  }

  /* ═══════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════ */
  function _renderResults() {
    const el = document.getElementById('mcResults');
    if (!mcRawCombos.length) {
      el.innerHTML = '';
      return;
    }

    const marked   = _markPareto(mcRawCombos);
    const filtered = _applyFilters(marked);

    let sorted = filtered.slice();
    switch (mcFilterState.sort) {
      case 'duration': sorted.sort((a, b) => a.totalNights - b.totalNights || a.total - b.total); break;
      case 'pareto':   sorted.sort((a, b) => (b.pareto - a.pareto) || a.total - b.total); break;
      case 'price':
      default:         sorted.sort((a, b) => a.total - b.total);
    }

    const truncated = sorted.length > MAX_COMBINATIONS;
    const view = sorted.slice(0, MAX_COMBINATIONS);

    /* All distinct airlines from raw combos (used for the filter dropdown) */
    const airlineSet = new Set();
    for (const c of mcRawCombos) for (const f of c.flights) if (f.aerolinea) airlineSet.add(f.aerolinea);
    const allAirlines = [...airlineSet].sort();

    const headerHtml = `
      <div class="mc-results-head">
        <h3 class="mc-results-title">${t('multicity_results_title')}</h3>
        <span class="mc-results-count">${t('multicity_combinations_found', sorted.length)} / ${mcRawCombos.length}</span>
        <button type="button" class="results-action-btn" id="mcBtnShare" title="${t('share_btn_title')}">${t('share_btn')}</button>
      </div>
      ${truncated ? `<div class="mc-truncated-notice">${t('multicity_max_combos')}</div>` : ''}
      ${_buildFiltersBarHtml(allAirlines)}
      ${_buildParetoHtml(marked)}`;

    const cardsHtml = view.map((c, i) => _renderComboCard(c, i)).join('');
    el.innerHTML = headerHtml +
      `<div class="mc-combos-list">${cardsHtml || `<div class="results-placeholder"><span class="placeholder-icon">🔍</span>${t('no_match_filters')}</div>`}</div>`;

    _bindShareButton();
    _bindFiltersEvents();
    _bindSaveButtons(view);
  }

  /* ── Filters bar ── */
  function _buildFiltersBarHtml(allAirlines) {
    const f = mcFilterState;
    const airlineSelected = f.airlines || new Set(allAirlines);

    const airlinesHtml = allAirlines.length > 1
      ? allAirlines.map(a => `
          <label class="rt-fb-check">
            <input type="checkbox" class="mc-fb-airline" value="${escapeHtml(a)}"
                   ${airlineSelected.has(a) ? 'checked' : ''}/>
            <span>${escapeHtml(a)}</span>
          </label>`).join('')
      : '';

    return `
      <div class="rt-filter-bar mc-filter-bar" id="mcFilterBar">
        <div class="rt-fb-row rt-fb-row-primary">
          <div class="rt-fb-group">
            <label class="rt-fb-label" for="mcFbStops">${t('multicity_filter_stops')}</label>
            <select id="mcFbStops" class="rt-fb-sel">
              <option value="0"${f.maxStopsLeg === 0 ? ' selected' : ''}>0 (directos)</option>
              <option value="1"${f.maxStopsLeg === 1 ? ' selected' : ''}>≤ 1</option>
              <option value="2"${f.maxStopsLeg === 2 ? ' selected' : ''}>≤ 2</option>
              <option value="99"${f.maxStopsLeg >= 99 ? ' selected' : ''}>${t('multicity_filter_stops_any')}</option>
            </select>
          </div>
          <div class="rt-fb-group">
            <label class="rt-fb-label" for="mcFbDepAfter">${t('multicity_filter_dep_after')}</label>
            <input type="time" id="mcFbDepAfter" class="mc-fb-time"
                   value="${f.depAfter != null ? _fmtHM(f.depAfter) : ''}"/>
          </div>
          <div class="rt-fb-group">
            <label class="rt-fb-label" for="mcFbArrBefore">${t('multicity_filter_arr_before')}</label>
            <input type="time" id="mcFbArrBefore" class="mc-fb-time"
                   value="${f.arrBefore != null ? _fmtHM(f.arrBefore) : ''}"/>
          </div>
          <div class="rt-fb-group">
            <label class="rt-fb-check">
              <input type="checkbox" id="mcFbOvernight"${f.avoidOvernight ? ' checked' : ''}/>
              <span>${t('multicity_filter_avoid_overnight')}</span>
            </label>
          </div>
          <div class="rt-fb-group">
            <label class="rt-fb-label" for="mcFbSort">${t('filter_sort')}</label>
            <select id="mcFbSort" class="rt-fb-sel">
              <option value="price"   ${f.sort === 'price'    ? 'selected' : ''}>${t('multicity_sort_price')}</option>
              <option value="duration"${f.sort === 'duration' ? 'selected' : ''}>${t('multicity_sort_duration')}</option>
              <option value="pareto"  ${f.sort === 'pareto'   ? 'selected' : ''}>${t('multicity_sort_pareto')}</option>
            </select>
          </div>
          <button type="button" class="rt-fb-reset" id="mcFbReset">${t('filter_reset')}</button>
        </div>
        ${airlinesHtml ? `
          <details class="rt-fb-airports-details" open>
            <summary class="rt-fb-airports-summary">
              <span>${t('multicity_filter_airlines', allAirlines.length)}</span>
              <span class="rt-fb-chevron">▾</span>
            </summary>
            <div class="rt-fb-airports-body">
              <div class="rt-fb-checks">${airlinesHtml}</div>
            </div>
          </details>` : ''}
      </div>`;
  }

  function _fmtHM(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  function _bindFiltersEvents() {
    const bar = document.getElementById('mcFilterBar');
    if (!bar) return;
    function _readAndRender() {
      const stopsSel = document.getElementById('mcFbStops');
      const depEl    = document.getElementById('mcFbDepAfter');
      const arrEl    = document.getElementById('mcFbArrBefore');
      const overEl   = document.getElementById('mcFbOvernight');
      const sortEl   = document.getElementById('mcFbSort');
      mcFilterState.maxStopsLeg    = parseInt(stopsSel?.value) || 0;
      mcFilterState.depAfter       = depEl?.value ? _parseHM(depEl.value) : null;
      mcFilterState.arrBefore      = arrEl?.value ? _parseHM(arrEl.value) : null;
      mcFilterState.avoidOvernight = !!overEl?.checked;
      mcFilterState.sort           = sortEl?.value || 'price';
      const checks = bar.querySelectorAll('.mc-fb-airline');
      if (checks.length) {
        const selected = new Set([...checks].filter(c => c.checked).map(c => c.value));
        const allCount = checks.length;
        mcFilterState.airlines = (selected.size === allCount) ? null : selected;
      } else {
        mcFilterState.airlines = null;
      }
      _renderResults();
    }
    bar.addEventListener('input',  _readAndRender);
    bar.addEventListener('change', _readAndRender);
    document.getElementById('mcFbReset')?.addEventListener('click', () => {
      mcFilterState = _buildInitialFilterState(mcRawCombos);
      _renderResults();
    });
  }

  function _bindShareButton() {
    document.getElementById('mcBtnShare')?.addEventListener('click', async () => {
      if (typeof window.copyShareUrl !== 'function') return;
      const params = {
        kind:           'multicity-v2',
        origin:         mcOriginSet,
        destinations:   mcDestSets,
        startDate:      mcStartDateStr,
        endDate:        mcEndDateStr,
        minNights:      mcMinNights,
        maxNights:      mcMaxNights,
        returnToOrigin: mcReturnToOrig,
      };
      const ok = await window.copyShareUrl(params);
      const btn = document.getElementById('mcBtnShare');
      if (ok && btn) {
        const orig = btn.textContent;
        btn.textContent = t('share_copied');
        btn.disabled = true;
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2200);
      }
    });
  }

  function _bindSaveButtons(view) {
    document.querySelectorAll('.mc-combo-save-btn').forEach(btn => {
      const idx = parseInt(btn.dataset.idx);
      if (!Number.isInteger(idx) || !view[idx]) return;
      btn.addEventListener('click', () => {
        const added = _toggleSavedCombo(view[idx]);
        btn.textContent = added ? '♥' : '♡';
        btn.classList.toggle('save-btn-active', added);
        btn.title = t(added ? 'save_title_saved' : 'save_title_save');
      });
    });
  }

  /* ── Pareto scatter chart ── */
  function _buildParetoHtml(combos) {
    if (combos.length < 4) return '';

    const xs = combos.map(c => c.totalNights);
    const ys = combos.map(c => c.total);
    const xMin = Math.min(...xs), xMax = Math.max(...xs);
    const yMin = Math.min(...ys), yMax = Math.max(...ys);
    if (xMin === xMax || yMin === yMax) return '';

    const W = 720, H = 220;
    const padL = 50, padR = 16, padT = 18, padB = 30;
    const innerW = W - padL - padR;
    const innerH = H - padT - padB;

    function xPos(x) {
      return padL + (x - xMin) / (xMax - xMin) * innerW;
    }
    function yPos(y) {
      return padT + (1 - (y - yMin) / (yMax - yMin)) * innerH;
    }

    /* Axis ticks */
    const xTicks = [];
    for (let i = 0; i <= 4; i++) {
      const v = xMin + (xMax - xMin) * (i / 4);
      xTicks.push({ v: Math.round(v), x: xPos(v) });
    }
    const yTicks = [];
    for (let i = 0; i <= 4; i++) {
      const v = yMin + (yMax - yMin) * (i / 4);
      yTicks.push({ v: Math.round(v), y: yPos(v) });
    }

    const tickLines = xTicks.map(t => `<line class="mc-px-tick" x1="${t.x}" y1="${padT}" x2="${t.x}" y2="${padT+innerH}"/>`).join('') +
                      yTicks.map(t => `<line class="mc-px-tick" x1="${padL}" y1="${t.y}" x2="${padL+innerW}" y2="${t.y}"/>`).join('');
    const xLabels  = xTicks.map(t => `<text class="mc-px-tick-l" x="${t.x}" y="${padT+innerH+16}" text-anchor="middle">${t.v}</text>`).join('');
    const yLabels  = yTicks.map(t => `<text class="mc-px-tick-l" x="${padL-8}" y="${t.y+3}" text-anchor="end">${t.v}€</text>`).join('');

    const dots = combos.map(c => `
      <circle class="mc-px-dot${c.pareto ? ' mc-px-pareto' : ''}"
              cx="${xPos(c.totalNights).toFixed(1)}"
              cy="${yPos(c.total).toFixed(1)}"
              r="${c.pareto ? 5 : 3.5}">
        <title>${escapeHtml(t('multicity_pareto_tooltip', c.totalNights, Math.round(c.total)))}</title>
      </circle>`).join('');

    return `
      <details class="mc-pareto-details" open>
        <summary class="mc-pareto-summary">
          <span>${t('multicity_pareto_title')}</span>
          <span class="mc-pareto-hint">${t('multicity_pareto_hint')}</span>
          <span class="rt-fb-chevron">▾</span>
        </summary>
        <div class="mc-pareto-body">
          <svg class="mc-pareto-svg" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
            ${tickLines}
            ${xLabels}
            ${yLabels}
            <text class="mc-px-axis-l" x="${padL+innerW/2}" y="${H-4}" text-anchor="middle">${t('multicity_pareto_x')}</text>
            <text class="mc-px-axis-l" x="${12}" y="${padT+innerH/2}" text-anchor="middle" transform="rotate(-90 12 ${padT+innerH/2})">${t('multicity_pareto_y')}</text>
            ${dots}
          </svg>
        </div>
      </details>`;
  }

  /* ── Combo card ── */
  function _renderComboCard(combo, idx) {
    const isFirst = idx === 0;
    const totalStr = combo.total.toFixed(2).replace('.', ',') + ' €';

    /* Stay summary based on the actual permutation of destinations used */
    const seq = combo.sequence;
    const nodes = [mcOriginSet, ...mcDestSets];
    const staySummary = combo.nights.map((n, i) => {
      /* Stay i is at the destination after leg i — sequence[i+1] is the
         node index whose first IATA we'll use as the city label */
      const nodeIdx = seq[i + 1];
      const set = nodes[nodeIdx] || [];
      const iata = set[0] || '';
      const city = iata ? (airportInfo(iata).city || iata) : iata;
      return t('multicity_combo_stay', n, escapeHtml(city));
    }).join(' · ');

    /* Permutation badge — only show when destinations are NOT in the
       original input order (i.e. when permutation mode reordered them) */
    let permBadge = '';
    const origOrder = mcDestSets.map((_, i) => i + 1).join('-');
    const usedOrder = combo.permutation.join('-');
    if (origOrder !== usedOrder) {
      const orderLabel = combo.permutation
        .map(nodeIdx => (nodes[nodeIdx] && nodes[nodeIdx][0]) || '?')
        .map(iata => airportInfo(iata).city || iata)
        .join(' → ');
      permBadge = `<span class="mc-combo-perm-badge" title="${escapeHtml(orderLabel)}">${t('multicity_combo_reordered')}</span>`;
    }

    const paretoBadge = combo.pareto
      ? `<span class="mc-combo-pareto-badge" title="${t('multicity_pareto_dot_tooltip')}">${t('multicity_combo_pareto_label')}</span>`
      : '';

    const saved = _isSavedCombo(combo);
    const saveBtn = `<button class="mc-combo-save-btn${saved ? ' save-btn-active' : ''}"
                             data-idx="${idx}"
                             title="${t(saved ? 'save_title_saved' : 'save_title_save')}">${saved ? '♥' : '♡'}</button>`;

    const legRows = combo.flights.map((v, i) => {
      const oriInfo = airportInfo(v.origen);
      const dstInfo = airportInfo(v.destino);
      const stops = stopsLabel(v.escalas);
      const arr   = v.adelanto_llegada
        ? `<sup class="next-day">${escapeHtml(v.adelanto_llegada)}</sup>` : '';
      const bookBtn = v.url
        ? `<a class="book-btn" href="${escapeHtml(v.url)}" target="_blank" rel="noopener noreferrer"
              title="${t('book_btn_title')}">${t('book_btn_text')}</a>`
        : '';
      return `
        <div class="mc-combo-leg">
          <div class="mc-combo-leg-date">${flightDateLabel(v.fecha)}</div>
          <div class="mc-combo-leg-body">
            <div class="mc-combo-leg-route">
              <strong>${escapeHtml(v.origen)}</strong>
              <span class="mc-combo-arrow">→</span>
              <strong>${escapeHtml(v.destino)}</strong>
              <span class="mc-combo-cities">${escapeHtml(oriInfo.city)} → ${escapeHtml(dstInfo.city)}</span>
            </div>
            <div class="mc-combo-leg-meta">
              <span class="mc-combo-times">${timeOnly(v.salida)} → ${timeOnly(v.llegada)}${arr}</span>
              <span class="mc-combo-airline">${escapeHtml(v.aerolinea)}</span>
              ${stops}
              <span class="mc-combo-price">${escapeHtml(v.precio)}</span>
            </div>
          </div>
          <div class="mc-combo-leg-actions">${bookBtn}</div>
        </div>`;
    }).join('');

    return `
      <div class="mc-combo-card${isFirst ? ' mc-combo-best' : ''}">
        <div class="mc-combo-head">
          <span class="mc-combo-rank">#${idx + 1}</span>
          ${paretoBadge}
          ${permBadge}
          <span class="mc-combo-stay-summary">${staySummary}</span>
          <span class="mc-combo-duration">${t('multicity_combo_duration', combo.totalNights)}</span>
          <span class="mc-combo-total"><span class="mc-combo-total-label">${t('multicity_combo_total')}</span><strong>${totalStr}</strong></span>
          ${saveBtn}
        </div>
        <div class="mc-combo-legs">${legRows}</div>
      </div>`;
  }

  /* ═══════════════════════════════════════════
     RESTORE FROM SHARED LINK
  ═══════════════════════════════════════════ */
  window.mcApplyShared = function mcApplyShared(payload) {
    if (!payload) return;
    if (Array.isArray(payload)) return;

    if (Array.isArray(payload.origin)) originSel.setSelected(payload.origin);

    while (destinations.length > 0) {
      destinations[0].wrap.remove();
      destinations.shift();
    }
    if (Array.isArray(payload.destinations)) {
      payload.destinations.forEach(() => _addDestination());
      payload.destinations.forEach((arr, i) => {
        if (destinations[i] && Array.isArray(arr)) destinations[i].selector.setSelected(arr);
      });
    } else {
      _addDestination();
    }

    if (payload.startDate) document.getElementById('mcStartDate').value = payload.startDate;
    if (payload.endDate)   document.getElementById('mcEndDate').value   = payload.endDate;
    if (payload.minNights != null) document.getElementById('mcMinNights').value = payload.minNights;
    if (payload.maxNights != null) document.getElementById('mcMaxNights').value = payload.maxNights;
    if (payload.returnToOrigin != null) document.getElementById('mcReturnToOrigin').checked = payload.returnToOrigin;
  };

  /* ═══════════════════════════════════════════
     LANGUAGE CHANGE
  ═══════════════════════════════════════════ */
  if (typeof onLangChange === 'function') {
    onLangChange(() => {
      _renumberDestinations();
      destinations.forEach(d => {
        const rmBtn = d.wrap.querySelector('.mc-dest-remove');
        if (rmBtn) rmBtn.textContent = t('multicity_dest_remove');
      });
      /* Re-render results if any */
      if (mcRawCombos.length) _renderResults();
    });
  }
})();
