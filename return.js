/* -------------------------------------------
   RETURN FLIGHT SEARCH
------------------------------------------- */
function showTripSummary(outbound, returnFlight) {
  document.getElementById('tripSummaryModal')?.remove();
  const oriInfo    = airportInfo(outbound.origen);
  const dstInfo    = airportInfo(outbound.destino);
  const totalPrice = parsePrice(outbound.precio) + parsePrice(returnFlight.precio);
  function flightBlock(v, label) {
    const ori = airportInfo(v.origen);
    const dst = airportInfo(v.destino);
    const arr = v.adelanto_llegada ? `<sup class="next-day">${v.adelanto_llegada}</sup>` : '';
    return `
      <div class="ts-leg">
        <div class="ts-leg-label">${label}</div>
        <div class="ts-card">
          <div class="ts-card-top"><span>${flightDateLabel(v.fecha)}</span><span class="ts-airline">${v.aerolinea}</span></div>
          <div class="ts-timeline">
            <div class="ts-endpoint"><span class="ts-time">${timeOnly(v.salida)}</span><span class="ts-iata">${v.origen}</span><span class="ts-city">${ori.city}</span></div>
            <div class="ts-mid"><div class="ts-duration">${v.duracion}</div><div class="ts-line"></div>${stopsLabel(v.escalas)}</div>
            <div class="ts-endpoint"><span class="ts-time">${timeOnly(v.llegada)}${arr}</span><span class="ts-iata">${v.destino}</span><span class="ts-city">${dst.city}</span></div>
          </div>
          <div class="ts-price">${v.precio}</div>
        </div>
      </div>`;
  }
  const modal = document.createElement('div');
  modal.id = 'tripSummaryModal';
  modal.className = 'return-modal-overlay';
  modal.innerHTML = `
    <div class="trip-summary-modal" role="dialog" aria-modal="true">
      <button type="button" class="return-modal-close" id="tsmClose">&times;</button>
      <div class="ts-header">
        <span class="ts-title">${t('ts_title')}</span>
        <span class="ts-route">${oriInfo.city} ⇄ ${dstInfo.city}</span>
      </div>
      <div class="ts-legs">
        ${flightBlock(outbound, t('ts_outbound'))}
        <div class="ts-legs-divider">⇅</div>
        ${flightBlock(returnFlight, t('ts_return_leg'))}
      </div>
      <div class="ts-total">
        <span class="ts-total-label">${t('ts_total')}</span>
        <span class="ts-total-price">${totalPrice.toFixed(2).replace('.', ',')} €</span>
      </div>
      <div class="ts-actions">
        <button type="button" class="ts-save-both" id="tsmSaveBoth">${t('ts_save_both')}</button>
        <button type="button" class="ts-close-btn" id="tsmCloseDone">${t('ts_close')}</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  document.getElementById('tsmClose').addEventListener('click', () => modal.remove());
  document.getElementById('tsmCloseDone').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.getElementById('tsmSaveBoth').addEventListener('click', () => {
    if (!isSaved(outbound))     toggleSave(outbound);
    if (!isSaved(returnFlight)) toggleSave(returnFlight);
    const btn = document.getElementById('tsmSaveBoth');
    btn.textContent = t('ts_saved_both');
    btn.disabled = true;
  });
}

function openReturnModal(flight) {
  document.getElementById('returnModal')?.remove();
  const modal = document.createElement('div');
  modal.id = 'returnModal';
  modal.className = 'return-modal-overlay';
  modal.innerHTML = `
    <div class="return-modal" role="dialog" aria-modal="true">
      <button type="button" class="return-modal-close" id="returnModalClose">&times;</button>
      <h3 class="return-modal-title">${t('rm_title')}</h3>
      <p class="return-modal-base">${t('rm_selected')} ${flightDateLabel(flight.fecha)} &nbsp;&bull;&nbsp; ${flight.salida} &rarr; ${flight.llegada} &nbsp;&bull;&nbsp; ${flight.aerolinea}</p>
      <div class="return-modal-airports">
        <div class="rm-airport-field">
          <label>${t('rm_from')}</label>
          <div class="airport-selector" id="rmSelectorFrom">
            <div class="airport-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false">
              <div class="airport-trigger-tokens" id="rmTagsFrom"></div>
              <input type="text" class="dropdown-search-input" placeholder="${t('trigger_ph')}" autocomplete="off" spellcheck="false" />
              <span class="airport-trigger-arrow">&#x25BE;</span>
            </div>
            <div class="airport-dropdown" role="listbox">
              <div class="dropdown-list"></div>
            </div>
          </div>
        </div>
        <div class="rm-airport-field">
          <label>${t('rm_to')}</label>
          <div class="airport-selector" id="rmSelectorTo">
            <div class="airport-trigger" role="combobox" aria-haspopup="listbox" aria-expanded="false">
              <div class="airport-trigger-tokens" id="rmTagsTo"></div>
              <input type="text" class="dropdown-search-input" placeholder="${t('trigger_ph')}" autocomplete="off" spellcheck="false" />
              <span class="airport-trigger-arrow">&#x25BE;</span>
            </div>
            <div class="airport-dropdown" role="listbox">
              <div class="dropdown-list"></div>
            </div>
          </div>
        </div>
      </div>
      <div class="return-modal-fields">
        <div class="return-modal-field">
          <label for="rmMinDays">${t('rm_min_days')}</label>
          <input type="number" id="rmMinDays" value="3" min="0" max="90" />
        </div>
        <div class="return-modal-field">
          <label for="rmMaxDays">${t('rm_max_days')}</label>
          <input type="number" id="rmMaxDays" value="7" min="0" max="90" />
        </div>
      </div>
      <button type="button" class="return-modal-search" id="returnModalSearch">${t('rm_search')}</button>
    </div>`;
  document.body.appendChild(modal);

  const rmFrom = createAirportSelector(document.getElementById('rmSelectorFrom'));
  rmFrom.setSelected([flight.destino]);
  const rmTo = createAirportSelector(document.getElementById('rmSelectorTo'));
  rmTo.setSelected([flight.origen]);

  document.getElementById('returnModalClose').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.getElementById('rmMinDays').addEventListener('change', () => {
    const min = Math.max(0, parseInt(document.getElementById('rmMinDays').value) || 0);
    const maxEl = document.getElementById('rmMaxDays');
    if (parseInt(maxEl.value) < min) maxEl.value = min;
  });
  document.getElementById('returnModalSearch').addEventListener('click', async () => {
    const fromAirports = rmFrom.getSelected();
    const toAirports   = rmTo.getSelected();
    if (fromAirports.length === 0 || toAirports.length === 0) {
      alert(t('rm_no_airports'));
      return;
    }
    const minDays = Math.max(0, parseInt(document.getElementById('rmMinDays').value) || 0);
    const maxDays = Math.max(minDays, parseInt(document.getElementById('rmMaxDays').value) || minDays);
    modal.remove();
    await searchReturn(flight, minDays, maxDays, fromAirports, toAirports);
  });
}

async function searchReturn(flight, minDays, maxDays, fromAirports, toAirports) {
  const base    = parseDateYMD(flight.fecha);
  const iniDate = new Date(base); iniDate.setDate(base.getDate() + minDays);
  const finDate = new Date(base); finDate.setDate(base.getDate() + maxDays);
  const toApiDate = d =>
    `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;

  const searchId = crypto.randomUUID();
  const payload = {
    search_id:    searchId,
    fecha_ini:    toApiDate(iniDate),
    fecha_fin:    toApiDate(finDate),
    airport_from: fromAirports,
    airport_to:   toAirports,
    max_stops:    parseInt(document.getElementById('maxStops')?.value ?? 1),
  };

  const resultsEl = document.getElementById('results');

  // If we're not on the search tab, switch to it before showing return results
  const searchTabBtn = document.querySelector('.tab-btn[data-tab="search"]');
  if (searchTabBtn && !searchTabBtn.classList.contains('active')) {
    searchTabBtn.click();
  }

  let returnSection = document.getElementById('returnSection');
  if (returnSection) returnSection.remove();
  returnSection = document.createElement('div');
  returnSection.id = 'returnSection';
  resultsEl.appendChild(returnSection);

  const fromLabel = fromAirports.length === 1 ? airportInfo(fromAirports[0]).city : fromAirports.join(', ');
  const toLabel   = toAirports.length   === 1 ? airportInfo(toAirports[0]).city   : toAirports.join(', ');
  const stayLabel = minDays === maxDays
    ? t('stay_days', minDays)
    : t('stay_range', minDays, maxDays);

  returnSection.innerHTML = `
    <div class="return-section-header">
      <span class="return-section-title">${t('rs_title', fromLabel, toLabel)}</span>
      <span class="return-section-sub">${t('rs_sub', flightDateLabel(flight.fecha), stayLabel)}</span>
      <button type="button" class="return-section-close" id="returnSectionClose">${t('rs_close')}</button>
    </div>
    ${renderSpinner([`${flight.destino} \u2192 ${flight.origen}`])}`;
  requestAnimationFrame(() => returnSection.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  document.getElementById('returnSectionClose')?.addEventListener('click', () => returnSection.remove());

  await ensureBackendAwake(returnSection.querySelector('#progressStatus'));

  // Poll /api/progress while return search runs
  const returnProgressInterval = setInterval(async () => {
    try {
      const r = await apiFetch(`${API_BASE}/api/progress?search_id=${searchId}`);
      if (!r.ok) return;
      const { percent, message } = await r.json();
      const fill   = returnSection.querySelector('#progressFill');
      const pct    = returnSection.querySelector('#progressPct');
      const status = returnSection.querySelector('#progressStatus');
      if (fill)   fill.style.width   = `${Math.min(Math.max(percent, 0), 100)}%`;
      if (pct)    pct.textContent    = `${Math.round(percent)}%`;
      if (status && message) status.textContent = message;
    } catch { /* ignore */ }
  }, 600);

  try {
    const res = await apiFetch(`${API_BASE}/api/search`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      returnSection.innerHTML += renderError(err.detail || `Error ${res.status}`);
      return;
    }
    const data = await res.json();
    lastReturnData = data;
    const header = `
      <div class="results-header">
        <span class="results-count">${t('flights_found', data.total_vuelos)}</span>
        <span class="results-routes">${data.rutas.join(' \u00b7 ')}</span>
      </div>`;
    returnSection.innerHTML = `
      <div class="return-section-header">
        <span class="return-section-title">${t('rs_title', fromLabel, toLabel)}</span>
        <span class="return-section-sub">${t('rs_sub', flightDateLabel(flight.fecha), stayLabel)}</span>
        <button type="button" class="return-section-close" id="returnSectionClose">${t('rs_close')}</button>
      </div>
      ${buildReturnFilterBar(data)}
      ${header}
      <div id="returnGrid">${renderResultsGridInner(data, 'return')}</div>`;
    document.getElementById('returnSectionClose')?.addEventListener('click', () => returnSection.remove());
    activeReturnRoute = '__flat__';
    bindReturnFilterBarEvents(flight);
    const returnGrid = document.getElementById('returnGrid');
    bindSaveBtns(returnGrid, data.vuelos);
    bindSelectReturnBtns(returnGrid, data.vuelos, flight);
    bindRouteTabs(returnGrid);
  } catch (err) {
    returnSection.innerHTML += renderError(t('conn_error'));
  } finally {
    clearInterval(returnProgressInterval);
  }
}
