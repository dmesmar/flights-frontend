/* -------------------------------------------
   EXPRESS TRIP
   Same-day trip: outbound morning (<12:00)
                  return afternoon/evening (>=12:00)
------------------------------------------- */

/* ── Helpers ── */
function exTimeToMinutes(timeStr) {
  // accepts "HH:MM" or "HH:MM on Thu Jun 4"
  const m = timeStr.match(/(\d{1,2}):(\d{2})/);
  if (!m) return 0;
  return parseInt(m[1]) * 60 + parseInt(m[2]);
}

function isMorning(v)  { const m = exTimeToMinutes(v.salida); return m >= 4 * 60 && m < 12 * 60; }  // departs 04:00–11:59
function isEvening(v)  { return exTimeToMinutes(v.salida) >= 12 * 60; } // departs at or after 12:00

let exDestEntries = null; // last search results for filter re-renders
let exElapsedS    = '0.0';
let exRawOut      = null;
let exRawRet      = null;

/* ── Airport selectors ── */
const exSelectorFrom = createAirportSelector(
  document.getElementById('exSelectorFrom'),
  document.getElementById('exTagsFrom')
);
const exSelectorTo = createAirportSelector(
  document.getElementById('exSelectorTo'),
  document.getElementById('exTagsTo')
);

exSelectorFrom.setGetAllowed(() => true);
exSelectorTo.setGetAllowed(a => {
  if (!iataRoutes) return true;
  const froms = exSelectorFrom.getSelected();
  if (froms.length === 0)
    return Object.values(iataRoutes).some(dests => dests.includes(a.iata));
  return froms.some(f => (iataRoutes[f] || []).includes(a.iata));
});
exSelectorFrom.setOnChange(() => exSelectorTo.refresh());

/* ── Stops selector ── */
document.getElementById('exStopsRow')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.stop-btn');
  if (!btn) return;
  document.querySelectorAll('#exStopsRow .stop-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById('exMaxStops').value = btn.dataset.value;
});

/* ── Day buttons ── */
document.getElementById('exDayBtnsRow')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.day-btn');
  if (!btn) return;
  btn.classList.toggle('active');
});

/* ── Form submit ── */
document.getElementById('expressForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const fechaIni = document.getElementById('exFechaIni').value;
  const fechaFin = document.getElementById('exFechaFin').value;
  const from     = exSelectorFrom.getSelected();
  const to       = exSelectorTo.getSelected();
  const stops    = parseInt(document.getElementById('exMaxStops').value);

  if (!fechaIni || !fechaFin) { alert(t('alert_dates')); return; }
  if (from.length === 0)      { alert(t('alert_origin')); return; }
  if (to.length === 0)        { alert(t('alert_dest'));   return; }

  const submitBtn   = document.getElementById('exSubmitBtn');
  const resultsEl   = document.getElementById('expressResults');
  submitBtn.disabled    = true;
  submitBtn.textContent = t('express_searching_out');

  const fechaIniBack = fechaIni.split('-').reverse().join('-');
  const fechaFinBack = fechaFin.split('-').reverse().join('-');

  const searchStart = Date.now();

  const payloadOut = {
    fecha_ini:    fechaIniBack,
    fecha_fin:    fechaFinBack,
    airport_from: from,
    airport_to:   to,
    max_stops:    stops,
  };
  const payloadRet = {
    fecha_ini:    fechaIniBack,
    fecha_fin:    fechaFinBack,
    airport_from: to,
    airport_to:   from,
    max_stops:    stops,
  };

  resultsEl.innerHTML = renderSpinner([...from.flatMap(f => to.map(t2 => `${f} → ${t2}`))]);

  // Timer display
  const timerInterval = setInterval(() => {
    const el = document.getElementById('spinnerTimer');
    if (el) el.textContent = Math.floor((Date.now() - searchStart) / 1000) + ' s';
  }, 1000);

  // Progress polling — two sequential searches, show combined progress
  let searchPhase = 0; // 0 = outbound, 1 = return
  const progressInterval = setInterval(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/progress`);
      if (!r.ok) return;
      const { percent, message } = await r.json();
      const fill   = document.getElementById('progressFill');
      const pct    = document.getElementById('progressPct');
      const status = document.getElementById('progressStatus');
      const eta    = document.getElementById('spinnerEta');
      // Phase 0: 0–50%, phase 1: 50–100%
      const combined = searchPhase === 0 ? percent / 2 : 50 + percent / 2;
      if (fill)   fill.style.width   = `${Math.min(Math.max(combined, 0), 100)}%`;
      if (pct)    pct.textContent    = `${Math.round(combined)}%`;
      if (status && message) status.textContent = message;
      if (eta && combined > 5) {
        const elapsed = (Date.now() - searchStart) / 1000;
        const remaining = Math.round(elapsed / combined * (100 - combined));
        eta.textContent = t('spinner_remaining', remaining);
      }
    } catch { /* backend not ready yet */ }
  }, 600);

  try {
    const resOut = await fetch(`${API_BASE}/api/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadOut),
    });
    if (!resOut.ok) {
      resultsEl.innerHTML = renderError(`Error ${resOut.status}`);
      return;
    }
    const dataOut = await resOut.json();

    searchPhase = 1;
    submitBtn.textContent = t('express_searching_ret');

    const resRet = await fetch(`${API_BASE}/api/search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payloadRet),
    });
    if (!resRet.ok) {
      resultsEl.innerHTML = renderError(`Error ${resRet.status}`);
      return;
    }
    const dataRet = await resRet.json();

    // Active day filter from express panel
    const dayFilter = [...document.querySelectorAll('#exDayBtnsRow .day-btn.active')].map(b => parseInt(b.dataset.day));

    const vuelosOut = (dataOut.vuelos || []).filter(v => {
      if (!isMorning(v)) return false;
      if (dayFilter.length && !dayFilter.includes(parseDateYMD(v.fecha).getDay())) return false;
      return true;
    });

    const vuelosRet = (dataRet.vuelos || []).filter(v => {
      if (!isEvening(v)) return false;
      if (dayFilter.length && !dayFilter.includes(parseDateYMD(v.fecha).getDay())) return false;
      return true;
    });

    // Group by destination → date
    // byDest[destino][fecha] = { out: [], ret: [], origen }
    exRawOut = vuelosOut;
    exRawRet = vuelosRet;
    const byDest = {};
    vuelosOut.forEach(v => {
      byDest[v.destino] = byDest[v.destino] || {};
      byDest[v.destino][v.fecha] = byDest[v.destino][v.fecha] || { out: [], ret: [], origen: v.origen };
      byDest[v.destino][v.fecha].out.push(v);
    });
    vuelosRet.forEach(v => {
      // return flight departs from original destination (v.origen)
      const dest = v.origen;
      if (!byDest[dest] || !byDest[dest][v.fecha]) return;
      byDest[dest][v.fecha].ret.push(v);
    });

    const elapsedMs = Date.now() - searchStart;
    const elapsedS  = (elapsedMs / 1000).toFixed(1);

    // Build dest list sorted by cheapest combo
    const destEntries = Object.entries(byDest)
      .map(([dest, dateMap]) => {
        const validDates = Object.entries(dateMap)
          .filter(([, d]) => d.out.length && d.ret.length)
          .sort(([a], [b]) => {
            const [da, ma, ya] = a.split('-').map(Number);
            const [db, mb, yb] = b.split('-').map(Number);
            return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
          });
        if (!validDates.length) return null;
        const bestPerDest = Math.min(...validDates.map(([, d]) => {
          const bo = Math.min(...d.out.map(v => parsePrice(v.precio)));
          const br = Math.min(...d.ret.map(v => parsePrice(v.precio)));
          return bo + br;
        }));
        return { dest, validDates, bestPerDest };
      })
      .filter(Boolean)
      .sort((a, b) => a.bestPerDest - b.bestPerDest);

    const totalTrips = destEntries.reduce(
      (sum, { validDates }) => sum + validDates.reduce((s, [, d]) => s + d.out.length * d.ret.length, 0), 0
    );

    if (totalTrips === 0) {
      resultsEl.innerHTML = `
        <div class="results-placeholder">
          <span class="placeholder-icon">⚡</span>
          ${t('express_no_trips')}
        </div>`;
      return;
    }

    exDestEntries = destEntries;
    exElapsedS    = elapsedS;

    const allMinTotals = destEntries.flatMap(({ validDates }) =>
      validDates.map(([, d]) => {
        const bo = Math.min(...d.out.map(v => parsePrice(v.precio)));
        const br = Math.min(...d.ret.map(v => parsePrice(v.precio)));
        return bo + br;
      })
    );
    const maxSlider = Math.ceil(Math.max(...allMinTotals) / 5) * 5;
    const destsOut  = [...new Set(vuelosOut.map(v => v.destino))].sort();
    const destsRet  = [...new Set(vuelosRet.map(v => v.destino))].sort();

    resultsEl.innerHTML =
      buildExpressFilterBar(maxSlider, destsOut, destsRet)
      + buildExpressResultsHeader()
      + `<div id="expressGrid"></div>`;

    renderExpressGrid({ maxTotal: maxSlider, destOut: '', destRet: '', sort: 'total-asc' });
    bindExpressFilterEvents(maxSlider);
    bindExpressResultsHeaderBtns(vuelosOut, vuelosRet, elapsedS);

  } catch {
    resultsEl.innerHTML = renderError(t('conn_error_full', API_BASE));
  } finally {
    clearInterval(progressInterval);
    clearInterval(timerInterval);
    submitBtn.disabled    = false;
    submitBtn.textContent = t('btn_express_search');
  }
});

function expressCard(v) {
  const oriInfo  = airportInfo(v.origen);
  const dstInfo  = airportInfo(v.destino);
  const arrival  = v.adelanto_llegada ? `<sup class="next-day">${v.adelanto_llegada}</sup>` : '';
  const id       = flightId(v);
  const savedNow = isSaved(v);
  return `
    <div class="flight-card">
      <div class="card-top">
        <span class="card-date-label">${flightDateLabel(v.fecha)}</span>
        <span class="card-airline-name">${v.aerolinea}</span>
      </div>
      <div class="card-body">
        <div class="card-timeline">
          <div class="card-endpoint dep">
            <span class="endpoint-time">${timeOnly(v.salida)}</span>
            <span class="endpoint-iata">${v.origen}</span>
            <span class="endpoint-city">${oriInfo.city}</span>
          </div>
          <div class="card-mid">
            <span class="card-duration-label">${v.duracion}</span>
            <div class="card-flight-line"></div>
            ${stopsLabel(v.escalas)}
          </div>
          <div class="card-endpoint arr">
            <span class="endpoint-time">${timeOnly(v.llegada)}${arrival}</span>
            <span class="endpoint-iata">${v.destino}</span>
            <span class="endpoint-city">${dstInfo.city}</span>
          </div>
        </div>
      </div>
      <div class="card-footer">
        <span class="card-price">${v.precio}</span>
        <div class="card-footer-right">
          <button class="save-btn ${savedNow ? 'save-btn-active' : ''}" data-id="${id}"
            title="${t(savedNow ? 'save_title_saved' : 'save_title_save')}">
            ${savedNow ? '♥' : '♡'}
          </button>
        </div>
      </div>
    </div>`;
}

/* ── Express filter bar ── */
function buildExpressFilterBar(maxSlider, destsOut, destsRet) {
  return `
    <div class="filter-bar" id="exFilterBar">
      <div class="filter-bar-top">
        <span class="filter-bar-title">${t('filter_title')}</span>
        <button type="button" class="filter-reset-btn" id="exFilterResetBtn">${t('filter_reset')}</button>
      </div>
      <div class="filter-section">
        <div class="filter-row">
          <div class="filter-group filter-group-price">
            <label class="filter-label">${t('express_filter_max_total')} <span class="filter-price-val" id="exPriceVal">${maxSlider}\u202f€</span></label>
            <input type="range" class="filter-range" id="exFPrice" min="0" max="${maxSlider}" value="${maxSlider}" step="5" />
          </div>
          <div class="filter-group">
            <label class="filter-label">${t('express_filter_dest_out')}</label>
            <select class="filter-select" id="exFDestOut">
              <option value="">${t('filter_all_m')}</option>
              ${destsOut.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('')}
            </select>
          </div>
          <div class="filter-group">
            <label class="filter-label">${t('express_filter_dest_ret')}</label>
            <select class="filter-select" id="exFDestRet">
              <option value="">${t('filter_all_m')}</option>
              ${destsRet.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('')}
            </select>
          </div>
          <div class="filter-group">
            <label class="filter-label">${t('filter_sort')}</label>
            <select class="filter-select" id="exFSort">
              <option value="total-asc">${t('express_sort_total_asc')}</option>
              <option value="total-desc">${t('express_sort_total_desc')}</option>
              <option value="date-asc">${t('sort_date_asc')}</option>
              <option value="date-desc">${t('sort_date_desc')}</option>
            </select>
          </div>
        </div>
      </div>
    </div>`;
}

/* ── Express grid renderer (called on search + any filter change) ── */
function renderExpressGrid(filters) {
  const grid = document.getElementById('expressGrid');
  if (!grid || !exDestEntries) return;

  const filtered = exDestEntries
    .map(({ dest, validDates }) => {
      const fd = validDates.map(([fecha, { out, ret, origen }]) => {
        const fOut = filters.destOut ? out.filter(v => v.destino === filters.destOut) : out;
        const fRet = filters.destRet ? ret.filter(v => v.destino === filters.destRet) : ret;
        if (!fOut.length || !fRet.length) return null;
        const minTotal = Math.min(...fOut.map(v => parsePrice(v.precio)))
                       + Math.min(...fRet.map(v => parsePrice(v.precio)));
        if (minTotal > filters.maxTotal) return null;
        return [fecha, { out: fOut, ret: fRet, origen }];
      }).filter(Boolean);
      if (!fd.length) return null;
      const best = Math.min(...fd.map(([, d]) =>
        Math.min(...d.out.map(v => parsePrice(v.precio))) + Math.min(...d.ret.map(v => parsePrice(v.precio)))
      ));
      return { dest, validDates: fd, bestPerDest: best };
    })
    .filter(Boolean);

  if (filters.sort === 'total-asc')  filtered.sort((a, b) => a.bestPerDest - b.bestPerDest);
  if (filters.sort === 'total-desc') filtered.sort((a, b) => b.bestPerDest - a.bestPerDest);
  if (filters.sort === 'date-asc' || filters.sort === 'date-desc') {
    filtered.sort((a, b) => {
      const fa = a.validDates[0][0], fb = b.validDates[0][0];
      const [da,ma,ya] = fa.split('-').map(Number), [db,mb,yb] = fb.split('-').map(Number);
      const d = new Date(ya,ma-1,da) - new Date(yb,mb-1,db);
      return filters.sort === 'date-asc' ? d : -d;
    });
  }

  const total = filtered.reduce((s, { validDates }) =>
    s + validDates.reduce((ss, [, d]) => ss + d.out.length * d.ret.length, 0), 0);
  const countEl = document.getElementById('exResultsCount');
  if (countEl) countEl.innerHTML = t('express_trips_found', total, exElapsedS);

  if (!filtered.length) {
    grid.innerHTML = `<div class="results-placeholder"><span class="placeholder-icon">⚡</span>${t('express_no_trips')}</div>`;
    return;
  }

  let html = '';
  for (const { dest, validDates, bestPerDest } of filtered) {
    const dstInfo  = airportInfo(dest);
    const firstOri = validDates[0][1].origen;
    const srcInfo  = airportInfo(firstOri);

    html += `
      <div class="express-dest-section">
        <div class="route-header">
          <div class="route-header-left">
            <span class="route-header-main">${srcInfo.city} ⇄ ${dstInfo.city}</span>
            <span class="route-header-sub">${firstOri} ⇄ ${dest}</span>
          </div>
          <span class="express-dest-best">${t('express_total')} <strong>${bestPerDest.toFixed(2).replace('.', ',')} €</strong></span>
        </div>`;

    for (const [fecha, { out, ret }] of validDates) {
      const sortedOut = [...out].sort((a, b) => parsePrice(a.precio) - parsePrice(b.precio));
      const sortedRet = [...ret].sort((a, b) => parsePrice(a.precio) - parsePrice(b.precio));

      html += `
        <div class="express-day-section">
          <div class="express-day-header">
            <span class="express-day-label">${flightDateLabel(fecha)}</span>
          </div>
          <div class="express-legs">
            <div class="express-leg">
              <div class="express-leg-title">${t('express_leg_out')} <span class="express-opts">${t('express_opts', sortedOut.length)}</span></div>
              <div class="flights-grid">${sortedOut.map(v => expressCard(v)).join('')}</div>
            </div>
            <div class="express-legs-divider">⇅</div>
            <div class="express-leg">
              <div class="express-leg-title">${t('express_leg_ret')} <span class="express-opts">${t('express_opts', sortedRet.length)}</span></div>
              <div class="flights-grid">${sortedRet.map(v => expressCard(v)).join('')}</div>
            </div>
          </div>
        </div>`;
    }
    html += `</div>`; // express-dest-section
  }

  grid.innerHTML = html;

  const allFlights = [...(exRawOut || []), ...(exRawRet || [])];
  grid.querySelectorAll('.save-btn').forEach(btn => {
    const id = btn.dataset.id;
    const v  = allFlights.find(f => flightId(f) === id);
    if (v) {
      btn.textContent = isSaved(v) ? t('save_btn_saved') : t('save_btn_save');
      btn.classList.toggle('save-btn-active', isSaved(v));
      btn.addEventListener('click', () => toggleSave(v));
    }
  });
}

/* ── Bind filter events ── */
function bindExpressFilterEvents(maxSlider) {
  function readFilters() {
    return {
      maxTotal: parseFloat(document.getElementById('exFPrice')?.value ?? maxSlider),
      destOut:  document.getElementById('exFDestOut')?.value ?? '',
      destRet:  document.getElementById('exFDestRet')?.value ?? '',
      sort:     document.getElementById('exFSort')?.value ?? 'total-asc',
    };
  }
  function refresh() { renderExpressGrid(readFilters()); }

  document.getElementById('exFPrice')?.addEventListener('input', (e) => {
    document.getElementById('exPriceVal').textContent = `${e.target.value}\u202f€`;
    refresh();
  });
  document.getElementById('exFDestOut')?.addEventListener('change', refresh);
  document.getElementById('exFDestRet')?.addEventListener('change', refresh);
  document.getElementById('exFSort')?.addEventListener('change', refresh);
  document.getElementById('exFilterResetBtn')?.addEventListener('click', () => {
    document.getElementById('exFPrice').value         = maxSlider;
    document.getElementById('exPriceVal').textContent = `${maxSlider}\u202f€`;
    document.getElementById('exFDestOut').value       = '';
    document.getElementById('exFDestRet').value       = '';
    document.getElementById('exFSort').value          = 'total-asc';
    refresh();
  });
}

/* ── Express results header ── */
function buildExpressResultsHeader() {
  return `
    <div class="results-header">
      <span class="results-count" id="exResultsCount"></span>
      <div class="results-header-actions">
        <button type="button" class="results-action-btn" id="exBtnSave">${t('btn_save_search')}</button>
        <button type="button" class="results-action-btn" id="exBtnDownload">${t('btn_download_json')}</button>
      </div>
    </div>`;
}

function bindExpressResultsHeaderBtns(vuelosOut, vuelosRet, elapsedS) {
  const from = exSelectorFrom.getSelected();
  const to   = exSelectorTo.getSelected();
  const name = (from.length && to.length)
    ? `${from.join(', ')} ⇄ ${to.join(', ')}`
    : (vuelosOut[0] ? `${vuelosOut[0].origen} ⇄ ${vuelosOut[0].destino}` : 'Exprés');
  const total = (exDestEntries || []).reduce(
    (s, { validDates }) => s + validDates.reduce((ss, [, d]) => ss + d.out.length * d.ret.length, 0), 0
  );
  const snapshot = {
    id:       Date.now().toString(36),
    name,
    savedAt:  new Date().toLocaleString(t('locale_tag'), { dateStyle: 'short', timeStyle: 'short' }),
    vuelosOut,
    vuelosRet,
    elapsedS,
    total,
  };

  document.getElementById('exBtnSave')?.addEventListener('click', () => {
    saveExpressSnapshot(snapshot);
    const btn = document.getElementById('exBtnSave');
    if (btn) { btn.textContent = t('btn_save_done'); btn.disabled = true; }
    if (!document.getElementById('tab-saved').classList.contains('hidden')) renderSavedTab();
  });
  document.getElementById('exBtnDownload')?.addEventListener('click', () => {
    downloadExpressJSON(snapshot);
  });
}

/* ── Express saved routes (localStorage) ── */
const EX_SAVED_KEY = 'savedExpressRoutes';

function loadSavedExpressRoutes() {
  try { return JSON.parse(localStorage.getItem(EX_SAVED_KEY) || '[]'); }
  catch { return []; }
}
function storeSavedExpressRoutes(list) {
  try { localStorage.setItem(EX_SAVED_KEY, JSON.stringify(list)); }
  catch { alert(t('storage_full')); }
}
function saveExpressSnapshot(snapshot) {
  const list = loadSavedExpressRoutes();
  list.unshift(snapshot);
  storeSavedExpressRoutes(list);
}
function deleteExpressSnapshot(id) {
  storeSavedExpressRoutes(loadSavedExpressRoutes().filter(s => s.id !== id));
}
function renameExpressSnapshot(id, newName) {
  const list = loadSavedExpressRoutes();
  const entry = list.find(s => s.id === id);
  if (entry) { entry.name = newName; storeSavedExpressRoutes(list); }
}
function downloadExpressJSON(snapshot) {
  const safeName = snapshot.name.replace(/[^a-zA-Z0-9_\-]/g, '_') || 'expres';
  const date     = new Date().toISOString().slice(0, 10);
  const filename = `express_${safeName}_${date}.json`;
  const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
}

/* ── Load express snapshot (restores results from saved/imported data) ── */
function loadExpressSnapshot(snapshot) {
  exRawOut   = snapshot.vuelosOut;
  exRawRet   = snapshot.vuelosRet;
  exElapsedS = snapshot.elapsedS || '?';

  // Re-derive exDestEntries
  const byDest = {};
  exRawOut.forEach(v => {
    byDest[v.destino] = byDest[v.destino] || {};
    byDest[v.destino][v.fecha] = byDest[v.destino][v.fecha] || { out: [], ret: [], origen: v.origen };
    byDest[v.destino][v.fecha].out.push(v);
  });
  exRawRet.forEach(v => {
    const dest = v.origen;
    if (!byDest[dest] || !byDest[dest][v.fecha]) return;
    byDest[dest][v.fecha].ret.push(v);
  });
  exDestEntries = Object.entries(byDest)
    .map(([dest, dateMap]) => {
      const validDates = Object.entries(dateMap)
        .filter(([, d]) => d.out.length && d.ret.length)
        .sort(([a], [b]) => {
          const [da, ma, ya] = a.split('-').map(Number);
          const [db, mb, yb] = b.split('-').map(Number);
          return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
        });
      if (!validDates.length) return null;
      const bestPerDest = Math.min(...validDates.map(([, d]) => {
        const bo = Math.min(...d.out.map(v => parsePrice(v.precio)));
        const br = Math.min(...d.ret.map(v => parsePrice(v.precio)));
        return bo + br;
      }));
      return { dest, validDates, bestPerDest };
    })
    .filter(Boolean)
    .sort((a, b) => a.bestPerDest - b.bestPerDest);

  const resultsEl = document.getElementById('expressResults');
  if (!exDestEntries.length) {
    resultsEl.innerHTML = `<div class="results-placeholder"><span class="placeholder-icon">⚡</span>${t('express_no_trips')}</div>`;
    document.querySelector('[data-tab="express"]')?.click();
    return;
  }

  const allMinTotals = exDestEntries.flatMap(({ validDates }) =>
    validDates.map(([, d]) => {
      const bo = Math.min(...d.out.map(v => parsePrice(v.precio)));
      const br = Math.min(...d.ret.map(v => parsePrice(v.precio)));
      return bo + br;
    })
  );
  const maxSlider = Math.ceil(Math.max(...allMinTotals) / 5) * 5;
  const destsOut  = [...new Set(exRawOut.map(v => v.destino))].sort();
  const destsRet  = [...new Set(exRawRet.map(v => v.destino))].sort();

  resultsEl.innerHTML =
    buildExpressFilterBar(maxSlider, destsOut, destsRet)
    + buildExpressResultsHeader()
    + `<div id="expressGrid"></div>`;

  renderExpressGrid({ maxTotal: maxSlider, destOut: '', destRet: '', sort: 'total-asc' });
  bindExpressFilterEvents(maxSlider);
  bindExpressResultsHeaderBtns(exRawOut, exRawRet, exElapsedS);

  document.querySelector('[data-tab="express"]')?.click();
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Render saved express routes section ── */
function renderSavedExpressRoutes() {
  const container = document.getElementById('savedExpressRoutes');
  if (!container) return;
  const list = loadSavedExpressRoutes();
  if (!list.length) { container.innerHTML = ''; return; }

  let html = `<div class="saved-searches-section">
    <div class="saved-searches-header">
      <span class="saved-searches-title">${t('saved_express_title')}</span>
    </div>
    <div class="saved-searches-list">`;
  for (const s of list) {
    html += `
      <div class="saved-search-card" data-id="${escapeHtml(s.id)}">
        <div class="ss-info">
          <span class="ss-name" data-id="${escapeHtml(s.id)}" title="${t('ss_load_title')}">${escapeHtml(s.name)}</span>
          <span class="ss-meta">${t('ex_ss_trips_count', s.total, s.savedAt)}</span>
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
      const entry = loadSavedExpressRoutes().find(s => s.id === btn.dataset.id);
      if (entry) loadExpressSnapshot(entry);
    });
  });
  container.querySelectorAll('.ss-name').forEach(nameEl => {
    nameEl.style.cursor = 'pointer';
    nameEl.addEventListener('click', () => {
      const entry = loadSavedExpressRoutes().find(s => s.id === nameEl.dataset.id);
      if (entry) loadExpressSnapshot(entry);
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
        renameExpressSnapshot(id, newName);
        renderSavedExpressRoutes();
      };
      input.addEventListener('blur', commit);
      input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); input.blur(); }
        if (ev.key === 'Escape') { input.value = current; input.blur(); }
      });
    });
  });
  container.querySelectorAll('.ss-dl').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = loadSavedExpressRoutes().find(s => s.id === btn.dataset.id);
      if (entry) downloadExpressJSON(entry);
    });
  });
  container.querySelectorAll('.ss-del').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteExpressSnapshot(btn.dataset.id);
      renderSavedExpressRoutes();
    });
  });
}

/* ── Import express JSON ── */
document.getElementById('exBtnImport')?.addEventListener('click', () => {
  document.getElementById('exImportFileInput')?.click();
});
document.getElementById('exImportFileInput')?.addEventListener('change', (e) => {
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
      loadExpressSnapshot(data);
    } catch {
      alert(t('import_invalid'));
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});
