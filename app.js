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

/* ── Simple Search Mode ── */
let simpleSearchMode = true; // default ON — hides the map in airport dropdowns

function setSimpleSearchMode(val) {
  simpleSearchMode = val;
  // Persist
  try { localStorage.setItem('simpleSearchMode', val ? '1' : '0'); } catch(e) {}
}

// Restore from localStorage
try {
  const stored = localStorage.getItem('simpleSearchMode');
  if (stored !== null) simpleSearchMode = stored !== '0';
} catch(e) {}

/* ── Scroll-to-top button ── */
const scrollTopBtn = document.getElementById('scrollTopBtn');
window.addEventListener('scroll', () => {
  scrollTopBtn.classList.toggle('visible', window.scrollY > 300);
}, { passive: true });
scrollTopBtn.addEventListener('click', () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

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

const IS_LOCAL = location.hostname === 'localhost' || location.hostname === '127.0.0.1' || !location.hostname;

function applyDevMode(active) {
  localStorage.setItem('devMode', active ? '1' : '0');
  tabLogs.style.display = (active && IS_LOCAL) ? '' : 'none';
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


/* ═══════════════════════════════════════════
   DATE PRESETS
═══════════════════════════════════════════ */
function _toYMD(d) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function applyDatePreset(preset, iniId, finId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dow = today.getDay(); // 0=Sun … 6=Sat
  let start, end;

  switch (preset) {
    case 'this-weekend': {
      // Nearest Friday (if already past the weekend, show this Fri-Sun)
      let fri = new Date(today);
      if (dow === 6) fri.setDate(today.getDate() - 1);       // Sat → prev Fri
      else if (dow === 0) fri.setDate(today.getDate() - 2);  // Sun → prev Fri
      else fri.setDate(today.getDate() + (5 - dow));          // Mon-Fri → coming Fri
      start = fri;
      end = new Date(fri); end.setDate(fri.getDate() + 2);   // Sun
      break;
    }
    case 'next-weekend': {
      let fri = new Date(today);
      if (dow === 6) fri.setDate(today.getDate() + 6);       // Sat → next Fri
      else if (dow === 0) fri.setDate(today.getDate() + 5);  // Sun → next Fri
      else fri.setDate(today.getDate() + (5 - dow) + 7);     // Mon-Fri → next Fri
      start = fri;
      end = new Date(fri); end.setDate(fri.getDate() + 2);
      break;
    }
    case 'this-month': {
      start = new Date(today);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0); // last day of current month
      break;
    }
    case 'next-month': {
      start = new Date(today.getFullYear(), today.getMonth() + 1, 1);
      end   = new Date(today.getFullYear(), today.getMonth() + 2, 0);
      break;
    }
    case 'next-2weeks': {
      start = new Date(today);
      end = new Date(today); end.setDate(today.getDate() + 13);
      break;
    }
    case 'next-4weeks': {
      start = new Date(today);
      end = new Date(today); end.setDate(today.getDate() + 27);
      break;
    }
    case 'next-2months': {
      start = new Date(today);
      end   = new Date(today.getFullYear(), today.getMonth() + 2, today.getDate());
      break;
    }
    case 'next-3months': {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end   = new Date(today.getFullYear(), today.getMonth() + 3, 1);
      break;
    }
    default: return;
  }

  document.getElementById(iniId).value = _toYMD(start);
  document.getElementById(finId).value = _toYMD(end);
}

function setupDatePresets(containerId, iniId, finId) {
  const container      = document.getElementById(containerId);
  if (!container) return;
  const rangePicker    = container.querySelector('.month-picker-wrap:not(.single-month-wrap)');
  const singlePicker   = container.querySelector('.single-month-wrap');
  const yearFromSel    = container.querySelector('.year-from-sel');
  const monthFromSel   = container.querySelector('.month-from-sel');
  const yearToSel      = container.querySelector('.year-to-sel');
  const monthToSel     = container.querySelector('.month-to-sel');
  const yearSingleSel  = container.querySelector('.year-single-sel');
  const monthSingleSel = container.querySelector('.month-single-sel');

  const MONTH_NAMES_ES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
  const MONTH_NAMES_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  function buildYearOptions(sel, defaultYear) {
    const cur = sel.value ? parseInt(sel.value) : defaultYear;
    const now = new Date().getFullYear();
    sel.innerHTML = '';
    for (let y = now; y <= now + 2; y++) {
      const opt = document.createElement('option');
      opt.value = y; opt.textContent = y;
      if (y === cur) opt.selected = true;
      sel.appendChild(opt);
    }
  }

  function buildMonthOptions(sel, defaultMonth) {
    const names = (typeof currentLang !== 'undefined' && currentLang === 'en') ? MONTH_NAMES_EN : MONTH_NAMES_ES;
    const cur = sel.value ? parseInt(sel.value) : defaultMonth;
    sel.innerHTML = '';
    names.forEach((name, i) => {
      const opt = document.createElement('option');
      opt.value = i + 1; opt.textContent = name;
      if (i + 1 === cur) opt.selected = true;
      sel.appendChild(opt);
    });
  }

  function fillSelects() {
    const now = new Date();
    if (yearFromSel)    buildYearOptions(yearFromSel,    now.getFullYear());
    if (yearToSel)      buildYearOptions(yearToSel,      now.getFullYear());
    if (monthFromSel)   buildMonthOptions(monthFromSel,  now.getMonth() + 1);
    if (monthToSel)     buildMonthOptions(monthToSel,    now.getMonth() + 1);
    if (yearSingleSel)  buildYearOptions(yearSingleSel,  now.getFullYear());
    if (monthSingleSel) buildMonthOptions(monthSingleSel, now.getMonth() + 1);
  }

  function applyRangePicker() {
    const yearFrom  = parseInt(yearFromSel.value);
    const monthFrom = parseInt(monthFromSel.value);
    const yearTo    = parseInt(yearToSel.value);
    const monthTo   = parseInt(monthToSel.value);
    const tsFrom = yearFrom * 12 + monthFrom;
    const tsTo   = yearTo   * 12 + monthTo;
    const [yS, mS, yE, mE] = tsFrom <= tsTo
      ? [yearFrom, monthFrom, yearTo, monthTo]
      : [yearTo,   monthTo,   yearFrom, monthFrom];
    document.getElementById(iniId).value = _toYMD(new Date(yS, mS - 1, 1));
    document.getElementById(finId).value = _toYMD(new Date(yE, mE, 0));
  }

  function applySinglePicker() {
    const year  = parseInt(yearSingleSel.value);
    const month = parseInt(monthSingleSel.value);
    document.getElementById(iniId).value = _toYMD(new Date(year, month - 1, 1));
    document.getElementById(finId).value = _toYMD(new Date(year, month, 0));
  }

  function closeAll() {
    rangePicker?.classList.remove('open');
    singlePicker?.classList.remove('open');
    container.querySelectorAll('.date-preset-fullmonth, .date-preset-singlemonth').forEach(b => b.classList.remove('active'));
  }

  fillSelects();
  if (typeof onLangChange === 'function') onLangChange(fillSelects);
  if (yearFromSel && monthFromSel && yearToSel && monthToSel)
    [yearFromSel, monthFromSel, yearToSel, monthToSel].forEach(s => s.addEventListener('change', applyRangePicker));
  if (yearSingleSel && monthSingleSel)
    [yearSingleSel, monthSingleSel].forEach(s => s.addEventListener('change', applySinglePicker));

  container.querySelectorAll('.date-preset-btn').forEach(btn => {
    if (btn.classList.contains('date-preset-singlemonth')) {
      btn.addEventListener('click', () => {
        const opening = !singlePicker?.classList.contains('open');
        closeAll();
        if (opening) { singlePicker?.classList.add('open'); btn.classList.add('active'); yearSingleSel?.focus(); }
      });
    } else if (btn.classList.contains('date-preset-fullmonth')) {
      btn.addEventListener('click', () => {
        const opening = !rangePicker?.classList.contains('open');
        closeAll();
        if (opening) { rangePicker?.classList.add('open'); btn.classList.add('active'); yearFromSel?.focus(); }
      });
    } else {
      btn.addEventListener('click', () => {
        closeAll();
        container.querySelectorAll('.date-preset-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyDatePreset(btn.dataset.preset, iniId, finId);
      });
    }
  });
}

setupDatePresets('datePresets', 'fechaIni', 'fechaFin');

/* ── Country display helper ── */
function countryLabel(code) {
  return (COUNTRY_FLAGS[code] || '') + ' ' + (t('country_' + code) || code);
}

/* ═══════════════════════════════════════════
   CONTINENT MAPS — pre-processed SVG paths from files/continents-map.js
   Each path has data-country="XX" (ISO 3166-1 alpha-2).
═══════════════════════════════════════════ */
const _continentDocs = {};
if (typeof CONTINENT_MAPS !== 'undefined') {
  for (const def of CONTINENT_MAPS) {
    try {
      _continentDocs[def.id] = new DOMParser().parseFromString(def.svgStr, 'image/svg+xml');
    } catch (_) {}
  }
}

/* ═══════════════════════════════════════════
   AIRPORT SELECTOR FACTORY
═══════════════════════════════════════════ */
function createAirportSelector(selectorEl, tagsEl, { forceSimple = false } = {}) {
  const trigger        = selectorEl.querySelector('.airport-trigger');
  const dropdown       = selectorEl.querySelector('.airport-dropdown');
  const searchInput    = selectorEl.querySelector('.dropdown-search-input');
  const list           = selectorEl.querySelector('.dropdown-list');
  const internalTagsEl = selectorEl.querySelector('.airport-trigger-tokens');
  const selected       = new Set();
  let getAllowedFn  = null;
  let onChangeCb   = null;
  let activeContinent = (typeof CONTINENT_MAPS !== 'undefined' && CONTINENT_MAPS[0]?.id) || 'EU';
  let activeCountry = null; // currently highlighted country on map

  // Build the two-panel map UI inside dropdown
  const mapBody = document.createElement('div');
  mapBody.className = 'map-dropdown-body';

  // Left: SVG map
  const mapPanel = document.createElement('div');
  mapPanel.className = 'map-panel';

  const countriesWithAirports = new Set(AIRPORTS.map(a => a.country));

  // Map panels — rendered from CONTINENT_MAPS constant
  let injectedSvgEl = null;
  let mapInjected = null; // continent id currently rendered, or null

  function renderContinent(id) {
    if (mapInjected === id) return;
    mapInjected = id;
    activeContinent = id;
    activeCountry = null;

    // Update continent bar active state
    continentBar.querySelectorAll('.map-continent-btn')
      .forEach(b => b.classList.toggle('active', b.dataset.continent === id));

    // Swap SVG
    if (injectedSvgEl) injectedSvgEl.remove();
    injectedSvgEl = null;
    mapPanel.innerHTML = '';

    const doc = _continentDocs[id];
    if (!doc) {
      mapPanel.innerHTML = '<div class="map-airport-placeholder">Map unavailable</div>';
      return;
    }

    const svgEl = document.importNode(doc.documentElement, true);
    svgEl.setAttribute('class', 'map-svg');
    svgEl.setAttribute('aria-hidden', 'true');
    svgEl.removeAttribute('width');
    svgEl.removeAttribute('height');

    for (const path of svgEl.querySelectorAll('path')) {
      const cc = path.getAttribute('data-country');
      if (cc) {
        path.setAttribute('class', 'map-country');
        if (countriesWithAirports.has(cc)) {
          path.classList.add('has-airports');
          path.setAttribute('tabindex', '0');
          path.setAttribute('role', 'button');
          path.setAttribute('aria-label', countryLabel(cc));
          path.addEventListener('click', () => selectMapCountry(cc));
          path.addEventListener('keydown', ev => {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); selectMapCountry(cc); }
          });
        } else {
          path.classList.add('no-airports');
        }
      } else {
        path.setAttribute('class', 'map-bg-path');
      }
    }

    injectedSvgEl = svgEl;
    mapPanel.appendChild(svgEl);

    // ── Zoom / pan ──────────────────────────────────────────
    const vbArr = svgEl.getAttribute('viewBox').trim().split(/[\s,]+/).map(Number);
    let vpX = vbArr[0], vpY = vbArr[1], vpW = vbArr[2], vpH = vbArr[3];
    const vpBaseW = vpW, vpBaseH = vpH;
    let panStart = null; // {x, y, vx, vy, id}
    let didPan = false;
    const PAN_THRESHOLD = 4; // px before committing to a drag

    function applyVB() {
      svgEl.setAttribute('viewBox', `${vpX} ${vpY} ${vpW} ${vpH}`);
    }

    // Scroll-wheel zoom (zoom toward cursor)
    svgEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 1.2 : 1 / 1.2;
      const rect = svgEl.getBoundingClientRect();
      const mx = vpX + (e.clientX - rect.left) / rect.width  * vpW;
      const my = vpY + (e.clientY - rect.top)  / rect.height * vpH;
      const newW = Math.max(vpBaseW * 0.08, Math.min(vpBaseW * 3, vpW * factor));
      const newH = Math.max(vpBaseH * 0.08, Math.min(vpBaseH * 3, vpH * factor));
      vpX = mx - (e.clientX - rect.left) / rect.width  * newW;
      vpY = my - (e.clientY - rect.top)  / rect.height * newH;
      vpW = newW; vpH = newH;
      applyVB();
    }, { passive: false });

    // Drag-to-pan: works from any part of the map.
    // Pointer capture is deferred until the threshold is exceeded so that
    // a simple click still fires the country's click handler normally.
    svgEl.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return; // only primary button / touch
      panStart = { x: e.clientX, y: e.clientY, vx: vpX, vy: vpY, id: e.pointerId };
      didPan = false;
    });

    svgEl.addEventListener('pointermove', (e) => {
      if (!panStart || e.pointerId !== panStart.id) return;
      const dx = e.clientX - panStart.x;
      const dy = e.clientY - panStart.y;
      if (!didPan) {
        if (Math.hypot(dx, dy) < PAN_THRESHOLD) return;
        didPan = true;
        // Capture only after threshold — pure clicks propagate normally
        svgEl.setPointerCapture(e.pointerId);
        svgEl.style.cursor = 'grabbing';
      }
      const rect = svgEl.getBoundingClientRect();
      vpX = panStart.vx - dx / rect.width  * vpW;
      vpY = panStart.vy - dy / rect.height * vpH;
      applyVB();
    });

    const endPan = (e) => {
      if (!panStart || e.pointerId !== panStart.id) return;
      panStart = null;
      svgEl.style.cursor = '';
    };
    svgEl.addEventListener('pointerup',     endPan);
    svgEl.addEventListener('pointercancel', (e) => { endPan(e); didPan = false; });

    // Suppress the click event that fires right after a pan drag so that
    // releasing the mouse over a country doesn't select it unintentionally.
    svgEl.addEventListener('click', (e) => {
      if (didPan) { didPan = false; e.stopImmediatePropagation(); }
    }, true /* capture phase, before path listeners */);

    // Double-click ocean / no-airports → reset zoom
    svgEl.addEventListener('dblclick', (e) => {
      if (!e.target.classList.contains('has-airports')) {
        vpX = vbArr[0]; vpY = vbArr[1]; vpW = vpBaseW; vpH = vpBaseH;
        applyVB();
      }
    });
    // ────────────────────────────────────────────────────────

    // Show all airports in this continent
    const def = typeof CONTINENT_MAPS !== 'undefined' ? CONTINENT_MAPS.find(c => c.id === id) : null;
    const title = apHeader.querySelector('.map-airports-title');
    if (title) title.textContent = t('continent_' + id) || def?.label_es || id;
    apHeader.querySelector('.map-airports-header-btns').innerHTML = '';
    apSearchWrap.style.display = '';
    apSearchInput.value = '';
    apSearchInput.oninput = () => renderContinentAirports(activeContinent, apSearchInput.value);
    renderContinentAirports(id, '');
  }

  function switchContinent(id) {
    mapInjected = null; // force re-render
    renderContinent(id);
  }

  // Right: airports panel
  const airportsPanel = document.createElement('div');
  airportsPanel.className = 'map-airports-panel';

  const apHeader = document.createElement('div');
  apHeader.className = 'map-airports-header';
  apHeader.innerHTML = `<span class="map-airports-title" data-i18n="map_pick_country">${t('map_pick_country') || 'Elige un país'}</span>
    <div class="map-airports-header-btns"></div>`;
  airportsPanel.appendChild(apHeader);

  const apSearchWrap = document.createElement('div');
  apSearchWrap.className = 'map-search-wrap';
  const apSearchInput = document.createElement('input');
  apSearchInput.type = 'text';
  apSearchInput.className = 'map-search-input';
  apSearchInput.placeholder = t('map_search_placeholder') || 'Buscar aeropuerto…';
  apSearchInput.autocomplete = 'off';
  apSearchInput.spellcheck = false;
  apSearchWrap.appendChild(apSearchInput);
  apSearchWrap.style.display = 'none';
  airportsPanel.appendChild(apSearchWrap);

  const apList = document.createElement('div');
  apList.className = 'map-airports-list dropdown-list';
  apList.innerHTML = `<div class="map-airport-placeholder">${t('map_pick_country') || 'Elige un país en el mapa'}</div>`;
  airportsPanel.appendChild(apList);

  // Continent selector bar
  const continentBar = document.createElement('div');
  continentBar.className = 'map-continent-bar';
  if (typeof CONTINENT_MAPS !== 'undefined') {
    for (const def of CONTINENT_MAPS) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'map-continent-btn' + (def.id === activeContinent ? ' active' : '');
      btn.dataset.continent = def.id;
      btn.textContent = t('continent_' + def.id) || def.label_es;
      btn.addEventListener('click', () => switchContinent(def.id));
      continentBar.appendChild(btn);
    }
  }

  mapBody.appendChild(mapPanel);

  // ── Resizable splitter ────────────────────────────────────
  const splitter = document.createElement('div');
  splitter.className = 'map-splitter';
  splitter.setAttribute('aria-hidden', 'true');

  (function initSplitter() {
    let dragging = false;
    let startX = 0;
    let startMapW = 0;
    let startAirW = 0;

    splitter.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      startX = e.clientX;
      startMapW = mapPanel.getBoundingClientRect().width;
      startAirW = airportsPanel.getBoundingClientRect().width;
      splitter.classList.add('dragging');
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const totalW = startMapW + startAirW;
      const minPct = 0.25;
      const maxPct = 0.80;
      let newMapW = Math.max(totalW * minPct, Math.min(totalW * maxPct, startMapW + dx));
      let newAirW = totalW - newMapW;
      mapPanel.style.flex = 'none';
      mapPanel.style.width = newMapW + 'px';
      airportsPanel.style.flex = 'none';
      airportsPanel.style.width = newAirW + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (!dragging) return;
      dragging = false;
      splitter.classList.remove('dragging');
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });
  })();
  // ──────────────────────────────────────────────────────────

  mapBody.appendChild(splitter);
  mapBody.appendChild(airportsPanel);

  // Wrapper: continent bar on top, two-panel map body below
  const mapWrapper = document.createElement('div');
  mapWrapper.className = 'map-dropdown-wrapper';
  mapWrapper.appendChild(continentBar);
  mapWrapper.appendChild(mapBody);
  dropdown.appendChild(mapWrapper);

  // Text search fallback (replaces map when typing in trigger input)
  // The trigger input remains in .airport-trigger but controls map vs list mode
  function isSearchMode() {
    return searchInput.value.trim().length > 0;
  }

  function selectMapCountry(code) {
    activeCountry = code;
    // Update SVG active state
    if (injectedSvgEl) {
      injectedSvgEl.querySelectorAll('[data-country]').forEach(p => p.classList.remove('active-country'));
      injectedSvgEl.querySelectorAll(`[data-country="${code}"]`).forEach(p => p.classList.add('active-country'));
    }

    // Update header
    const title = apHeader.querySelector('.map-airports-title');
    title.textContent = countryLabel(code);
    apSearchWrap.style.display = '';
    apSearchInput.value = '';

    // Show select-all / deselect-all buttons
    const btnsEl = apHeader.querySelector('.map-airports-header-btns');
    const countryAirports = AIRPORTS.filter(a => a.country === code);
    btnsEl.innerHTML = `<button type="button" class="map-sel-all">${t('select_all') || 'Todos'}</button>
      <button type="button" class="map-desel-all">${t('deselect_all') || 'Ninguno'}</button>`;
    btnsEl.querySelector('.map-sel-all').addEventListener('click', () => {
      countryAirports.forEach(a => {
        const allowed = getAllowedFn ? getAllowedFn(a) : true;
        if (allowed) selected.add(a.iata);
      });
      if (code === 'AK' || code === 'US') syncAlaskaUS(true, false);
      renderTags(); updateTriggerText(); renderCountryAirports(code, ''); onChangeCb?.();
    });
    btnsEl.querySelector('.map-desel-all').addEventListener('click', () => {
      countryAirports.forEach(a => selected.delete(a.iata));
      if (code === 'AK' || code === 'US') syncAlaskaUS(false, true);
      renderTags(); updateTriggerText(); renderCountryAirports(code, ''); onChangeCb?.();
    });

    apSearchInput.oninput = () => renderCountryAirports(code, apSearchInput.value);
    renderCountryAirports(code, '');
  }

  function renderCountryAirports(code, query) {
    const q = query.trim().toLowerCase();
    let airports = AIRPORTS.filter(a => a.country === code && (getAllowedFn ? getAllowedFn(a) : true));
    if (q) airports = airports.filter(a =>
      a.iata.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q)
    );
    apList.innerHTML = '';
    if (airports.length === 0) {
      apList.innerHTML = `<div class="map-airport-placeholder">${t('no_results') || 'Sin resultados'}</div>`;
      return;
    }
    airports.forEach(a => renderAirportOption(a, apList));
  }

  function renderContinentAirports(id, query) {
    const doc = _continentDocs[id];
    if (!doc) return;
    const continentCountries = new Set(
      [...doc.querySelectorAll('[data-country]')].map(p => p.getAttribute('data-country'))
    );
    const q = query.trim().toLowerCase();
    let airports = AIRPORTS.filter(a => continentCountries.has(a.country) && (getAllowedFn ? getAllowedFn(a) : true));
    if (q) airports = airports.filter(a =>
      a.iata.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      countryLabel(a.country).toLowerCase().includes(q)
    );
    apList.innerHTML = '';
    if (airports.length === 0) {
      apList.innerHTML = `<div class="map-airport-placeholder">${t('no_results') || 'Sin resultados'}</div>`;
      return;
    }
    const byCountry = {};
    airports.forEach(a => {
      if (!byCountry[a.country]) byCountry[a.country] = { name: countryLabel(a.country), airports: [] };
      byCountry[a.country].airports.push(a);
    });
    for (const group of Object.values(byCountry)) {
      const header = document.createElement('div');
      header.className = 'dropdown-country-header';
      header.innerHTML = `<span class="country-header-name">${group.name}</span>
        <div class="country-header-btns">
          <button type="button" class="country-select-all">${t('select_all')}</button>
          <button type="button" class="country-deselect-all">${t('deselect_all')}</button>
        </div>`;
      header.querySelector('.country-select-all').addEventListener('mousedown', (e) => {
        e.preventDefault();
        group.airports.forEach(a => { const ok = getAllowedFn ? getAllowedFn(a) : true; if (ok) selected.add(a.iata); });
        const groupCountry = group.airports[0]?.country;
        if (groupCountry === 'AK' || groupCountry === 'US') syncAlaskaUS(true, false);
        renderTags(); updateTriggerText(); renderContinentAirports(id, apSearchInput.value); onChangeCb?.();
      });
      header.querySelector('.country-deselect-all').addEventListener('mousedown', (e) => {
        e.preventDefault();
        group.airports.forEach(a => selected.delete(a.iata));
        const groupCountry = group.airports[0]?.country;
        if (groupCountry === 'AK' || groupCountry === 'US') syncAlaskaUS(false, true);
        renderTags(); updateTriggerText(); renderContinentAirports(id, apSearchInput.value); onChangeCb?.();
      });
      apList.appendChild(header);
      group.airports.forEach(a => renderAirportOption(a, apList));
    }
  }

  // Helper: sync AK ↔ US when one is selected/deselected
  function syncAlaskaUS(justAdded, justRemoved) {
    // Link between Alaska (AK) and continental US (US)
    const akAirports = AIRPORTS.filter(a => a.country === 'AK');
    const usAirports = AIRPORTS.filter(a => a.country === 'US');
    const allUS = [...akAirports, ...usAirports];
    
    // If anything from AK/US was added, add all of the linked group
    if (justAdded) {
      allUS.forEach(a => {
        const allowed = getAllowedFn ? getAllowedFn(a) : true;
        if (allowed) selected.add(a.iata);
      });
    }
    // If anything from AK/US was removed, remove all of the linked group
    if (justRemoved) {
      allUS.forEach(a => selected.delete(a.iata));
    }
  }

  function renderAirportOption(a, container) {
    const allowed = getAllowedFn ? getAllowedFn(a) : true;
    const el = document.createElement('div');
    el.className = 'airport-option' + (selected.has(a.iata) ? ' selected' : '') + (allowed ? '' : ' no-route');
    el.setAttribute('role', 'option');
    el.setAttribute('tabindex', allowed ? '0' : '-1');
    el.innerHTML = `<span class="iata">${a.iata}</span><span class="airport-city">${a.city}</span><span class="airport-name">${a.name}</span>${selected.has(a.iata) ? '<span class="option-check">\u2713</span>' : ''}`;
    el.addEventListener('mousedown', (e) => {
      e.preventDefault();
      if (!allowed) return;
      const wasSelected = selected.has(a.iata);
      if (wasSelected) {
        selected.delete(a.iata);
        // Check if this is an AK/US airport and sync
        if (a.country === 'AK' || a.country === 'US') syncAlaskaUS(false, true);
      } else {
        selected.add(a.iata);
        // Check if this is an AK/US airport and sync
        if (a.country === 'AK' || a.country === 'US') syncAlaskaUS(true, false);
      }
      renderTags(); updateTriggerText(); onChangeCb?.();
      // Re-render in place
      if (activeCountry) renderCountryAirports(activeCountry, apSearchInput.value);
      else if (isSearchMode()) renderSearchList(searchInput.value);
      else renderContinentAirports(activeContinent, apSearchInput.value);
    });
    container.appendChild(el);
  }

  // Search list mode (text query)
  function isSimple() { return simpleSearchMode || forceSimple; }

  function renderSearchList(query) {
    const q = query.trim().toLowerCase();
    if (!q && !isSimple()) {
      list.innerHTML = '';
      list.style.display = 'none';
      mapWrapper.style.display = '';
      return;
    }
    if (!q && isSimple()) {
      // Simple mode with no query: show country headers only, expand airports on click (lazy)
      list.style.display = '';
      mapWrapper.style.display = 'none';
      list.innerHTML = '';
      const byCountry = {};
      AIRPORTS.forEach(a => {
        if (getAllowedFn && !getAllowedFn(a)) return;
        if (!byCountry[a.country]) byCountry[a.country] = { name: countryLabel(a.country), airports: [] };
        byCountry[a.country].airports.push(a);
      });
      for (const group of Object.values(byCountry)) {
        const header = document.createElement('div');
        header.className = 'dropdown-country-header dropdown-country-collapsed';
        header.innerHTML = `<span class="country-header-name country-header-toggle">▶ ${group.name} <span class="country-airport-count">(${group.airports.length})</span></span>
          <div class="country-header-btns">
            <button type="button" class="country-select-all">${t('select_all')}</button>
            <button type="button" class="country-deselect-all">${t('deselect_all')}</button>
          </div>`;
        // Lazy airport container
        const airportContainer = document.createElement('div');
        airportContainer.className = 'country-airports-container';
        airportContainer.style.display = 'none';
        let rendered = false;
        const toggleExpand = () => {
          const collapsed = header.classList.toggle('dropdown-country-collapsed');
          airportContainer.style.display = collapsed ? 'none' : '';
          const toggleEl = header.querySelector('.country-header-toggle');
          if (toggleEl) toggleEl.textContent = (collapsed ? '▶ ' : '▼ ') + group.name + ` (${group.airports.length})`;
          if (!collapsed && !rendered) {
            rendered = true;
            group.airports.forEach(a => renderAirportOption(a, airportContainer));
          }
        };
        header.querySelector('.country-header-toggle').addEventListener('mousedown', (e) => {
          e.preventDefault();
          toggleExpand();
        });
        header.querySelector('.country-select-all').addEventListener('mousedown', (e) => {
          e.preventDefault();
          group.airports.forEach(a => { const ok = getAllowedFn ? getAllowedFn(a) : true; if (ok) selected.add(a.iata); });
          const groupCountry = group.airports[0]?.country;
          if (groupCountry === 'AK' || groupCountry === 'US') syncAlaskaUS(true, false);
          renderTags(); updateTriggerText(); renderSearchList(searchInput.value); onChangeCb?.();
        });
        header.querySelector('.country-deselect-all').addEventListener('mousedown', (e) => {
          e.preventDefault();
          group.airports.forEach(a => selected.delete(a.iata));
          const groupCountry = group.airports[0]?.country;
          if (groupCountry === 'AK' || groupCountry === 'US') syncAlaskaUS(false, true);
          renderTags(); updateTriggerText(); renderSearchList(searchInput.value); onChangeCb?.();
        });
        list.appendChild(header);
        list.appendChild(airportContainer);
      }
      return;
    }
    list.style.display = '';
    mapWrapper.style.display = 'none';

    const filtered = AIRPORTS.filter(a =>
      (getAllowedFn ? getAllowedFn(a) : true) && (
        a.iata.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.city.toLowerCase().includes(q) ||
        countryLabel(a.country).toLowerCase().includes(q)
      )
    );
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
          <button type="button" class="country-select-all">${t('select_all')}</button>
          <button type="button" class="country-deselect-all">${t('deselect_all')}</button>
        </div>`;
      header.querySelector('.country-select-all').addEventListener('mousedown', (e) => {
        e.preventDefault();
        group.airports.forEach(a => { const ok = getAllowedFn ? getAllowedFn(a) : true; if (ok) selected.add(a.iata); });
        const groupCountry = group.airports[0]?.country;
        if (groupCountry === 'AK' || groupCountry === 'US') syncAlaskaUS(true, false);
        renderTags(); updateTriggerText(); renderSearchList(searchInput.value); onChangeCb?.();
      });
      header.querySelector('.country-deselect-all').addEventListener('mousedown', (e) => {
        e.preventDefault();
        group.airports.forEach(a => selected.delete(a.iata));
        const groupCountry = group.airports[0]?.country;
        if (groupCountry === 'AK' || groupCountry === 'US') syncAlaskaUS(false, true);
        renderTags(); updateTriggerText(); renderSearchList(searchInput.value); onChangeCb?.();
      });
      list.appendChild(header);
      group.airports.forEach(a => renderAirportOption(a, list));
    }
  }

  function openDropdown() {
    dropdown.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    searchInput.value = '';
    if (isSimple()) {
      // Simple mode: hide map, show full airport list directly
      mapWrapper.style.display = 'none';
      renderSearchList('');
    } else {
      // Full mode: show map wrapper, hide search list
      list.style.display = 'none';
      mapWrapper.style.display = '';
      // Reset country selection and show all continent airports
      activeCountry = null;
      injectedSvgEl?.querySelectorAll('.active-country').forEach(p => p.classList.remove('active-country'));
      mapInjected = null; // force re-render so continent airports are freshly shown
      renderContinent(activeContinent);
    }
    // On mobile: pin the dropdown just below the header so it always has max vertical space
    if (window.innerWidth <= 640) {
      const headerEl = document.querySelector('header');
      const topPos = headerEl ? headerEl.getBoundingClientRect().bottom + 8 : 64;
      const w = window.innerWidth * 0.95;
      const h = window.innerHeight - topPos - 8;
      dropdown.style.position = 'fixed';
      dropdown.style.top = topPos + 'px';
      dropdown.style.left = ((window.innerWidth - w) / 2) + 'px';
      dropdown.style.right = ((window.innerWidth - w) / 2) + 'px';
      dropdown.style.width = w + 'px';
      dropdown.style.minWidth = 'unset';
      dropdown.style.maxWidth = w + 'px';
      dropdown.style.maxHeight = h + 'px';
    }
    searchInput.focus();
  }

  function closeDropdown() {
    dropdown.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    searchInput.value = '';
    // Reset any mobile fixed positioning
    dropdown.style.position = '';
    dropdown.style.top = '';
    dropdown.style.left = '';
    dropdown.style.right = '';
    dropdown.style.width = '';
    dropdown.style.minWidth = '';
    dropdown.style.maxWidth = '';
    dropdown.style.maxHeight = '';
  }

  function removeAirport(iata) {
    selected.delete(iata);
    renderTags();
    updateTriggerText();
    onChangeCb?.();
    if (activeCountry) renderCountryAirports(activeCountry, apSearchInput.value);
    else if (activeContinent) renderContinentAirports(activeContinent, apSearchInput.value);
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
    // Click on tag remove button: handled separately
    if (e.target.closest('.tag button')) return;
    // Click directly on the search input: just ensure open, don't toggle closed
    if (e.target === searchInput) {
      if (!dropdown.classList.contains('open')) openDropdown();
      return;
    }
    // Toggle on the rest of the trigger area
    if (dropdown.classList.contains('open')) { closeDropdown(); } else { openDropdown(); }
  });

  searchInput.addEventListener('focus', () => {
    if (!dropdown.classList.contains('open')) openDropdown();
  });

  searchInput.addEventListener('input', () => renderSearchList(searchInput.value));

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closeDropdown(); trigger.focus(); }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const firstOption = list.querySelector('.airport-option:not(.no-route)');
      if (firstOption) firstOption.focus();
    }
  });

  // Prevent clicks inside dropdown from bubbling to document.
  // Also prevent non-interactive elements (SVG water, map backgrounds) from
  // stealing focus away from the search input — otherwise clicking on the ocean
  // triggers focusout with relatedTarget=null and closes the dropdown.
  dropdown.addEventListener('mousedown', (e) => {
    e.stopPropagation();
    // Sólo permitir que el foco se mueva a inputs de texto dentro del dropdown
    // (p.ej. el buscador de aeropuertos del mapa). Para botones, paths SVG y
    // cualquier otra cosa se previene el comportamiento por defecto del mousedown
    // para que el input del trigger no pierda el foco — esto evita que en móvil
    // al tocar un botón de continente se dispare focusout con relatedTarget=null
    // y se cierre el dropdown.
    if (!e.target.matches('input[type="text"], input:not([type]), textarea')) {
      e.preventDefault();
    }
  });

  document.addEventListener('click', (e) => {
    if (!selectorEl.contains(e.target)) closeDropdown();
  });

  // Close when focus leaves the whole selector (Tab, click elsewhere, etc.)
  // Use a small delay so that click events on the trigger fire before we close —
  // this prevents the race where focusout fires (relatedTarget=null) during a
  // mousedown→focus transition and closes the dropdown before the click reopens it.
  selectorEl.addEventListener('focusout', (e) => {
    // If focus is moving within the selector, do nothing
    if (selectorEl.contains(e.relatedTarget)) return;
    // Small defer so trigger's click handler runs first if this was a click
    setTimeout(() => {
      if (!selectorEl.contains(document.activeElement)) closeDropdown();
    }, 0);
  });

  return {
    getSelected:     () => [...selected],
    setSelected:     (iataArray) => {
      selected.clear();
      iataArray.forEach(iata => { if (AIRPORTS.find(a => a.iata === iata)) selected.add(iata); });
      renderTags();
      updateTriggerText();
    },
    refresh:         () => {
      continentBar.querySelectorAll('.map-continent-btn').forEach(btn => {
        btn.textContent = t('continent_' + btn.dataset.continent) || btn.textContent;
      });
      apSearchInput.placeholder = t('map_search_placeholder') || 'Buscar aeropuerto…';
      if (activeCountry) renderCountryAirports(activeCountry, apSearchInput.value);
      else if (activeContinent) renderContinentAirports(activeContinent, apSearchInput.value);
    },
    setGetAllowed:   (fn) => { getAllowedFn = fn; },
    setOnChange:     (fn) => { onChangeCb = fn; },
    clearDisallowed: () => {
      if (!getAllowedFn) return;
      const toRemove = AIRPORTS.filter(a => selected.has(a.iata) && !getAllowedFn(a));
      if (toRemove.length === 0) return;
      toRemove.forEach(a => selected.delete(a.iata));
      renderTags();
      updateTriggerText();
      if (activeCountry) renderCountryAirports(activeCountry, apSearchInput.value);
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

/* ── Wire up Simple Search checkbox (main search form) ── */
function isMobileDevice() {
  return window.innerWidth <= 640;
}

function showSimpleSearchWarning(rowEl) {
  // Remove any existing warning first
  rowEl.parentElement.querySelector('.simple-search-warning')?.remove();
  if (isMobileDevice()) {
    const warn = document.createElement('p');
    warn.className = 'simple-search-warning';
    warn.dataset.i18n = 'simple_search_mobile_warn';
    warn.textContent = t('simple_search_mobile_warn');
    rowEl.insertAdjacentElement('afterend', warn);
  }
}

function hideSimpleSearchWarning(rowEl) {
  rowEl.parentElement.querySelector('.simple-search-warning')?.remove();
}

// Keep warnings in sync when language changes
onLangChange(() => {
  document.querySelectorAll('.simple-search-warning').forEach(warn => {
    warn.textContent = t('simple_search_mobile_warn');
  });
});

const simpleSearchCheck = document.getElementById('simpleSearchCheck');
if (simpleSearchCheck) {
  simpleSearchCheck.checked = simpleSearchMode;
  simpleSearchCheck.addEventListener('change', () => {
    setSimpleSearchMode(simpleSearchCheck.checked);
    // Sync the express checkbox if present
    const exChk = document.getElementById('exSimpleSearchCheck');
    if (exChk) exChk.checked = simpleSearchMode;
    // Show/hide mobile warning
    const row = simpleSearchCheck.closest('.simple-search-row');
    if (!simpleSearchMode) showSimpleSearchWarning(row);
    else hideSimpleSearchWarning(row);
    // Sync warning on express form too
    const exRow = exChk?.closest('.simple-search-row');
    if (exRow) {
      if (!simpleSearchMode) showSimpleSearchWarning(exRow);
      else hideSimpleSearchWarning(exRow);
    }
  });
}

/* ── Show-all-airports filter ── */
let showAllAirports = false;
try { showAllAirports = localStorage.getItem('showAllAirports') === '1'; } catch(e) {}

function isAirportAllowed(a) {
  if (showAllAirports) return true;
  return (a.importance || 1) >= 3;
}

function applyShowAllAirports(val) {
  showAllAirports = val;
  try { localStorage.setItem('showAllAirports', val ? '1' : '0'); } catch(e) {}
  // Re-apply allowed filter on both selectors so they re-render
  selectorFrom.setGetAllowed(isAirportAllowed);
  selectorTo.setGetAllowed(isAirportAllowed);
  selectorFrom.clearDisallowed();
  selectorTo.clearDisallowed();
  selectorFrom.refresh();
  selectorTo.refresh();
  // Sync express selectors if present
  if (typeof exSelectorFrom !== 'undefined') {
    exSelectorFrom.setGetAllowed(isAirportAllowed);
    exSelectorTo.setGetAllowed(isAirportAllowed);
    exSelectorFrom.clearDisallowed();
    exSelectorTo.clearDisallowed();
    exSelectorFrom.refresh?.();
    exSelectorTo.refresh?.();
  }
}

const showAllAirportsCheck = document.getElementById('showAllAirportsCheck');
if (showAllAirportsCheck) {
  showAllAirportsCheck.checked = showAllAirports;
  showAllAirportsCheck.addEventListener('change', () => {
    applyShowAllAirports(showAllAirportsCheck.checked);
    const exChk = document.getElementById('exShowAllAirportsCheck');
    if (exChk) exChk.checked = showAllAirports;
  });
}
const exShowAllAirportsCheck = document.getElementById('exShowAllAirportsCheck');
if (exShowAllAirportsCheck) {
  exShowAllAirportsCheck.checked = showAllAirports;
  exShowAllAirportsCheck.addEventListener('change', () => {
    applyShowAllAirports(exShowAllAirportsCheck.checked);
    if (showAllAirportsCheck) showAllAirportsCheck.checked = showAllAirports;
  });
}

// Keep tooltip text in sync with language changes
onLangChange(() => {
  document.querySelectorAll('.tooltip-icon[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
});

/* ── IATA routes: determine which airports are selectable ── */

selectorFrom.setGetAllowed(isAirportAllowed);
selectorTo.setGetAllowed(isAirportAllowed);

selectorFrom.setOnChange(() => selectorTo.refresh());
selectorTo.setOnChange(() => selectorFrom.refresh());

const API_BASE = IS_LOCAL
  ? 'http://localhost:8000'
  : 'https://welcome-airedale-commonly.ngrok-free.app';

// Wrapper that adds the ngrok browser-warning bypass header on every request
function apiFetch(url, options = {}) {
  const headers = { 'ngrok-skip-browser-warning': 'true', ...(options.headers || {}) };
  return fetch(url, { ...options, headers });
}

if (IS_LOCAL) {
  document.getElementById('devModeToggle').style.display = '';
}

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
    await apiFetch(`${API_BASE}/api/log-level`, {
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
    const res  = await apiFetch(`${API_BASE}/api/logs`);
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
  if (IS_LOCAL) return;

  let wakeupShown = false;
  const wakeupTimer = setTimeout(() => {
    wakeupShown = true;
    if (statusEl) statusEl.textContent = t('wakeup_msg');
  }, 1000);

  try {
    await Promise.race([
      apiFetch(`${API_BASE}/api/ping`).then(r => { if (!r.ok) throw new Error(); }),
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

  const searchId = crypto.randomUUID();
  const payload = {
    search_id:    searchId,
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
      const r = await apiFetch(`${API_BASE}/api/progress?search_id=${searchId}`);
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
    const res = await apiFetch(`${API_BASE}/api/search`, {
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
    resultsEl.innerHTML = renderError(t('conn_error_full'));
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

  // Search results — rebuild with new language, preserving filter state
  if (lastResults) {
    const resultsEl = document.getElementById('results');
    if (resultsEl?.querySelector('.results-header')) {
      // Capture current filter DOM values before wiping innerHTML
      const fs = {
        dateFrom: document.getElementById('fDateFrom')?.value,
        dateTo:   document.getElementById('fDateTo')?.value,
        price:    document.getElementById('fPrice')?.value,
        sort:     document.getElementById('fSort')?.value,
        airline:  document.getElementById('fAirline')?.value,
        depFrom:  document.getElementById('fDepFrom')?.value,
        depTo:    document.getElementById('fDepTo')?.value,
        arrFrom:  document.getElementById('fArrFrom')?.value,
        arrTo:    document.getElementById('fArrTo')?.value,
        stopsVal: document.querySelector('.filter-stop-btn.active')?.dataset.val ?? '',
        depDays:  [...document.querySelectorAll('#fDepDays .filter-day-btn.active')].map(b => b.dataset.day),
        arrDays:  [...document.querySelectorAll('#fArrDays .filter-day-btn.active')].map(b => b.dataset.day),
      };

      // Preserve return section if visible
      const returnSection = document.getElementById('returnSection');

      resultsEl.innerHTML = buildResultsHeader(lastResults)
        + buildFilterBar(lastResults)
        + '<div id="resultsGrid">' + renderResultsGridInner(lastResults, '', activeRoute === '__flat__', excludedRoutes) + '</div>';

      bindFilterBarEvents();
      bindResultsHeaderBtns(lastResults);
      const rg = document.getElementById('resultsGrid');
      bindSaveBtns(rg, lastResults.vuelos);
      bindReturnBtns(rg, lastResults.vuelos);
      bindRouteTabs(rg, applyFiltersAndSort);

      // Re-append return section if it was present
      if (returnSection) resultsEl.appendChild(returnSection);

      // Restore filter input values
      const set = (id, v) => { const el = document.getElementById(id); if (el && v != null) el.value = v; };
      set('fDateFrom', fs.dateFrom); set('fDateTo', fs.dateTo);
      set('fPrice', fs.price);       set('fSort', fs.sort);
      set('fAirline', fs.airline);
      set('fDepFrom', fs.depFrom);   set('fDepTo', fs.depTo);
      set('fArrFrom', fs.arrFrom);   set('fArrTo', fs.arrTo);

      // Restore active pill/day-button states
      document.querySelectorAll('.filter-stop-btn').forEach(b =>
        b.classList.toggle('active', b.dataset.val === fs.stopsVal));
      document.querySelectorAll('#fDepDays .filter-day-btn').forEach(b =>
        b.classList.toggle('active', fs.depDays.includes(b.dataset.day)));
      document.querySelectorAll('#fArrDays .filter-day-btn').forEach(b =>
        b.classList.toggle('active', fs.arrDays.includes(b.dataset.day)));

      applyFiltersAndSort();
    }
  }

  // Saved tab
  if (!document.getElementById('tab-saved').classList.contains('hidden')) {
    renderSavedTab();
  }
});
