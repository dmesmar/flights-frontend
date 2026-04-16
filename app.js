/* -------------------------------------------
   ENTRY POINT
   Depends on: airports.js, iata_routes.js,
               render.js, saved.js,
               filters.js, return.js
------------------------------------------- */
/* ═══════════════════════════════════════════
   DARK / LIGHT TOGGLE
═══════════════════════════════════════════ */
const themeToggle = document.getElementById('themeToggle');
const themeIcon   = document.getElementById('themeIcon');
const themeLabel  = document.getElementById('themeLabel');
const html        = document.documentElement;

function applyTheme(theme) {
  html.setAttribute('data-theme', theme);
  if (theme === 'dark') {
    themeIcon.textContent  = '🌙';
    themeLabel.textContent = t('theme_to_light');
  } else {
    themeIcon.textContent  = '☀️';
    themeLabel.textContent = t('theme_to_dark');
  }
  localStorage.setItem('theme', theme);
}

themeToggle.addEventListener('click', () => {
  const current = html.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

// Restore saved theme
const saved = localStorage.getItem('theme');
if (saved) applyTheme(saved);

/* ── Dev mode ── */
const devModeToggle = document.getElementById('devModeToggle');
const devModeLabel  = document.getElementById('devModeLabel');
const tabLogs       = document.getElementById('tabLogs');

function applyDevMode(active) {
  localStorage.setItem('devMode', active ? '1' : '0');
  tabLogs.style.display = active ? '' : 'none';
  devModeToggle.classList.toggle('dev-mode-active', active);
  devModeLabel.textContent = t(active ? 'devMode_label_active' : 'devMode_label');
  // If logs tab is active but dev mode turned off, switch to search
  if (!active && document.querySelector('.tab-btn[data-tab="logs"]')?.classList.contains('active')) {
    document.querySelector('.tab-btn[data-tab="search"]').click();
  }
}

devModeToggle.addEventListener('click', () => {
  const current = localStorage.getItem('devMode') === '1';
  applyDevMode(!current);
});

// Restore dev mode state
applyDevMode(localStorage.getItem('devMode') === '1');

/* ═══════════════════════════════════════════
   MAX STOPS TOGGLE
═══════════════════════════════════════════ */
const stopsRow      = document.getElementById('stopsRow');
const maxStopsInput = document.getElementById('maxStops');

stopsRow.addEventListener('click', (e) => {
  const btn = e.target.closest('.stop-btn');
  if (!btn) return;
  document.querySelectorAll('.stop-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  maxStopsInput.value = btn.dataset.value;
  if (btn.dataset.value === '0') {
    selectorFrom.clearDisallowed();
    selectorTo.clearDisallowed();
  }
  selectorFrom.refresh();
  selectorTo.refresh();
});


/* ── Country display helper ── */
function countryLabel(code) {
  return (COUNTRY_FLAGS[code] || '') + ' ' + (t('country_' + code) || code);
}

/* ═══════════════════════════════════════════
   AIRPORT SELECTOR FACTORY
═══════════════════════════════════════════ */
function createAirportSelector(selectorEl, tagsEl) {
  const trigger        = selectorEl.querySelector('.airport-trigger');
  const dropdown       = selectorEl.querySelector('.airport-dropdown');
  const searchInput    = selectorEl.querySelector('.dropdown-search-input');
  const list           = selectorEl.querySelector('.dropdown-list');
  const internalTagsEl = selectorEl.querySelector('.airport-trigger-tokens');
  const selected       = new Set();
  let getAllowedFn  = null;
  let onChangeCb   = null;

  function openDropdown() {
    dropdown.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    searchInput.value = '';
    renderList('');
    searchInput.focus();
  }

  function closeDropdown() {
    dropdown.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    searchInput.value = '';
  }

  function addCountry(airports) {
    airports.forEach(a => {
      const allowed = getAllowedFn ? getAllowedFn(a) : true;
      if (!selected.has(a.iata) && allowed) selected.add(a.iata);
    });
    renderTags();
    updateTriggerText();
    searchInput.value = '';
    renderList('');
    searchInput.focus();
    onChangeCb?.();
  }

  function renderList(query) {
    const q = query.trim().toLowerCase();
    const filtered = AIRPORTS.filter(a => {
      if (!q) return true;
      return (
        a.iata.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.city.toLowerCase().includes(q) ||
        a.country.toLowerCase().includes(q) ||
        countryLabel(a.country).toLowerCase().includes(q)
      );
    });

    list.innerHTML = '';
    if (filtered.length === 0) {
      list.innerHTML = `<div class="no-results">${t('no_results')}</div>`;
      return;
    }

    const byCountry = {};
    filtered.forEach(a => {
      if (!byCountry[a.country]) byCountry[a.country] = { name: countryLabel(a.country), airports: [] };
      byCountry[a.country].airports.push(a);
    });

    for (const group of Object.values(byCountry)) {
      const header = document.createElement('div');
      header.className = 'dropdown-country-header';
      header.innerHTML = `<span class="country-header-name">${group.name}</span>
        <div class="country-header-btns">
          <button type="button" class="country-select-all" title="${t('select_all')}">${t('select_all')}</button>
          <button type="button" class="country-deselect-all" title="${t('deselect_all')}">${t('deselect_all')}</button>
        </div>`;
      header.querySelector('.country-select-all').addEventListener('mousedown', (e) => {
        e.preventDefault();
        addCountry(group.airports);
      });
      header.querySelector('.country-deselect-all').addEventListener('mousedown', (e) => {
        e.preventDefault();
        group.airports.forEach(a => selected.delete(a.iata));
        renderTags();
        updateTriggerText();
        renderList(searchInput.value);
        onChangeCb?.();
      });
      list.appendChild(header);

      group.airports.forEach(a => {
        const allowed = getAllowedFn ? getAllowedFn(a) : true;
        const el = document.createElement('div');
        el.className = 'airport-option' + (selected.has(a.iata) ? ' selected' : '') + (allowed ? '' : ' no-route');
        el.setAttribute('role', 'option');
        el.setAttribute('tabindex', '-1');
        el.innerHTML = `<span class="iata">${a.iata}</span><span class="airport-city">${a.city}</span><span class="airport-name">${a.name}</span>${selected.has(a.iata) ? '<span class="option-check">\u2713</span>' : ''}`;
        el.addEventListener('mousedown', (e) => {
          e.preventDefault();
          if (!allowed) return;
          if (selected.has(a.iata)) {
            removeAirport(a.iata);
            renderList(searchInput.value);
          } else {
            addAirport(a);
          }
        });
        el.addEventListener('keydown', (e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            let next = el.nextElementSibling;
            while (next && !next.classList.contains('airport-option')) next = next.nextElementSibling;
            if (next) next.focus();
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            let prev = el.previousElementSibling;
            while (prev && !prev.classList.contains('airport-option')) prev = prev.previousElementSibling;
            if (prev) prev.focus(); else searchInput.focus();
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (!allowed) return;
            if (selected.has(a.iata)) {
              removeAirport(a.iata);
              renderList(searchInput.value);
            } else {
              addAirport(a);
            }
          } else if (e.key === 'Escape') {
            closeDropdown();
            trigger.focus();
          }
        });
        list.appendChild(el);
      });
    }
  }

  function addAirport(airport) {
    if (selected.has(airport.iata)) return;
    selected.add(airport.iata);
    renderTags();
    updateTriggerText();
    renderList(searchInput.value);
    searchInput.focus();
    onChangeCb?.();
  }

  function removeAirport(iata) {
    selected.delete(iata);
    renderTags();
    updateTriggerText();
    onChangeCb?.();
  }

  function updateTriggerText() {
    searchInput.placeholder = selected.size === 0 ? t('trigger_ph') : '';
  }

  function renderTags() {
    internalTagsEl.innerHTML = '';
    selected.forEach(iata => {
      const info = airportInfo(iata);
      const tag = document.createElement('div');
      tag.className = 'tag';
      tag.title = `${info.city} — ${countryLabel(info.country)}`;
      tag.innerHTML = `${iata}<button type="button" aria-label="${t('tag_remove_aria', iata)}">&times;</button>`;
      tag.querySelector('button').addEventListener('click', () => removeAirport(iata));
      internalTagsEl.appendChild(tag);
    });
  }

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.target.closest('.tag button')) return;
    openDropdown();
  });

  searchInput.addEventListener('focus', () => {
    if (!dropdown.classList.contains('open')) openDropdown();
  });

  searchInput.addEventListener('input', () => renderList(searchInput.value));

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDropdown(); trigger.focus(); }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const firstOption = list.querySelector('.airport-option:not(.no-route)');
      if (firstOption) firstOption.focus();
    }
  });

  // Prevent clicks inside dropdown from bubbling to document
  dropdown.addEventListener('mousedown', (e) => e.stopPropagation());

  document.addEventListener('click', (e) => {
    if (!selectorEl.contains(e.target)) closeDropdown();
  });

  // Close when focus leaves the whole selector (Tab, click elsewhere, etc.)
  selectorEl.addEventListener('focusout', (e) => {
    if (!selectorEl.contains(e.relatedTarget)) closeDropdown();
  });

  return {
    getSelected:     () => [...selected],
    setSelected:     (iataArray) => {
      selected.clear();
      iataArray.forEach(iata => { if (AIRPORTS.find(a => a.iata === iata)) selected.add(iata); });
      renderTags();
      updateTriggerText();
    },
    refresh:         () => renderList(searchInput.value),
    setGetAllowed:   (fn) => { getAllowedFn = fn; },
    setOnChange:     (fn) => { onChangeCb = fn; },
    clearDisallowed: () => {
      if (!getAllowedFn) return;
      const toRemove = AIRPORTS.filter(a => selected.has(a.iata) && !getAllowedFn(a));
      if (toRemove.length === 0) return;
      toRemove.forEach(a => selected.delete(a.iata));
      renderTags();
      updateTriggerText();
      renderList(searchInput.value);
      onChangeCb?.();
    },
  };
}

const selectorFrom = createAirportSelector(
  document.getElementById('selectorFrom'),
  document.getElementById('tagsFrom')
);
const selectorTo = createAirportSelector(
  document.getElementById('selectorTo'),
  document.getElementById('tagsTo')
);

/* ── IATA routes: determine which airports are selectable ── */
let iataRoutes = (typeof IATA_ROUTES !== 'undefined' && IATA_ROUTES) ? IATA_ROUTES : null;

function isDirectOnly() {
  return document.querySelector('.stop-btn.active')?.dataset.value === '0';
}

selectorFrom.setGetAllowed(() => true);

selectorTo.setGetAllowed(a => {
  if (!iataRoutes || !isDirectOnly()) return true;
  const froms = selectorFrom.getSelected();
  if (froms.length === 0)
    return Object.values(iataRoutes).some(dests => dests.includes(a.iata));
  return froms.some(f => (iataRoutes[f] || []).includes(a.iata));
});

selectorFrom.setOnChange(() => selectorTo.refresh());
selectorTo.setOnChange(() => selectorFrom.refresh());

const API_BASE = (!location.hostname || location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:8000'
  : 'https://flights-backend-t10m.onrender.com';

/* ═══════════════════════════════════════════
   TABS
═══════════════════════════════════════════ */
let logInterval = null;
let logPaused   = false;

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.remove('hidden');

    if (btn.dataset.tab === 'logs') {
      fetchLogs();
      if (!logInterval) logInterval = setInterval(fetchLogs, 2000);
    } else {
      clearInterval(logInterval);
      logInterval = null;
    }
    if (btn.dataset.tab === 'saved') {
      renderSavedTab();
    }
  });
});

/* ── Import JSON ── */
document.getElementById('btnImportJSON')?.addEventListener('click', () => {
  document.getElementById('importFileInput')?.click();
});
document.getElementById('importFileInput')?.addEventListener('change', (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.vuelos || !Array.isArray(data.vuelos)) throw new Error('Formato inválido');
      loadSearchSnapshot(data);
      document.querySelector('[data-tab="search"]').click();
    } catch {
      alert('El archivo no es un JSON de resultados válido.');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

/* ═══════════════════════════════════════════
   LOG VIEWER
═══════════════════════════════════════════ */
const logOutput      = document.getElementById('logOutput');
const logDot         = document.getElementById('logDot');
const logPauseBtn    = document.getElementById('logPauseBtn');
const logClearBtn    = document.getElementById('logClearBtn');
const logCopyBtn     = document.getElementById('logCopyBtn');
const logLevelSelect = document.getElementById('logLevelSelect');

const LEVEL_LABELS = { 0: 'SILENT', 1: 'ERROR', 2: 'INFO', 3: 'VERBOSE', 4: 'DEBUG' };

let renderedCount = 0;

logPauseBtn.addEventListener('click', () => {
  logPaused = !logPaused;
  logPauseBtn.textContent = t(logPaused ? 'log_resume' : 'log_pause');
  logDot.className = 'log-dot' + (logPaused ? ' paused' : ' connected');
});

logClearBtn.addEventListener('click', () => {
  logOutput.innerHTML = '';
  renderedCount = 0;
});

logCopyBtn.addEventListener('click', () => {
  const text = [...logOutput.querySelectorAll('.log-line')]
    .map(l => l.textContent.trim())
    .join('\n');
  navigator.clipboard.writeText(text).then(() => {
    logCopyBtn.textContent = t('log_copied');
    setTimeout(() => { logCopyBtn.textContent = t('log_copy'); }, 1500);
  });
});

logLevelSelect.addEventListener('change', async () => {
  const level = parseInt(logLevelSelect.value);
  try {
    await fetch(`${API_BASE}/api/log-level`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ level }),
    });
  } catch {
    // si falla, simplemente no se actualiza en el backend
  }
});

async function fetchLogs() {
  if (logPaused) return;
  try {
    const res  = await fetch(`${API_BASE}/api/logs`);
    if (!res.ok) { logDot.className = 'log-dot error'; return; }
    const data = await res.json();
    const logs = data.logs || [];

    logDot.className = 'log-dot connected';

    // Sync level selector with backend value
    if (data.log_level !== undefined) {
      logLevelSelect.value = String(data.log_level);
    }

    if (logs.length === renderedCount) return;

    const placeholder = logOutput.querySelector('.log-placeholder');
    if (placeholder) placeholder.remove();

    const atBottom = logOutput.scrollHeight - logOutput.scrollTop - logOutput.clientHeight < 40;

    const newLogs = logs.slice(renderedCount);
    newLogs.forEach(entry => {
      const numLevel  = entry.level;   // integer: 1, 2, 3…
      const labelText = LEVEL_LABELS[numLevel] || String(numLevel);
      const line = document.createElement('div');
      line.className = `log-line level-num-${numLevel}`;
      line.innerHTML =
        `<span class="log-ts">${escapeHtml(entry.ts)}</span>` +
        `<span class="log-level">${labelText}</span>` +
        `<span class="log-msg">${escapeHtml(entry.msg)}</span>`;
      logOutput.appendChild(line);
    });
    renderedCount = logs.length;

    if (atBottom) logOutput.scrollTop = logOutput.scrollHeight;

  } catch {
    logDot.className = 'log-dot error';
  }
}

/* ─────────────────────────────────────────
   BACKEND WAKEUP (Render free-tier cold start)
   Pings /api/ping; if it takes >1 s shows a
   warning message in `statusEl` (a DOM element
   whose textContent can be updated).
   Returns once the backend is up (or after
   a 35 s timeout).
───────────────────────────────────────── */
async function ensureBackendAwake(statusEl) {
  // Only bother on production (not localhost)
  if (!location.hostname || location.hostname === 'localhost' || location.hostname === '127.0.0.1') return;

  let wakeupShown = false;
  const wakeupTimer = setTimeout(() => {
    wakeupShown = true;
    if (statusEl) statusEl.textContent = t('wakeup_msg');
  }, 1000);

  try {
    await Promise.race([
      fetch(`${API_BASE}/api/ping`).then(r => { if (!r.ok) throw new Error(); }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 35000)),
    ]);
  } catch {
    // If ping fails we let the real request fail naturally
  } finally {
    clearTimeout(wakeupTimer);
    if (wakeupShown && statusEl) statusEl.textContent = t('spinner_init');
  }
}

document.getElementById('searchForm').addEventListener('submit', async (e) => {
  e.preventDefault();

  const fechaIni = document.getElementById('fechaIni').value;
  const fechaFin = document.getElementById('fechaFin').value;
  const from     = selectorFrom.getSelected();
  const to       = selectorTo.getSelected();
  const stops    = maxStopsInput.value;

  if (!fechaIni || !fechaFin) {
    alert(t('alert_dates'));
    return;
  }
  if (from.length === 0) {
    alert(t('alert_origin'));
    return;
  }
  if (to.length === 0) {
    alert(t('alert_dest'));
    return;
  }

  const payload = {
    fecha_ini:    fechaIni.split('-').reverse().join('-'),
    fecha_fin:    fechaFin.split('-').reverse().join('-'),
    airport_from: from,
    airport_to:   to,
    max_stops:    parseInt(stops),
    max_results:  parseInt(document.getElementById('maxResults')?.value || '3'),
  };

  const resultsEl  = document.getElementById('results');
  const submitBtn  = document.querySelector('.btn-search');

  // Rutas estimadas para el spinner
  const rutasEstimadas = from.flatMap(f => to.map(t => `${f} → ${t}`));
  resultsEl.innerHTML  = renderSpinner(rutasEstimadas);
  submitBtn.disabled   = true;
  submitBtn.textContent = t('btn_searching');

  await ensureBackendAwake(document.getElementById('progressStatus'));

  // Elapsed time timer
  const searchStart = Date.now();
  const timerInterval = setInterval(() => {
    const el = document.getElementById('spinnerTimer');
    if (el) el.textContent = Math.floor((Date.now() - searchStart) / 1000) + ' s';
  }, 1000);

  // Poll /api/progress while search runs
  const progressInterval = setInterval(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/progress`);
      if (!r.ok) return;
      const { percent, message } = await r.json();
      const fill   = document.getElementById('progressFill');
      const pct    = document.getElementById('progressPct');
      const status = document.getElementById('progressStatus');
      const eta    = document.getElementById('spinnerEta');
      if (fill)   fill.style.width   = `${Math.min(Math.max(percent, 0), 100)}%`;
      if (pct)    pct.textContent    = `${Math.round(percent)}%`;
      if (status && message) status.textContent = message;
      if (eta && percent > 5) {
        const elapsed = (Date.now() - searchStart) / 1000;
        const remaining = Math.round(elapsed / percent * (100 - percent));
        eta.textContent = t('spinner_remaining', remaining);
      }
    } catch { /* backend not ready yet */ }
  }, 600);

  try {
    const res = await fetch(`${API_BASE}/api/search`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      const msg = err.detail || `Error ${res.status}`;
      resultsEl.innerHTML = renderError(msg);
      return;
    }

    const data = await res.json();
    lastResults = data;
    const elapsedMs = Date.now() - searchStart;

    // Capture selected days and pre-filter display data
    activeDayFilter = [...document.querySelectorAll('#dayBtnsRow .day-btn.active')].map(b => parseInt(b.dataset.day));
    const displayData = activeDayFilter.length
      ? { ...data, vuelos: filterByDays(data.vuelos), total_vuelos: filterByDays(data.vuelos).length }
      : data;

    const header = buildResultsHeader(displayData, elapsedMs);
    activeRoute = '__flat__';
    activeDestFilter = '';
    excludedRoutes.clear();
    resultsEl.innerHTML = header + buildFilterBar(displayData) + '<div id="resultsGrid">' + renderResultsGridInner(displayData, '', true) + '</div>';
    bindFilterBarEvents();
    bindResultsHeaderBtns(data);
    const resultsGrid = document.getElementById('resultsGrid');
    bindSaveBtns(resultsGrid, displayData.vuelos);
    bindReturnBtns(resultsGrid, displayData.vuelos);
    bindRouteTabs(resultsGrid, applyFiltersAndSort);
    // Remove any stale return section from previous search
    document.getElementById('returnSection')?.remove();

  } catch (err) {
    resultsEl.innerHTML = renderError(t('conn_error_full', API_BASE));
  } finally {
    clearInterval(progressInterval);
    clearInterval(timerInterval);
    submitBtn.disabled   = false;
    submitBtn.textContent = t('btn_search');
  }
});

/* ═══════════════════════════════════════════
   LANGUAGE CHANGE — refresh dynamic elements
═══════════════════════════════════════════ */
onLangChange(() => {
  // Theme label
  const theme = html.getAttribute('data-theme');
  themeLabel.textContent = t(theme === 'dark' ? 'theme_to_light' : 'theme_to_dark');

  // Dev mode label
  const devActive = localStorage.getItem('devMode') === '1';
  devModeLabel.textContent = t(devActive ? 'devMode_label_active' : 'devMode_label');

  // Log pause button
  logPauseBtn.textContent = t(logPaused ? 'log_resume' : 'log_pause');

  // Airport selector trigger text and open dropdown
  selectorFrom.refresh();
  selectorTo.refresh();

  // Saved tab
  if (!document.getElementById('tab-saved').classList.contains('hidden')) {
    renderSavedTab();
  }
});
