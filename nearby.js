/* -------------------------------------------
   NEARBY AIRPORTS TAB
   Depends on: airports.js  (AIRPORTS global)
               airport_coords.js (AIRPORT_COORDS global)
               geo.js  (getNearbyAirports, getAirportDistance)
               i18n.js (t() global)
               app.js  (selectorFrom, selectorTo globals)
------------------------------------------- */

/* ── State ── */
let nearbySelectedIata = null;   // currently selected origin airport

/* ── DOM refs ── */
const nearbyInput        = document.getElementById('nearbyAirportInput');
const nearbyDropdown     = document.getElementById('nearbyAirportDropdown');
const nearbySelectedTag  = document.getElementById('nearbySelectedTag');
const nearbyRadiusSlider = document.getElementById('nearbyRadiusSlider');
const nearbyRadiusValue  = document.getElementById('nearbyRadiusValue');
const nearbySearchBtn    = document.getElementById('nearbySearchBtn');
const nearbyMinImpSelect = document.getElementById('nearbyMinImportance');
const nearbyResultsDiv   = document.getElementById('nearbyResults');

/* ── Build candidate list: European airports that have coordinates ── */
const _nearbyEuropeanAirports = AIRPORTS.filter(
  a => typeof AIRPORT_COORDS !== 'undefined' && AIRPORT_COORDS[a.iata]
);

/* ── Autocomplete helpers ── */
function _nearbySearch(query) {
  if (!query || query.length < 1) return [];
  const q = query.toLowerCase().trim();
  const exact   = [];
  const partial = [];
  for (const a of _nearbyEuropeanAirports) {
    const iataMatch = a.iata.toLowerCase().startsWith(q);
    const nameMatch = a.name.toLowerCase().includes(q);
    const cityMatch = a.city.toLowerCase().includes(q);
    if (!iataMatch && !nameMatch && !cityMatch) continue;
    if (iataMatch || a.city.toLowerCase().startsWith(q)) {
      exact.push(a);
    } else {
      partial.push(a);
    }
  }
  return [...exact, ...partial].slice(0, 8);
}

function _nearbyShowDropdown(results) {
  nearbyDropdown.innerHTML = '';
  if (results.length === 0) {
    nearbyDropdown.classList.add('hidden');
    return;
  }
  results.forEach(a => {
    const item = document.createElement('div');
    item.className  = 'nearby-dropdown-item';
    item.dataset.iata = a.iata;
    const countryName = t('country_' + a.country) || a.country;
    item.innerHTML =
      `<span class="nearby-dd-iata">${a.iata}</span>` +
      `<span class="nearby-dd-name">${a.name}</span>` +
      `<span class="nearby-dd-sub">${a.city}, ${countryName}</span>`;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();   // keep focus on input
      _nearbySelectAirport(a.iata);
    });
    nearbyDropdown.appendChild(item);
  });
  nearbyDropdown.classList.remove('hidden');
}

function _nearbySelectAirport(iata) {
  const airport = AIRPORTS.find(a => a.iata === iata);
  if (!airport) return;
  nearbySelectedIata = iata;
  nearbyInput.value  = `${iata} — ${airport.city}`;
  nearbyDropdown.classList.add('hidden');

  const countryName = t('country_' + airport.country) || airport.country;
  nearbySelectedTag.textContent = `${iata} · ${airport.name} · ${airport.city}, ${countryName}`;
  nearbySelectedTag.style.display = 'block';
  nearbySearchBtn.disabled = false;
}

function _nearbyClearSelection() {
  nearbySelectedIata = null;
  nearbySelectedTag.style.display = 'none';
  nearbySearchBtn.disabled = true;
}

/* ── Input events ── */
nearbyInput.addEventListener('input', () => {
  _nearbyClearSelection();
  _nearbyShowDropdown(_nearbySearch(nearbyInput.value));
});

nearbyInput.addEventListener('focus', () => {
  if (!nearbySelectedIata && nearbyInput.value.length > 0) {
    _nearbyShowDropdown(_nearbySearch(nearbyInput.value));
  }
});

nearbyInput.addEventListener('blur', () => {
  setTimeout(() => nearbyDropdown.classList.add('hidden'), 150);
});

nearbyInput.addEventListener('keydown', (e) => {
  const items = nearbyDropdown.querySelectorAll('.nearby-dropdown-item');
  if (!items.length) return;
  const active = nearbyDropdown.querySelector('.nearby-dropdown-item.active');
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    const next = active ? active.nextElementSibling : items[0];
    if (next) { active?.classList.remove('active'); next.classList.add('active'); }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    const prev = active ? active.previousElementSibling : items[items.length - 1];
    if (prev) { active?.classList.remove('active'); prev.classList.add('active'); }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (active) _nearbySelectAirport(active.dataset.iata);
  } else if (e.key === 'Escape') {
    nearbyDropdown.classList.add('hidden');
  }
});

/* ── Radius slider ── */
nearbyRadiusSlider.addEventListener('input', () => {
  nearbyRadiusValue.textContent = nearbyRadiusSlider.value;
});

/* ── Render result cards ── */
function _nearbyRenderResults(originIata, radiusKm, results) {
  if (results.length === 0) {
    nearbyResultsDiv.innerHTML =
      `<div class="results-placeholder">` +
        `<span class="placeholder-icon">🗺️</span>` +
        `<span>${t('nearby_no_results')}</span>` +
      `</div>`;
    return;
  }

  const originAirport = AIRPORTS.find(a => a.iata === originIata);
  const originName    = originAirport ? `${originIata} — ${originAirport.city}` : originIata;

  const header = document.createElement('div');
  header.className = 'nearby-results-header';
  header.innerHTML =
    `<span class="nearby-results-summary">${t('nearby_results_summary', results.length, radiusKm, originName)}</span>`;

  const grid = document.createElement('div');
  grid.className = 'nearby-results-grid';

  results.forEach(r => {
    const airport     = AIRPORTS.find(a => a.iata === r.iata);
    const name        = airport ? airport.name : r.iata;
    const city        = airport ? airport.city : '';
    const country     = airport ? airport.country : '';
    const importance  = airport ? airport.importance : 0;
    const countryName = t('country_' + country) || country;

    const stars = importance >= 4 ? '★' : '';

    const card = document.createElement('div');
    card.className = 'nearby-card';
    card.innerHTML =
      `<div class="nearby-card-header">` +
        `<span class="nearby-card-iata">${r.iata}</span>` +
        `<span class="nearby-card-dist">${r.distanceKm} km</span>` +
        `${stars ? `<span class="nearby-card-star" title="${t('nearby_major_airport')}">${stars}</span>` : ''}` +
      `</div>` +
      `<div class="nearby-card-name">${name}</div>` +
      `<div class="nearby-card-location">${city ? city + ', ' : ''}${countryName}</div>` +
      `<div class="nearby-card-actions">` +
        `<button class="nearby-btn-add" data-iata="${r.iata}" data-role="from" title="${t('nearby_add_origin_title')}">` +
          `${t('nearby_add_origin')}` +
        `</button>` +
        `<button class="nearby-btn-add" data-iata="${r.iata}" data-role="to" title="${t('nearby_add_dest_title')}">` +
          `${t('nearby_add_dest')}` +
        `</button>` +
      `</div>`;

    grid.appendChild(card);
  });

  nearbyResultsDiv.innerHTML = '';
  nearbyResultsDiv.appendChild(header);
  nearbyResultsDiv.appendChild(grid);
}

/* ── Add-to-selector button handler ── */
nearbyResultsDiv.addEventListener('click', (e) => {
  const btn = e.target.closest('.nearby-btn-add');
  if (!btn) return;

  const iata = btn.dataset.iata;
  const role = btn.dataset.role;   // "from" | "to"

  if (role === 'from') {
    if (typeof selectorFrom !== 'undefined') {
      const current = selectorFrom.getSelected();
      if (!current.includes(iata)) selectorFrom.setSelected([...current, iata]);
    }
  } else {
    if (typeof selectorTo !== 'undefined') {
      const current = selectorTo.getSelected();
      if (!current.includes(iata)) selectorTo.setSelected([...current, iata]);
    }
  }

  /* Visual feedback: briefly flash the button */
  btn.classList.add('nearby-btn-added');
  setTimeout(() => btn.classList.remove('nearby-btn-added'), 1200);

  /* Switch to search tab so the user sees the updated selector */
  const searchTabBtn = document.querySelector('.tab-btn[data-tab="search"]');
  if (searchTabBtn) {
    setTimeout(() => searchTabBtn.click(), 900);
  }
});

/* ── Main search handler ── */
nearbySearchBtn.addEventListener('click', () => {
  if (!nearbySelectedIata) return;

  const radiusKm    = parseInt(nearbyRadiusSlider.value, 10);
  const minImp      = parseInt(nearbyMinImpSelect.value, 10);
  const results     = getNearbyAirports(nearbySelectedIata, radiusKm, { minImportance: minImp });

  _nearbyRenderResults(nearbySelectedIata, radiusKm, results);
});

/* ── Initial state ── */
nearbySearchBtn.disabled = true;
