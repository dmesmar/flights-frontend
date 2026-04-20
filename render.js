/* -------------------------------------------
   RENDER / DISPLAY UTILITIES
------------------------------------------- */
/* ═══════════════════════════════════════════
   RENDER HELPERS
═══════════════════════════════════════════ */
function parsePrice(priceStr) {
  return parseFloat(priceStr.replace(/[^0-9.]/g, '')) || 0;
}

function timeOnly(s) {
  // Backend may return "17:40 on Thu Jun 4" — extract just HH:MM
  if (!s) return '';
  const m = s.match(/\d{1,2}:\d{2}/);
  return m ? m[0] : s;
}

function airportInfo(iata) {
  return AIRPORTS.find(a => a.iata === iata) || { city: iata, name: iata, countryName: '' };
}

function flightDateLabel(fechaStr) {
  // fechaStr is DD-MM-YYYY
  const [d, m, y] = fechaStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `<span class="weekday">${t('weekdays')[dt.getDay()]}</span> ${d} ${t('months')[m - 1]}`;
}

function stopsLabel(n) {
  if (n === 0) return `<span class="badge badge-direct">${t('badge_direct')}</span>`;
  return `<span class="badge badge-stops">${t('badge_stops', n)}</span>`;
}

function renderSpinner(rutas) {
  const rutasTxt = rutas.length ? rutas.join(', ') : '…';
  return `
    <div class="spinner-wrap">
      <div class="spinner"></div>
      <p class="spinner-msg">${t('spinner_msg')}</p>
      <p class="spinner-timer" id="spinnerTimer">0 s</p>
      <p class="spinner-eta" id="spinnerEta"></p>
      <div class="progress-wrap">
        <div class="progress-track">
          <div class="progress-fill" id="progressFill"></div>
        </div>
        <span class="progress-pct" id="progressPct">0%</span>
      </div>
      <p class="progress-status" id="progressStatus">${t('spinner_init')}</p>
      <p class="spinner-sub">${t('spinner_no_close')}</p>
    </div>`;
}

function renderError(msg) {
  return `
    <div class="results-placeholder">
      <span class="placeholder-icon">⚠️</span>
      ${msg}
    </div>`;
}

function renderResults(data) {
  if (!data.vuelos || data.vuelos.length === 0) {
    return `<div class="results-placeholder"><span class="placeholder-icon">🔍</span>${t('no_flights')}</div>`;
  }

  const byRoute = {};
  data.vuelos.forEach(v => {
    if (!byRoute[v.ruta]) byRoute[v.ruta] = [];
    byRoute[v.ruta].push(v);
  });

  let html = `
    <div class="results-header">
      <span class="results-count">${t('flights_found', data.total_vuelos)}</span>
    </div>`;

  for (const [ruta, vuelos] of Object.entries(byRoute)) {
    vuelos.sort((a, b) => {
      const [da, ma, ya] = a.fecha.split('-').map(Number);
      const [db, mb, yb] = b.fecha.split('-').map(Number);
      const diff = new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
      return diff !== 0 ? diff : parsePrice(a.precio) - parsePrice(b.precio);
    });

    const first  = vuelos[0];
    const ori    = airportInfo(first.origen);
    const dst    = airportInfo(first.destino);
    const label  = `${ori.city} → ${dst.city}`;

    html += `
      <div class="route-section">
        <div class="route-header">
          <div class="route-header-left">
            <span class="route-header-main">${label}</span>
            <span class="route-header-sub">${first.origen} → ${first.destino}</span>
          </div>
          <span class="route-count-badge">${t('route_flights', vuelos.length)}</span>
        </div>
        <div class="flights-grid">`;

    vuelos.forEach(v => {
      const id         = flightId(v);
      const saved      = isSaved(v);
      const cheapClass = v.mas_barato ? ' card-cheapest' : '';
      const cheapBadge = v.mas_barato ? '<span class="cheapest-badge">✦ Mejor precio</span>' : '';
      const arrival    = v.adelanto_llegada ? `<sup class="next-day">${v.adelanto_llegada}</sup>` : '';
      const oriInfo    = airportInfo(v.origen);
      const dstInfo    = airportInfo(v.destino);

      html += `
        <div class="flight-card${cheapClass}">
          ${cheapBadge}
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
              <button class="save-btn${saved ? ' save-btn-active' : ''}" data-id="${id}" title="${saved ? 'Quitar de guardados' : 'Guardar vuelo'}">${saved ? '♥' : '♡'}</button>
            </div>
          </div>
        </div>`;
    });

    html += `</div></div>`;
  }

  return html;
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
function parseDateYMD(fechaStr) {
  // DD-MM-YYYY → Date (local)
  const [d, m, y] = fechaStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function parseDateInput(s) {
  // YYYY-MM-DD from <input type="date"> → Date (local, avoids UTC midnight offset bug)
  if (!s) return null;
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function durationMins(durStr) {
  // e.g. "2h 30m" or "1h" or "45m"
  const h = (durStr.match(/(\d+)h/) || [0,0])[1];
  const m = (durStr.match(/(\d+)m/) || [0,0])[1];
  return parseInt(h)*60 + parseInt(m);
}

function buildFilterBar(data) {
  // Collect distinct airlines and date bounds from raw data
  const airlines  = [...new Set(data.vuelos.map(v => v.aerolinea))].sort();
  const dests     = [...new Set(data.vuelos.map(v => v.destino))].sort().map(iata => ({ iata, city: airportInfo(iata).city }));
  const prices    = data.vuelos.map(v => parsePrice(v.precio));
  const maxPrice  = Math.ceil(Math.max(...prices) / 10) * 10;
  const dates     = data.vuelos.map(v => parseDateYMD(v.fecha));
  const minDate   = new Date(Math.min(...dates));
  const maxDate   = new Date(Math.max(...dates));

  function fmtDate(d) {
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  return `
    <div class="filter-bar" id="filterBar">
      <div class="filter-bar-top">
        <span class="filter-bar-title">${t('filter_title')}</span>
        <button type="button" class="filter-reset-btn" id="filterResetBtn">${t('filter_reset')}</button>
      </div>

      <div class="filter-section">
        <div class="filter-section-label">${t('filter_sec_dates')}</div>
        <div class="filter-row">
          <div class="filter-group">
            <label class="filter-label">${t('filter_from')}</label>
            <input type="date" class="filter-input" id="fDateFrom" value="${fmtDate(minDate)}" min="${fmtDate(minDate)}" max="${fmtDate(maxDate)}" />
          </div>
          <div class="filter-group">
            <label class="filter-label">${t('filter_to')}</label>
            <input type="date" class="filter-input" id="fDateTo" value="${fmtDate(maxDate)}" min="${fmtDate(minDate)}" max="${fmtDate(maxDate)}" />
          </div>
          <div class="filter-group filter-group-price">
            <label class="filter-label">${t('filter_max_price')} <span class="filter-price-val" id="fPriceVal">${maxPrice}€</span></label>
            <input type="range" class="filter-range" id="fPrice" min="0" max="${maxPrice}" value="${maxPrice}" step="5" />
          </div>
        </div>
      </div>

      <div class="filter-section">
        <div class="filter-section-label">${t('filter_sec_times')}</div>
        <div class="filter-row">
          <div class="filter-group filter-group-wide">
            <label class="filter-label">${t('filter_dep')} <span class="filter-time-val" id="fDepFromVal">00:00</span> – <span class="filter-time-val" id="fDepToVal">23:00</span></label>
            <div class="filter-dual-range">
              <input type="range" class="filter-range" id="fDepFrom" min="0" max="23" value="0" step="1" />
              <input type="range" class="filter-range" id="fDepTo" min="0" max="23" value="23" step="1" />
            </div>
          </div>
          <div class="filter-group filter-group-wide">
            <label class="filter-label">${t('filter_arr')} <span class="filter-time-val" id="fArrFromVal">00:00</span> – <span class="filter-time-val" id="fArrToVal">23:00</span></label>
            <div class="filter-dual-range">
              <input type="range" class="filter-range" id="fArrFrom" min="0" max="23" value="0" step="1" />
              <input type="range" class="filter-range" id="fArrTo" min="0" max="23" value="23" step="1" />
            </div>
          </div>
        </div>
        <div class="filter-row filter-row-days">
          <div class="filter-group filter-group-wide">
            <label class="filter-label">${t('filter_dep_days')}</label>
            <div class="filter-day-btns" id="fDepDays">
              ${[1,2,3,4,5,6,0].map(d => `<button type="button" class="filter-day-btn" data-day="${d}">${t('weekdays')[d]}</button>`).join('')}
            </div>
          </div>
          <div class="filter-group filter-group-wide">
            <label class="filter-label">${t('filter_arr_days')}</label>
            <div class="filter-day-btns" id="fArrDays">
              ${[1,2,3,4,5,6,0].map(d => `<button type="button" class="filter-day-btn" data-day="${d}">${t('weekdays')[d]}</button>`).join('')}
            </div>
          </div>
        </div>
      </div>

      <div class="filter-section">
        <div class="filter-section-label">${t('filter_sec_flight')}</div>
        <div class="filter-row filter-row-pills">
          <div class="filter-group filter-group-pills">
            <label class="filter-label">${t('filter_stops_label')}</label>
            <div class="filter-stops-row" id="fStops">
              <button type="button" class="filter-stop-btn active" data-val="">${t('filter_all')}</button>
              <button type="button" class="filter-stop-btn" data-val="0">${t('badge_direct')}</button>
              <button type="button" class="filter-stop-btn" data-val="1">1</button>
              <button type="button" class="filter-stop-btn" data-val="2">2+</button>
            </div>
          </div>
          <div class="filter-group">
            <label class="filter-label">${t('filter_airline')}</label>
            <select class="filter-select" id="fAirline">
              <option value="">${t('filter_all')}</option>
              ${airlines.map(a => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </div>
          <div class="filter-group">
            <label class="filter-label">${t('filter_sort')}</label>
            <select class="filter-select" id="fSort">
              <option value="date-asc">${t('sort_date_asc')}</option>
              <option value="date-desc">${t('sort_date_desc')}</option>
              <option value="price-asc">${t('sort_price_asc')}</option>
              <option value="price-desc">${t('sort_price_desc')}</option>
              <option value="duration-asc">${t('sort_dur_asc')}</option>
              <option value="stops-asc">${t('sort_stops_asc')}</option>
              <option value="dep-asc">${t('sort_dep_asc')}</option>
              <option value="dep-desc">${t('sort_dep_desc')}</option>
              <option value="arr-asc">${t('sort_arr_asc')}</option>
              <option value="arr-desc">${t('sort_arr_desc')}</option>
            </select>
          </div>
        </div>
        ${dests.length > 1 ? `
        <div class="filter-row filter-dest-row">
          <label class="filter-label">${t('filter_dest_label')}</label>
          <select id="fDest" class="filter-dest-select">
            <option value="">${t('filter_all_m')}</option>
            ${dests.map(d => `<option value="${d.iata}"${activeDestFilter===d.iata?' selected':''}>${d.iata} – ${d.city}</option>`).join('')}
          </select>
        </div>` : ''}
      </div>
    </div>`;
}

function buildReturnFilterBar(data) {
  const airlines = [...new Set(data.vuelos.map(v => v.aerolinea))].sort();
  const dests    = [...new Set(data.vuelos.map(v => v.destino))].sort().map(iata => ({ iata, city: airportInfo(iata).city }));
  const prices   = data.vuelos.map(v => parsePrice(v.precio));
  const maxPrice = Math.ceil(Math.max(...prices) / 10) * 10;
  const dates    = data.vuelos.map(v => parseDateYMD(v.fecha));
  const minDate  = new Date(Math.min(...dates));
  const maxDate  = new Date(Math.max(...dates));
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return `
    <div class="filter-bar" id="rFilterBar">
      <div class="filter-bar-top">
        <span class="filter-bar-title">${t('filter_return_title')}</span>
        <button type="button" class="filter-reset-btn" id="rFilterResetBtn">${t('filter_reset')}</button>
      </div>

      <div class="filter-section">
        <div class="filter-section-label">${t('filter_sec_dates')}</div>
        <div class="filter-row">
          <div class="filter-group">
            <label class="filter-label">${t('filter_from')}</label>
            <input type="date" class="filter-input" id="rfDateFrom" value="${fmt(minDate)}" min="${fmt(minDate)}" max="${fmt(maxDate)}" />
          </div>
          <div class="filter-group">
            <label class="filter-label">${t('filter_to')}</label>
            <input type="date" class="filter-input" id="rfDateTo" value="${fmt(maxDate)}" min="${fmt(minDate)}" max="${fmt(maxDate)}" />
          </div>
          <div class="filter-group filter-group-price">
            <label class="filter-label">${t('filter_max_price')} <span class="filter-price-val" id="rfPriceVal">${maxPrice}€</span></label>
            <input type="range" class="filter-range" id="rfPrice" min="0" max="${maxPrice}" value="${maxPrice}" step="5" />
          </div>
        </div>
      </div>

      <div class="filter-section">
        <div class="filter-section-label">${t('filter_sec_times')}</div>
        <div class="filter-row">
          <div class="filter-group filter-group-wide">
            <label class="filter-label">${t('filter_dep')} <span class="filter-time-val" id="rfDepFromVal">00:00</span> – <span class="filter-time-val" id="rfDepToVal">23:00</span></label>
            <div class="filter-dual-range">
              <input type="range" class="filter-range" id="rfDepFrom" min="0" max="23" value="0" step="1" />
              <input type="range" class="filter-range" id="rfDepTo" min="0" max="23" value="23" step="1" />
            </div>
          </div>
          <div class="filter-group filter-group-wide">
            <label class="filter-label">${t('filter_arr')} <span class="filter-time-val" id="rfArrFromVal">00:00</span> – <span class="filter-time-val" id="rfArrToVal">23:00</span></label>
            <div class="filter-dual-range">
              <input type="range" class="filter-range" id="rfArrFrom" min="0" max="23" value="0" step="1" />
              <input type="range" class="filter-range" id="rfArrTo" min="0" max="23" value="23" step="1" />
            </div>
          </div>
        </div>
      </div>

      <div class="filter-section">
        <div class="filter-section-label">${t('filter_sec_flight')}</div>
        <div class="filter-row filter-row-pills">
          <div class="filter-group filter-group-pills">
            <label class="filter-label">${t('filter_stops_label')}</label>
            <div class="filter-stops-row" id="rfStops">
              <button type="button" class="filter-stop-btn rfstop active" data-val="">${t('filter_all')}</button>
              <button type="button" class="filter-stop-btn rfstop" data-val="0">${t('badge_direct')}</button>
              <button type="button" class="filter-stop-btn rfstop" data-val="1">1</button>
              <button type="button" class="filter-stop-btn rfstop" data-val="2">2+</button>
            </div>
          </div>
          <div class="filter-group">
            <label class="filter-label">${t('filter_airline')}</label>
            <select class="filter-select" id="rfAirline">
              <option value="">${t('filter_all')}</option>
              ${airlines.map(a => `<option value="${a}">${a}</option>`).join('')}
            </select>
          </div>
          <div class="filter-group">
            <label class="filter-label">${t('filter_sort')}</label>
            <select class="filter-select" id="rfSort">
              <option value="date-asc">${t('sort_date_asc')}</option>
              <option value="date-desc">${t('sort_date_desc')}</option>
              <option value="price-asc">${t('sort_price_asc')}</option>
              <option value="price-desc">${t('sort_price_desc')}</option>
              <option value="duration-asc">${t('sort_dur_asc')}</option>
              <option value="stops-asc">${t('sort_stops_asc')}</option>
              <option value="dep-asc">${t('sort_dep_asc')}</option>
              <option value="dep-desc">${t('sort_dep_desc')}</option>
              <option value="arr-asc">${t('sort_arr_asc')}</option>
              <option value="arr-desc">${t('sort_arr_desc')}</option>
            </select>
          </div>
        </div>
        ${dests.length > 1 ? `
        <div class="filter-row" style="margin-top:0.5rem;align-items:center;gap:0.6rem">
          <label class="filter-label" style="margin:0;white-space:nowrap">${t('filter_dest_label')}</label>
          <select id="rfDest" class="filter-dest-select">
            <option value="">${t('filter_all_m')}</option>
            ${dests.map(d => `<option value="${d.iata}"${activeReturnDestFilter===d.iata?' selected':''}>${d.iata} – ${d.city}</option>`).join('')}
          </select>
        </div>` : ''}
      </div>
    </div>`;
}

function renderFlightCard(v, mode) {
  const id         = flightId(v);
  const saved      = isSaved(v);
  const cheapClass = v.mas_barato ? ' card-cheapest' : '';
  const cheapBadge = v.mas_barato ? `<span class="cheapest-badge">${t('badge_best')}</span>` : '';
  const arrival    = v.adelanto_llegada ? `<sup class="next-day">${v.adelanto_llegada}</sup>` : '';
  const oriInfo    = airportInfo(v.origen);
  const dstInfo    = airportInfo(v.destino);
  return `
    <div class="flight-card${cheapClass}">
      ${cheapBadge}
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
          ${mode === 'return'
            ? `<button class="select-return-btn" data-id="${id}" title="${t('btn_select_title')}">${t('btn_select_return')}</button>`
            : `<button class="return-btn" data-id="${id}" title="${t('btn_return_title')}">${t('btn_return_short')}</button>`
          }
          <button class="save-btn${saved ? ' save-btn-active' : ''}" data-id="${id}" title="${saved ? t('save_title_saved') : t('save_title_save')}">${saved ? '\u2665' : '\u2661'}</button>
        </div>
      </div>
    </div>`;
}

function renderResultsGridInner(data, mode = '', flatOrder = false, excluded = new Set()) {
  if (!data.vuelos || data.vuelos.length === 0) {
    return `<div class="results-placeholder" style="margin-top:1.5rem"><span class="placeholder-icon">🔍</span>${t('no_match_filters')}</div>`;
  }

  const byRoute = {};
  data.vuelos.forEach(v => {
    if (!byRoute[v.ruta]) byRoute[v.ruta] = [];
    byRoute[v.ruta].push(v);
  });

  const routes = Object.keys(byRoute);
  let html = '';

  // Route tabs (only when there are multiple routes)
  if (routes.length > 1) {
    html += `<div class="route-tabs">`;
    html += `<button class="route-tab" data-route="__flat__">${t('route_tab_all')} <span class="route-tab-count">${data.vuelos.length}</span></button>`;
    html += `<button class="route-tab" data-route="">${t('route_tab_all_dest')} <span class="route-tab-count">${data.vuelos.length}</span></button>`;
    routes.forEach(ruta => {
      const first = byRoute[ruta][0];
      const ori = airportInfo(first.origen);
      const dst = airportInfo(first.destino);
      html += `<button class="route-tab" data-route="${ruta}">${ori.city} → ${dst.city} <span class="route-tab-count">${byRoute[ruta].length}</span></button>`;
    });
    html += `</div>`;
  }

  // Flat mode: single section in globally-sorted order, filtering excluded routes
  if (flatOrder) {
    html += `<div class="route-section" data-route="__flat__"><div class="flights-grid">`;
    data.vuelos.forEach(v => {
      if (!excluded.has(v.ruta)) html += renderFlightCard(v, mode);
    });
    html += `</div></div>`;
    return html;
  }

  // Grouped mode: one section per route
  for (const [, vuelos] of Object.entries(byRoute)) {
    const first  = vuelos[0];
    const ori    = airportInfo(first.origen);
    const dst    = airportInfo(first.destino);
    const label  = `${ori.city} \u2192 ${dst.city}`;

    html += `
      <div class="route-section" data-route="${first.ruta}">
        <div class="route-header">
          <div class="route-header-left">
            <span class="route-header-main">${label}</span>
            <span class="route-header-sub">${first.origen} \u2192 ${first.destino}</span>
          </div>
          <span class="route-count-badge">${t('route_flights', vuelos.length)}</span>
        </div>
        <div class="flights-grid">`;

    vuelos.forEach(v => { html += renderFlightCard(v, mode); });

    html += `</div></div>`;
  }

  return html;
}
