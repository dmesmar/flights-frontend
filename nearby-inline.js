/* -------------------------------------------
   NEARBY AIRPORTS — Inline Panel
   Adds a collapsible "📍 Añadir aeropuertos cercanos" panel
   below each airport selector in all three forms.

   Depends on:
     airports.js       → AIRPORTS global
     airport_coords.js → AIRPORT_COORDS global
     geo.js            → getNearbyAirports()
     i18n.js           → t(), onLangChange()
     app.js            → selectorFrom, selectorTo
     express.js        → exSelectorFrom, exSelectorTo
     cheap.js          → chSelectorFrom, chSelectorTo
------------------------------------------- */

/**
 * Attaches a collapsible nearby-airports panel below a .form-group.
 *
 * @param {object}      selectorObj  – { getSelected(), setSelected(iataArray) }
 * @param {HTMLElement} formGroupEl  – the .form-group element to append to
 * @param {string}      panelId      – unique id for the panel root element
 */
function initNearbyInlinePanel(selectorObj, formGroupEl, panelId) {

  /* ── Wrapper ──────────────────────────────── */
  const wrap = document.createElement('div');
  wrap.className = 'ni-wrap';

  /* ── Toggle button ────────────────────────── */
  const toggleBtn = document.createElement('button');
  toggleBtn.type      = 'button';
  toggleBtn.className = 'ni-toggle-btn';
  toggleBtn.setAttribute('aria-expanded', 'false');
  toggleBtn.setAttribute('aria-controls', panelId);
  _refreshToggleBtn(toggleBtn);

  /* ── Panel ────────────────────────────────── */
  const panel = document.createElement('div');
  panel.className = 'ni-panel';
  panel.id        = panelId;
  panel.hidden    = true;

  panel.innerHTML =
    `<div class="ni-controls">` +
      `<span class="ni-radius-label">${t('nearby_label_radius')}: <strong class="ni-radius-val">100</strong> km</span>` +
      `<input type="range" class="ni-slider" min="10" max="1000" value="100" step="10" />` +
      `<label class="ni-group-label">` +
        `<input type="checkbox" class="ni-group-chk" />` +
        `<span class="ni-group-label-text">${t('nearby_inline_group')}</span>` +
      `</label>` +
    `</div>` +
    `<div class="ni-controls ni-controls-imp">` +
      `<span class="ni-imp-label">${t('nearby_inline_importance')}: <strong class="ni-imp-val">3</strong></span>` +
      `<div class="ni-imp-slider-wrap">` +
        `<input type="range" class="ni-imp-slider" min="1" max="5" step="1" value="3" />` +
        `<div class="ni-imp-ticks" aria-hidden="true">` +
          `<span>1</span><span>2</span><span>3</span><span>4</span><span>5</span>` +
        `</div>` +
      `</div>` +
    `</div>` +
    `<div class="ni-results"></div>`;

  wrap.appendChild(toggleBtn);
  wrap.appendChild(panel);
  formGroupEl.appendChild(wrap);

  /* ── Refs ─────────────────────────────────── */
  const slider    = panel.querySelector('.ni-slider');
  let   radiusVal = panel.querySelector('.ni-radius-val');   // let: re-pointed after lang change
  const impSlider = panel.querySelector('.ni-imp-slider');
  let   impVal    = panel.querySelector('.ni-imp-val');      // let: re-pointed after lang change
  const resultsEl = panel.querySelector('.ni-results');
  const groupChk  = panel.querySelector('.ni-group-chk');
  let   isOpen    = false;

  /* ── Toggle ───────────────────────────────── */
  toggleBtn.addEventListener('click', () => {
    isOpen = !isOpen;
    panel.hidden = !isOpen;
    toggleBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    toggleBtn.classList.toggle('ni-toggle-open', isOpen);
    if (isOpen) _runSearch();
  });

  /* ── Slider ───────────────────────────────── */
  slider.addEventListener('input', () => {
    radiusVal.textContent = slider.value;
    if (isOpen) _runSearch();
  });

  /* ── Importance slider ────────────────────── */
  impSlider.addEventListener('input', () => {
    impVal.textContent = impSlider.value;
    if (isOpen) _runSearch();
  });

  /* ── Group toggle ─────────────────────────── */
  groupChk.addEventListener('change', () => {
    if (isOpen) _runSearch();
  });

  /* ── Core search ──────────────────────────── */
  function _runSearch() {
    const originIatas = selectorObj.getSelected();

    if (originIatas.length === 0) {
      resultsEl.innerHTML =
        `<p class="ni-hint">${t('nearby_inline_no_selection')}</p>`;
      return;
    }

    const radiusKm       = parseInt(slider.value, 10);
    const alreadyInList  = new Set(originIatas);
    const seen           = new Set(originIatas);   // de-duplicate across origins
    const results        = [];                      // { ...airport, distanceKm, fromIata }

    for (const originIata of originIatas) {
      if (!AIRPORT_COORDS[originIata]) continue;
      const nearby = getNearbyAirports(originIata, radiusKm, { minImportance: parseInt(impSlider.value, 10) });
      for (const r of nearby) {
        if (seen.has(r.iata)) continue;
        seen.add(r.iata);
        results.push({ ...r, fromIata: originIata });
      }
    }

    _renderResults(results, alreadyInList);
  }

  /* ── Render one result item ───────────────── */
  function _renderItem(r, alreadyInList, container) {
    const airport       = AIRPORTS.find(a => a.iata === r.iata);
    const name          = airport ? airport.name : r.iata;
    const city          = airport ? airport.city : '';
    const originAirport = AIRPORTS.find(a => a.iata === r.fromIata);
    const originLabel   = originAirport
      ? `${r.fromIata} · ${originAirport.city}`
      : r.fromIata;
    const alreadyAdded  = alreadyInList.has(r.iata);

    const item = document.createElement('div');
    item.className = 'ni-item' + (alreadyAdded ? ' ni-item-added' : '');

    item.innerHTML =
      `<div class="ni-item-info">` +
        `<span class="ni-item-iata">${r.iata}</span>` +
        `<span class="ni-item-name">${name}${city ? ` · ${city}` : ''}</span>` +
        `<span class="ni-item-dist">${r.distanceKm} km` +
          `<span class="ni-item-from"> ${t('nearby_inline_from')} ${originLabel}</span>` +
        `</span>` +
      `</div>` +
      `<button type="button" class="ni-add-btn${alreadyAdded ? ' ni-add-done' : ''}"` +
        ` data-iata="${r.iata}"${alreadyAdded ? ' disabled' : ''}>` +
        (alreadyAdded ? '✓' : `+ ${t('nearby_inline_add')}`) +
      `</button>`;

    if (!alreadyAdded) {
      item.querySelector('.ni-add-btn').addEventListener('click', () => {
        const current = selectorObj.getSelected();
        if (!current.includes(r.iata)) {
          selectorObj.setSelected([...current, r.iata]);
        }
        _runSearch();
      });
    }

    container.appendChild(item);
  }

  /* ── Render results ───────────────────────── */
  function _renderResults(results, alreadyInList) {
    if (results.length === 0) {
      resultsEl.innerHTML = `<p class="ni-hint">${t('nearby_no_results')}</p>`;
      return;
    }

    resultsEl.innerHTML = '';
    const isGrouped = groupChk.checked;
    const list = document.createElement('div');
    list.className = 'ni-list' + (isGrouped ? ' ni-list-grouped' : '');

    if (isGrouped) {
      // Group by origin airport (Map preserves insertion order = origin order)
      const groupMap = new Map();
      results.forEach(r => {
        if (!groupMap.has(r.fromIata)) groupMap.set(r.fromIata, []);
        groupMap.get(r.fromIata).push(r);
      });
      for (const [originIata, groupResults] of groupMap) {
        // Sort each group by distance
        groupResults.sort((a, b) => a.distanceKm - b.distanceKm);
        const originAirport = AIRPORTS.find(a => a.iata === originIata);
        const header = document.createElement('div');
        header.className = 'ni-group-header';
        header.textContent = originAirport
          ? `${originIata} · ${originAirport.city}`
          : originIata;
        list.appendChild(header);
        groupResults.forEach(r => _renderItem(r, alreadyInList, list));
      }
    } else {
      // Flat: all results sorted by distance
      results.slice()
        .sort((a, b) => a.distanceKm - b.distanceKm)
        .forEach(r => _renderItem(r, alreadyInList, list));
    }

    resultsEl.appendChild(list);
  }

  /* ── Auto-refresh when selector changes externally ── */
  selectorObj.addOnChange?.(() => {
    if (isOpen) _runSearch();
  });

  /* ── Language change: refresh static labels ─ */
  onLangChange(() => {
    _refreshToggleBtn(toggleBtn);
    const lbl = panel.querySelector('.ni-radius-label');
    if (lbl) {
      const val = radiusVal ? radiusVal.textContent : slider.value;
      lbl.innerHTML =
        `${t('nearby_label_radius')}: <strong class="ni-radius-val">${val}</strong> km`;
      // Re-point after innerHTML replacement
      radiusVal = panel.querySelector('.ni-radius-val');
    }
    const groupLabelText = panel.querySelector('.ni-group-label-text');
    if (groupLabelText) groupLabelText.textContent = t('nearby_inline_group');
    const impLbl = panel.querySelector('.ni-imp-label');
    if (impLbl) {
      const val = impVal ? impVal.textContent : impSlider.value;
      impLbl.innerHTML = `${t('nearby_inline_importance')}: <strong class="ni-imp-val">${val}</strong>`;
      impVal = panel.querySelector('.ni-imp-val');
    }
    // Re-render open panel with new language
    if (isOpen) _runSearch();
  });
}

/* ── Private helpers ─────────────────────── */
function _refreshToggleBtn(btn) {
  btn.textContent = t('nearby_inline_btn');
}

/* ═══════════════════════════════════════════
   INIT — attach to all six selectors
   Note: top-level `const` is NOT on `window`,
   so reference each global name directly.
═══════════════════════════════════════════ */
(function _initAllNearbyPanels() {
  function _tryInit(selectorObj, elId, panelId) {
    const selectorEl = document.getElementById(elId);
    if (!selectorObj || !selectorEl) return;
    const formGroup = selectorEl.closest('.form-group');
    if (!formGroup) return;
    initNearbyInlinePanel(selectorObj, formGroup, panelId);
  }

  /* Main search */
  if (typeof selectorFrom   !== 'undefined') _tryInit(selectorFrom,   'selectorFrom',   'ni-main-from');
  if (typeof selectorTo     !== 'undefined') _tryInit(selectorTo,     'selectorTo',     'ni-main-to');

  /* Express */
  if (typeof exSelectorFrom !== 'undefined') _tryInit(exSelectorFrom, 'exSelectorFrom', 'ni-ex-from');
  if (typeof exSelectorTo   !== 'undefined') _tryInit(exSelectorTo,   'exSelectorTo',   'ni-ex-to');

  /* Cheap */
  if (typeof chSelectorFrom !== 'undefined') _tryInit(chSelectorFrom, 'chSelectorFrom', 'ni-ch-from');
  if (typeof chSelectorTo   !== 'undefined') _tryInit(chSelectorTo,   'chSelectorTo',   'ni-ch-to');
})();
