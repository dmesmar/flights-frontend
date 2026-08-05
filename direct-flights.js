/* -------------------------------------------
   DIRECT FLIGHTS — feature #14
   Given an origin airport, lists every destination
   reachable nonstop according to IATA_ROUTES.

   Depends on (all globals, load order):
     iata_routes.js   → IATA_ROUTES global
     airports.js      → AIRPORTS global
     airport_coords.js→ AIRPORT_COORDS global  (optional, for distance)
     geo.js           → getAirportDistance()
     i18n.js          → t(), onLangChange()
     render.js        → airportInfo(), escapeHtml()
     app.js           → createAirportSelector(), isAirportAllowed,
                        showAllAirports flag, applyShowAllAirports()
------------------------------------------- */

(function initDirectFlights() {

  /* ── Origin selector (single airport-style; multi-select still works) ── */
  const dirSelectorFrom = createAirportSelector(
    document.getElementById('dirSelectorFrom'),
    document.getElementById('dirTagsFrom')
  );
  dirSelectorFrom.setGetAllowed(isAirportAllowed);

  /* ── Sync the "Show all airports" checkbox with the global flag ── */
  const dirShowAllChk = document.getElementById('dirShowAllAirportsCheck');
  if (dirShowAllChk) {
    dirShowAllChk.checked = showAllAirports;
    dirShowAllChk.addEventListener('change', () => {
      applyShowAllAirports(dirShowAllChk.checked);
      ['showAllAirportsCheck', 'exShowAllAirportsCheck', 'chShowAllAirportsCheck', 'rtShowAllAirportsCheck', 'hmShowAllAirportsCheck', 'mcShowAllAirportsCheck', 'surShowAllAirportsCheck']
        .forEach(id => {
          const el = document.getElementById(id);
          if (el) el.checked = showAllAirports;
        });
    });
  }
  document.addEventListener('showAllAirportsChanged', (e) => {
    dirSelectorFrom.setGetAllowed(isAirportAllowed);
    dirSelectorFrom.clearDisallowed?.();
    dirSelectorFrom.refresh?.();
    if (dirShowAllChk) dirShowAllChk.checked = e.detail;
  });

  /* ── Module state ── */
  let dirRawDestinations = [];  // raw list of {iata, name, city, country, distanceKm}
  let dirOriginIata      = null;
  let dirFilterState     = { country: 'all', continent: 'all', sort: 'dist' };

  /* ── Continent grouping ──────────────────────
     Compact bucketing for filtering by region. Covers the most common
     destination countries. Anything not in this map falls into "Other"
     and the continent filter ignores it. Names match the country names
     used in AIRPORTS (English / canonical form). */
  const CONTINENT_BY_COUNTRY = {
    /* Europe */
    'Spain': 'EU', 'Portugal': 'EU', 'France': 'EU', 'Germany': 'EU',
    'Italy': 'EU', 'United Kingdom': 'EU', 'Ireland': 'EU', 'Netherlands': 'EU',
    'Belgium': 'EU', 'Switzerland': 'EU', 'Austria': 'EU', 'Sweden': 'EU',
    'Norway': 'EU', 'Denmark': 'EU', 'Finland': 'EU', 'Iceland': 'EU',
    'Poland': 'EU', 'Czechia': 'EU', 'Czech Republic': 'EU', 'Hungary': 'EU',
    'Greece': 'EU', 'Croatia': 'EU', 'Slovenia': 'EU', 'Slovakia': 'EU',
    'Romania': 'EU', 'Bulgaria': 'EU', 'Serbia': 'EU', 'Albania': 'EU',
    'Bosnia and Herzegovina': 'EU', 'North Macedonia': 'EU', 'Montenegro': 'EU',
    'Lithuania': 'EU', 'Latvia': 'EU', 'Estonia': 'EU', 'Belarus': 'EU',
    'Ukraine': 'EU', 'Moldova': 'EU', 'Russia': 'EU', 'Turkey': 'EU',
    'Malta': 'EU', 'Cyprus': 'EU', 'Luxembourg': 'EU', 'Andorra': 'EU',
    'Monaco': 'EU', 'San Marino': 'EU', 'Vatican City': 'EU',
    /* Americas */
    'United States': 'AM', 'Canada': 'AM', 'Mexico': 'AM',
    'Brazil': 'AM', 'Argentina': 'AM', 'Chile': 'AM', 'Peru': 'AM',
    'Colombia': 'AM', 'Venezuela': 'AM', 'Ecuador': 'AM', 'Bolivia': 'AM',
    'Uruguay': 'AM', 'Paraguay': 'AM', 'Guyana': 'AM', 'Suriname': 'AM',
    'Cuba': 'AM', 'Dominican Republic': 'AM', 'Puerto Rico': 'AM',
    'Jamaica': 'AM', 'Bahamas': 'AM', 'Trinidad and Tobago': 'AM',
    'Costa Rica': 'AM', 'Panama': 'AM', 'Guatemala': 'AM', 'Honduras': 'AM',
    'El Salvador': 'AM', 'Nicaragua': 'AM', 'Belize': 'AM',
    /* Asia */
    'China': 'AS', 'Japan': 'AS', 'South Korea': 'AS', 'North Korea': 'AS',
    'India': 'AS', 'Pakistan': 'AS', 'Bangladesh': 'AS', 'Sri Lanka': 'AS',
    'Nepal': 'AS', 'Thailand': 'AS', 'Vietnam': 'AS', 'Philippines': 'AS',
    'Malaysia': 'AS', 'Singapore': 'AS', 'Indonesia': 'AS', 'Cambodia': 'AS',
    'Laos': 'AS', 'Myanmar': 'AS', 'Mongolia': 'AS', 'Kazakhstan': 'AS',
    'Uzbekistan': 'AS', 'Turkmenistan': 'AS', 'Kyrgyzstan': 'AS', 'Tajikistan': 'AS',
    'Afghanistan': 'AS', 'Iran': 'AS', 'Iraq': 'AS', 'Saudi Arabia': 'AS',
    'United Arab Emirates': 'AS', 'Qatar': 'AS', 'Bahrain': 'AS', 'Kuwait': 'AS',
    'Oman': 'AS', 'Yemen': 'AS', 'Jordan': 'AS', 'Lebanon': 'AS',
    'Syria': 'AS', 'Israel': 'AS', 'Palestine': 'AS', 'Armenia': 'AS',
    'Azerbaijan': 'AS', 'Georgia': 'AS', 'Taiwan': 'AS', 'Hong Kong': 'AS',
    'Macau': 'AS', 'Maldives': 'AS', 'Bhutan': 'AS', 'Brunei': 'AS',
    /* Africa */
    'Morocco': 'AF', 'Egypt': 'AF', 'Tunisia': 'AF', 'Algeria': 'AF',
    'Libya': 'AF', 'South Africa': 'AF', 'Kenya': 'AF', 'Tanzania': 'AF',
    'Ethiopia': 'AF', 'Ghana': 'AF', 'Nigeria': 'AF', 'Senegal': 'AF',
    'Ivory Coast': 'AF', "Cote d'Ivoire": 'AF', 'Mali': 'AF', 'Mauritania': 'AF',
    'Cameroon': 'AF', 'Uganda': 'AF', 'Rwanda': 'AF', 'Burundi': 'AF',
    'Zimbabwe': 'AF', 'Zambia': 'AF', 'Mozambique': 'AF', 'Madagascar': 'AF',
    'Mauritius': 'AF', 'Seychelles': 'AF', 'Cape Verde': 'AF', 'Angola': 'AF',
    'Botswana': 'AF', 'Namibia': 'AF', 'Sudan': 'AF', 'South Sudan': 'AF',
    'Eritrea': 'AF', 'Somalia': 'AF', 'Djibouti': 'AF', 'Gabon': 'AF',
    'Congo': 'AF', 'Democratic Republic of the Congo': 'AF', 'Chad': 'AF',
    'Niger': 'AF', 'Burkina Faso': 'AF', 'Benin': 'AF', 'Togo': 'AF',
    'Sierra Leone': 'AF', 'Liberia': 'AF', 'Guinea': 'AF', 'Gambia': 'AF',
    'Réunion': 'AF', 'Reunion': 'AF', 'Mayotte': 'AF',
    /* Oceania */
    'Australia': 'OC', 'New Zealand': 'OC', 'Fiji': 'OC', 'Papua New Guinea': 'OC',
    'Vanuatu': 'OC', 'Samoa': 'OC', 'Tonga': 'OC', 'Solomon Islands': 'OC',
    'New Caledonia': 'OC', 'French Polynesia': 'OC',
  };

  /* Continent codes → display key in i18n */
  const CONTINENT_LABELS = {
    'EU': 'direct_continent_eu',
    'AM': 'direct_continent_am',
    'AS': 'direct_continent_as',
    'AF': 'direct_continent_af',
    'OC': 'direct_continent_oc',
  };

  /* ═══════════════════════════════════════════
     FORM SUBMIT
  ═══════════════════════════════════════════ */
  document.getElementById('directForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const selected = dirSelectorFrom.getSelected();
    if (!selected.length) {
      alert(t('direct_alert_origin'));
      return;
    }
    /* Allow multiple origins — union of destinations, deduplicated */
    const seen = new Set();
    const dests = [];
    for (const ori of selected) {
      const routes = (typeof IATA_ROUTES !== 'undefined' && IATA_ROUTES[ori]) || [];
      for (const dst of routes) {
        if (seen.has(dst) || dst === ori) continue;
        seen.add(dst);
        const ap = AIRPORTS.find(a => a.iata === dst);
        if (!ap) continue;
        const dist = (typeof getAirportDistance === 'function')
          ? getAirportDistance(ori, dst)
          : null;
        dests.push({
          iata:       dst,
          name:       ap.name,
          city:       ap.city,
          country:    ap.country,
          importance: ap.importance || 1,
          distanceKm: dist != null ? Math.round(dist) : null,
          fromIata:   ori,
        });
      }
    }
    dirOriginIata      = selected[0];
    dirRawDestinations = dests;
    dirFilterState     = { country: 'all', continent: 'all', sort: 'dist' };
    _renderResults(selected);
  });

  /* ═══════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════ */
  function _renderResults(originIatas) {
    const el = document.getElementById('dirResults');
    if (!el) return;

    if (!dirRawDestinations.length) {
      el.innerHTML =
        `<div class="results-placeholder"><span class="placeholder-icon">🎯</span>` +
        `${t('direct_no_routes')}</div>`;
      return;
    }

    const totalLabel = t('direct_count', dirRawDestinations.length);
    const originsLabel = originIatas
      .map(i => `${i} · ${escapeHtml(airportInfo(i).city)}`)
      .join(' · ');

    el.innerHTML = `
      <div class="dir-results-header">
        <div class="dir-results-summary">
          <span class="dir-origin-pill">${escapeHtml(originsLabel)}</span>
          <span class="dir-count">${totalLabel}</span>
        </div>
      </div>
      ${_buildFilterBarHtml()}
      <div id="dirGrid" class="dir-grid"></div>`;

    _renderGrid();
    _bindFilterEvents();
  }

  function _buildFilterBarHtml() {
    const countries = [...new Set(dirRawDestinations.map(d => d.country))].sort();
    const countryOpts = countries.map(c =>
      `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`
    ).join('');

    /* Continent dropdown — only show codes that actually have hits */
    const presentContinents = new Set();
    for (const d of dirRawDestinations) {
      const code = CONTINENT_BY_COUNTRY[d.country];
      if (code) presentContinents.add(code);
    }
    const orderedCodes = ['EU', 'AM', 'AS', 'AF', 'OC'].filter(c => presentContinents.has(c));
    const continentOpts = orderedCodes.map(c =>
      `<option value="${c}">${t(CONTINENT_LABELS[c])}</option>`
    ).join('');
    const continentBlock = orderedCodes.length > 1 ? `
      <div class="rt-fb-group">
        <label class="rt-fb-label" for="dirFbContinent">${t('direct_filter_continent')}</label>
        <select id="dirFbContinent" class="rt-fb-sel">
          <option value="all">${t('direct_filter_all')}</option>
          ${continentOpts}
        </select>
      </div>` : '';

    return `
      <div class="rt-filter-bar dir-filter-bar" id="dirFilterBar">
        <div class="rt-fb-row rt-fb-row-primary">
          ${continentBlock}
          <div class="rt-fb-group">
            <label class="rt-fb-label" for="dirFbCountry">${t('direct_filter_country')}</label>
            <select id="dirFbCountry" class="rt-fb-sel">
              <option value="all">${t('direct_filter_all')}</option>
              ${countryOpts}
            </select>
          </div>
          <div class="rt-fb-group">
            <label class="rt-fb-label" for="dirFbSort">${t('filter_sort')}</label>
            <select id="dirFbSort" class="rt-fb-sel">
              <option value="dist">${t('direct_sort_dist')}</option>
              <option value="city">${t('direct_sort_city')}</option>
              <option value="country">${t('direct_sort_country')}</option>
            </select>
          </div>
        </div>
      </div>`;
  }

  function _bindFilterEvents() {
    const bar = document.getElementById('dirFilterBar');
    if (!bar) return;

    function _read() {
      dirFilterState.country   = document.getElementById('dirFbCountry')?.value || 'all';
      dirFilterState.continent = document.getElementById('dirFbContinent')?.value || 'all';
      dirFilterState.sort      = document.getElementById('dirFbSort')?.value || 'dist';
      /* When the continent narrows, re-rebuild the country list so it
         only shows countries within the selected continent — much less
         noisy than 100+ countries. */
      _refreshCountryDropdown();
      _renderGrid();
    }

    bar.addEventListener('change', _read);
  }

  /**
   * Narrows the country dropdown to countries within the currently
   * selected continent. When continent is "all", restores the full list.
   */
  function _refreshCountryDropdown() {
    const countrySel = document.getElementById('dirFbCountry');
    if (!countrySel) return;
    const cont = dirFilterState.continent || 'all';

    const allCountries = [...new Set(dirRawDestinations.map(d => d.country))].sort();
    const visibleCountries = cont === 'all'
      ? allCountries
      : allCountries.filter(c => CONTINENT_BY_COUNTRY[c] === cont);

    const prevSelected = countrySel.value;
    const stillValid = visibleCountries.includes(prevSelected);

    const opts = visibleCountries.map(c =>
      `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    countrySel.innerHTML = `<option value="all">${t('direct_filter_all')}</option>${opts}`;
    countrySel.value = stillValid ? prevSelected : 'all';
    if (!stillValid) dirFilterState.country = 'all';
  }

  function _renderGrid() {
    const grid = document.getElementById('dirGrid');
    if (!grid) return;

    const { country, continent, sort } = dirFilterState;

    let list = dirRawDestinations.filter(d => {
      if (country !== 'all' && d.country !== country) return false;
      if (continent && continent !== 'all'
          && CONTINENT_BY_COUNTRY[d.country] !== continent) return false;
      return true;
    });

    switch (sort) {
      case 'dist':
        list = list.slice().sort((a, b) => {
          const da = a.distanceKm ?? Infinity;
          const db = b.distanceKm ?? Infinity;
          return da - db;
        });
        break;
      case 'city':
        list = list.slice().sort((a, b) => a.city.localeCompare(b.city));
        break;
      case 'country':
        list = list.slice().sort((a, b) =>
          a.country.localeCompare(b.country) || a.city.localeCompare(b.city)
        );
        break;
    }

    if (!list.length) {
      grid.innerHTML =
        `<div class="results-placeholder"><span class="placeholder-icon">🔍</span>` +
        `${t('no_match_filters')}</div>`;
      return;
    }

    grid.innerHTML = list.map(_renderCard).join('');
    _bindCardEvents(grid);
  }

  function _renderCard(d) {
    const distStr = d.distanceKm != null ? t('direct_km', d.distanceKm) : '';
    const fromLabel = d.fromIata !== dirOriginIata ? ` · ${escapeHtml(d.fromIata)}` : '';
    return `
      <div class="dir-card" data-dst="${escapeHtml(d.iata)}" data-from="${escapeHtml(d.fromIata)}">
        <div class="dir-card-head">
          <span class="dir-iata">${escapeHtml(d.iata)}</span>
          <span class="dir-city">${escapeHtml(d.city)}</span>
          <span class="dir-country" title="${escapeHtml(d.country)}">${escapeHtml(d.country)}</span>
        </div>
        <div class="dir-card-meta">
          <span class="dir-name">${escapeHtml(d.name)}</span>
          ${distStr ? `<span class="dir-dist">${distStr}${fromLabel}</span>` : ''}
        </div>
        <div class="dir-card-actions">
          <button type="button" class="dir-search-btn"
                  data-from="${escapeHtml(d.fromIata)}" data-to="${escapeHtml(d.iata)}"
                  title="${t('direct_btn_search_title')}">${t('direct_btn_search_flights')}</button>
        </div>
      </div>`;
  }

  function _bindCardEvents(grid) {
    grid.querySelectorAll('.dir-search-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const from = btn.dataset.from;
        const to   = btn.dataset.to;
        if (!from || !to) return;
        /* Pre-fill the main search form and switch to it */
        if (typeof selectorFrom !== 'undefined' && typeof selectorTo !== 'undefined') {
          selectorFrom.setSelected([from]);
          selectorTo.setSelected([to]);
          document.querySelector('[data-tab="search"]')?.click();
          /* Scroll the main form into view */
          document.getElementById('selectorFrom')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });
    });
  }

  /* ═══════════════════════════════════════════
     LANGUAGE CHANGE
  ═══════════════════════════════════════════ */
  onLangChange(() => {
    if (dirRawDestinations.length && document.getElementById('dirGrid')) {
      const origins = dirSelectorFrom.getSelected();
      _renderResults(origins);
    }
  });

})();
