/* ═══════════════════════════════════════════
   SAVED FLIGHTS
═══════════════════════════════════════════ */
const SAVED_KEY = 'flights_saved_v1';

function loadSaved() {
  try { return JSON.parse(localStorage.getItem(SAVED_KEY) || '[]'); }
  catch { return []; }
}

function persistSaved(list) {
  try {
    localStorage.setItem(SAVED_KEY, JSON.stringify(list));
  } catch (e) {
    alert(t('storage_full'));
  }
}

function flightId(v) {
  return `${v.fecha}|${v.origen}|${v.destino}|${timeOnly(v.salida)}|${v.aerolinea}`;
}

function isSaved(v) {
  return loadSaved().some(s => flightId(s) === flightId(v));
}

function toggleSave(v) {
  let list = loadSaved();
  const id = flightId(v);
  if (list.some(s => flightId(s) === id)) {
    list = list.filter(s => flightId(s) !== id);
  } else {
    list.push(v);
  }
  persistSaved(list);
  // Refresh save buttons in current results
  document.querySelectorAll('.save-btn').forEach(btn => {
    if (btn.dataset.id === id) {
      const saved = list.some(s => flightId(s) === id);
      btn.textContent = saved ? t('save_btn_saved') : t('save_btn_save');
      btn.classList.toggle('save-btn-active', saved);
    }
  });
  // Refresh saved tab if open
  if (!document.getElementById('tab-saved').classList.contains('hidden')) {
    renderSavedTab();
  }
}

function updateSavedCount() {
  const n = loadSaved().length;
  const el = document.getElementById('savedCount');
  if (el) el.textContent = n > 0 ? n : '';
}

function renderSavedTab() {
  if (typeof renderSavedExpressRoutes === 'function') renderSavedExpressRoutes();
  renderSavedSearches();
  const list = loadSaved();
  const container = document.getElementById('savedFlights');

  if (list.length === 0) {
    container.innerHTML = `
      <div class="results-placeholder">
        <span class="placeholder-icon">♥️</span>
        ${t('no_saved_flights')}<br/>
        <small>${t('no_saved_hint')}</small>
      </div>`;
    return;
  }

  // Group by route
  const byRoute = {};
  list.forEach(v => {
    if (!byRoute[v.ruta]) byRoute[v.ruta] = [];
    byRoute[v.ruta].push(v);
  });

  let html = `<div class="results-header"><span class="results-count">${t('saved_flights_count', list.length)}</span></div>`;

  for (const [ruta, vuelos] of Object.entries(byRoute)) {
    vuelos.sort((a, b) => {
      const [da, ma, ya] = a.fecha.split('-').map(Number);
      const [db, mb, yb] = b.fecha.split('-').map(Number);
      return new Date(ya, ma - 1, da) - new Date(yb, mb - 1, db);
    });
    html += `<div class="route-section"><div class="route-header"><div class="route-header-left"><span class="route-header-main">${ruta}</span></div></div><div class="flights-grid">`;
    vuelos.forEach(v => {
      const cheapClass  = v.mas_barato ? ' card-cheapest' : '';
      const cheapBadge  = v.mas_barato ? '<span class="cheapest-badge">✦ Mejor precio</span>' : '';
      const arrival     = v.adelanto_llegada ? `<sup class="next-day">${v.adelanto_llegada}</sup>` : '';
      const oriInfo     = airportInfo(v.origen);
      const dstInfo     = airportInfo(v.destino);
      const id          = flightId(v);
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
            <div class="card-price-block">
              <span class="card-price">${v.precio}</span>
            </div>
            <div class="card-footer-right">
              <button class="return-btn" data-id="${id}" title="${t('btn_return_title')}">${t('btn_return_short')}</button>
              <button class="refresh-btn" data-id="${id}" title="${t('refresh_btn_title')}">↻</button>
              <button class="save-btn save-btn-active" data-id="${id}" title="${t('save_title_saved')}">♥</button>
            </div>
          </div>
        </div>`;
    });
    html += `</div></div>`;
  }

  container.innerHTML = html;

  container.querySelectorAll('.save-btn').forEach(btn => {
    const id = btn.dataset.id;
    const v  = list.find(s => flightId(s) === id);
    if (v) btn.addEventListener('click', () => toggleSave(v));
  });

  container.querySelectorAll('.return-btn').forEach(btn => {
    const id = btn.dataset.id;
    const v  = list.find(s => flightId(s) === id);
    if (v) btn.addEventListener('click', () => openReturnModal(v));
  });

  container.querySelectorAll('.refresh-btn').forEach(btn => {
    const id = btn.dataset.id;
    const v  = list.find(s => flightId(s) === id);
    if (v) btn.addEventListener('click', () => refreshSavedFlight(v, btn));
  });
}

async function refreshSavedFlight(v, btn) {
  btn.disabled = true;
  btn.classList.add('refresh-loading');

  await ensureBackendAwake({ set textContent(msg) { btn.title = msg; } });

  const payload = {
    fecha:        v.fecha,
    origen:       v.origen,
    destino:      v.destino,
    salida:       timeOnly(v.salida),
    aerolinea:    v.aerolinea,
    escalas:      typeof v.escalas === 'number' ? v.escalas : 0,
  };

  try {
    const res = await fetch(`${API_BASE}/api/price`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const card    = btn.closest('.flight-card');
    const priceEl = card.querySelector('.card-price');

    let deltaEl = card.querySelector('.price-delta');
    if (!deltaEl) {
      deltaEl = document.createElement('span');
      deltaEl.className = 'price-delta';
      priceEl.insertAdjacentElement('afterend', deltaEl);
    }

    if (data.precio != null) {
      const oldP = parsePrice(v.precio);
      const newP = parsePrice(String(data.precio));
      const newPrecioStr = typeof data.precio === 'string' ? data.precio : `${data.precio} €`;
      if (newP < oldP) {
        deltaEl.className   = 'price-delta delta-down';
        deltaEl.textContent = `↓ ${newPrecioStr} (${t('refresh_price_was', v.precio)})`;
        priceEl.textContent = newPrecioStr;
        const list  = loadSaved();
        const id    = flightId(v);
        const entry = list.find(s => flightId(s) === id);
        if (entry) { entry.precio = newPrecioStr; persistSaved(list); }
      } else if (newP > oldP) {
        deltaEl.className   = 'price-delta delta-up';
        deltaEl.textContent = `↑ ${newPrecioStr} (${t('refresh_price_was', v.precio)})`;
        priceEl.textContent = newPrecioStr;
        const list  = loadSaved();
        const id    = flightId(v);
        const entry = list.find(s => flightId(s) === id);
        if (entry) { entry.precio = newPrecioStr; persistSaved(list); }
      } else {
        deltaEl.className   = 'price-delta delta-same';
        deltaEl.textContent = t('refresh_no_change');
      }
    } else {
      deltaEl.className   = 'price-delta delta-notfound';
      deltaEl.textContent = t('refresh_not_found');
    }
  } catch {
    btn.textContent = '⚠';
    setTimeout(() => { btn.textContent = '↻'; btn.disabled = false; btn.classList.remove('refresh-loading'); }, 2000);
    return;
  }

  btn.classList.remove('refresh-loading');
  btn.disabled = false;
}

// Init count on load
updateSavedCount();

/* ═══════════════════════════════════════════
   SAVED SEARCHES (snapshots)
═══════════════════════════════════════════ */
function loadSavedSearches() {
  try { return JSON.parse(localStorage.getItem('savedSearches') || '[]'); }
  catch { return []; }
}
function storeSavedSearches(list) {
  try {
    localStorage.setItem('savedSearches', JSON.stringify(list));
  } catch (e) {
    alert(t('storage_full'));
  }
}
function saveSearchSnapshot(data) {
  const list = loadSavedSearches();
  const id = Date.now().toString(36);
  const routes = (data.rutas || []).join(' · ');
  const savedAt = new Date().toLocaleString(t('locale_tag'), { dateStyle: 'short', timeStyle: 'short' });
  list.unshift({ id, name: routes, savedAt, total: data.total_vuelos, data });
  storeSavedSearches(list);
  return id;
}
function deleteSavedSearch(id) {
  storeSavedSearches(loadSavedSearches().filter(s => s.id !== id));
}
function renameSavedSearch(id, newName) {
  const list = loadSavedSearches();
  const entry = list.find(s => s.id === id);
  if (entry) { entry.name = newName; storeSavedSearches(list); }
}
function downloadResultsJSON(data) {
  const routes = (data.rutas || []).join('_').replace(/[^a-zA-Z0-9_\-]/g, '') || 'resultados';
  const date = new Date().toISOString().slice(0, 10);
  const filename = `flights_${routes}_${date}.json`;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function buildResultsHeader(data, elapsedMs) {
  const count = data.total_vuelos;
  const secs  = elapsedMs != null ? (elapsedMs / 1000).toFixed(1) : null;
  return `
    <div class="results-header">
      <span class="results-count">${secs != null ? t('flights_found_t', count, secs) : t('flights_found', count)}</span>
      <span class="results-routes">${(data.rutas || []).join(' \u00b7 ')}</span>
      <div class="results-header-actions">
        <button type="button" class="results-action-btn" id="btnSaveSearch">${t('btn_save_search')}</button>
        <button type="button" class="results-action-btn" id="btnDownloadJSON">${t('btn_download_json')}</button>
      </div>
    </div>`;
}
function bindResultsHeaderBtns(data) {
  document.getElementById('btnSaveSearch')?.addEventListener('click', () => {
    saveSearchSnapshot(data);
    const btn = document.getElementById('btnSaveSearch');
    if (btn) { btn.textContent = t('btn_save_done'); btn.disabled = true; }
    if (!document.getElementById('tab-saved').classList.contains('hidden')) renderSavedTab();
  });
  document.getElementById('btnDownloadJSON')?.addEventListener('click', () => {
    downloadResultsJSON(data);
  });
}
function loadSearchSnapshot(data) {
  lastResults = data;
  activeRoute = '__flat__';
  activeDestFilter = '';
  activeDayFilter = [];
  excludedRoutes.clear();
  const resultsEl = document.getElementById('results');
  const header = buildResultsHeader(data);
  resultsEl.innerHTML = header + buildFilterBar(data) + '<div id="resultsGrid">' + renderResultsGridInner(data, '', true) + '</div>';
  bindFilterBarEvents();
  bindResultsHeaderBtns(data);
  const resultsGrid = document.getElementById('resultsGrid');
  bindSaveBtns(resultsGrid, data.vuelos);
  bindReturnBtns(resultsGrid, data.vuelos);
  bindRouteTabs(resultsGrid, applyFiltersAndSort);
  document.getElementById('returnSection')?.remove();
  resultsEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
function renderSavedSearches() {
  const container = document.getElementById('savedSearches');
  if (!container) return;
  const list = loadSavedSearches();
  if (list.length === 0) { container.innerHTML = ''; return; }

  let html = `<div class="saved-searches-section">
    <div class="saved-searches-header">
      <span class="saved-searches-title">${t('saved_searches_title')}</span>
    </div>
    <div class="saved-searches-list">`;
  for (const s of list) {
    html += `
      <div class="saved-search-card" data-id="${s.id}">
        <div class="ss-info">
          <span class="ss-name" data-id="${s.id}" title="${t('ss_load_title')}">${s.name}</span>
          <span class="ss-meta">${t('ss_flights_count', s.total, s.savedAt)}</span>
        </div>
        <div class="ss-actions">
          <button class="ss-btn ss-restore" data-id="${s.id}">${t('ss_load')}</button>
          <button class="ss-btn ss-rename" data-id="${s.id}" title="${t('ss_rename')}">${t('ss_rename')}</button>
          <button class="ss-btn ss-dl" data-id="${s.id}">${t('btn_download_json')}</button>
          <button class="ss-btn ss-del" data-id="${s.id}">${t('ss_del')}</button>
        </div>
      </div>`;
  }
  html += `</div></div>`;
  container.innerHTML = html;

  container.querySelectorAll('.ss-restore').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = loadSavedSearches().find(s => s.id === btn.dataset.id);
      if (!entry) return;
      loadSearchSnapshot(entry.data);
      document.querySelector('[data-tab="search"]').click();
    });
  });
  // Click name = load (debounced to avoid triggering on double-click)
  container.querySelectorAll('.ss-name').forEach(nameEl => {
    nameEl.style.cursor = 'pointer';
    nameEl.addEventListener('click', () => {
      const entry = loadSavedSearches().find(s => s.id === nameEl.dataset.id);
      if (!entry) return;
      loadSearchSnapshot(entry.data);
      document.querySelector('[data-tab="search"]').click();
    });
  });
  // Pencil button = rename inline
  container.querySelectorAll('.ss-rename').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const card = container.querySelector(`.saved-search-card[data-id="${id}"]`);
      const nameEl = card?.querySelector('.ss-name');
      if (!nameEl) return;
      const current = nameEl.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'ss-rename-input';
      nameEl.replaceWith(input);
      btn.disabled = true;
      input.focus();
      input.select();
      let committed = false;
      const commit = () => {
        if (committed) return;
        committed = true;
        const newName = input.value.trim() || current;
        renameSavedSearch(id, newName);
        renderSavedSearches();
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
      const entry = loadSavedSearches().find(s => s.id === btn.dataset.id);
      if (entry) downloadResultsJSON(entry.data);
    });
  });
  container.querySelectorAll('.ss-del').forEach(btn => {
    btn.addEventListener('click', () => {
      deleteSavedSearch(btn.dataset.id);
      renderSavedSearches();
    });
  });
}

