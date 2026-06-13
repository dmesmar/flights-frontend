/* -------------------------------------------
   SURPRISE ME — Feature #13
   Given an origin (and optionally a continent), pick a random
   reachable destination (preferring high-importance airports).
   The user can keep "re-rolling" until they like the suggestion.

   Depends on: AIRPORTS, IATA_ROUTES, AIRPORT_COORDS,
   airportInfo/escapeHtml (render.js), getAirportDistance (geo.js),
   i18n.js, createAirportSelector (app.js), isAirportAllowed.
------------------------------------------- */

(function initSurprise() {

  /* Lightweight continent map by country prefix.
     Covers the common ones; falls back to "AS" for unknown Asia-ish codes etc. */
  const CONTINENT_BY_COUNTRY = {
    /* Europe */
    EU: new Set(['AD','AL','AT','BA','BE','BG','BY','CH','CY','CZ','DE','DK','EE','ES','FI','FO','FR','GB','GG','GI','GR','HR','HU','IE','IM','IS','IT','JE','LI','LT','LU','LV','MC','MD','ME','MK','MT','NL','NO','PL','PT','RO','RS','SE','SI','SK','SM','TR','UA','VA','XK','RU']),
    /* Americas */
    AM: new Set(['AG','AI','AR','AW','BB','BL','BM','BO','BR','BS','BZ','CA','CL','CO','CR','CU','CW','DM','DO','EC','FK','GD','GF','GL','GP','GT','GY','HN','HT','JM','KN','KY','LC','MF','MQ','MS','MX','NI','PA','PE','PR','PY','SR','SV','SX','TC','TT','US','UY','VC','VE','VG','VI']),
    /* Asia */
    AS: new Set(['AE','AF','AM','AZ','BD','BH','BN','BT','CN','GE','HK','ID','IL','IN','IQ','IR','JO','JP','KG','KH','KP','KR','KW','KZ','LA','LB','LK','MM','MN','MO','MV','MY','NP','OM','PH','PK','PS','QA','SA','SG','SY','TH','TJ','TL','TM','TW','UZ','VN','YE']),
    /* Africa */
    AF: new Set(['AO','BF','BI','BJ','BW','CD','CF','CG','CI','CM','CV','DJ','DZ','EG','EH','ER','ET','GA','GH','GM','GN','GQ','GW','KE','KM','LR','LS','LY','MA','MG','ML','MR','MU','MW','MZ','NA','NE','NG','RE','RW','SC','SD','SH','SL','SN','SO','SS','ST','SZ','TD','TG','TN','TZ','UG','YT','ZA','ZM','ZW']),
    /* Oceania */
    OC: new Set(['AS','AU','CK','FJ','FM','GU','KI','MH','MP','NC','NF','NR','NU','NZ','PF','PG','PN','PW','SB','TK','TO','TV','VU','WF','WS']),
  };

  function inContinent(country, code) {
    const s = CONTINENT_BY_COUNTRY[code];
    return s ? s.has(country) : false;
  }

  /* ── Origin selector ── */
  const surSelectorFrom = createAirportSelector(
    document.getElementById('surSelectorFrom'),
    document.getElementById('surTagsFrom')
  );
  surSelectorFrom.setGetAllowed(isAirportAllowed);

  document.addEventListener('showAllAirportsChanged', () => {
    surSelectorFrom.setGetAllowed(isAirportAllowed);
    surSelectorFrom.clearDisallowed?.();
    surSelectorFrom.refresh?.();
  });

  /* ── State ── */
  let lastSuggestion = null;
  let lastOrigin     = null;

  /* ── Submit ── */
  document.getElementById('surpriseForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const origins = surSelectorFrom.getSelected();
    if (!origins.length) {
      alert(t('surprise_alert_origin'));
      return;
    }
    lastOrigin = origins[0];
    _rollAndRender();
  });

  function _candidatePool() {
    if (!lastOrigin) return [];
    const continent = document.getElementById('surContinent')?.value || 'all';

    /* Gather reachable destinations (direct routes from IATA_ROUTES) */
    const routes = (typeof IATA_ROUTES !== 'undefined' && IATA_ROUTES[lastOrigin]) || [];
    const pool = [];
    for (const iata of routes) {
      const ap = AIRPORTS.find(a => a.iata === iata);
      if (!ap) continue;
      /* Importance filter — only major airports (≥3) for nicer surprises */
      if ((ap.importance || 1) < 3) continue;
      if (continent !== 'all' && !inContinent(ap.country, continent)) continue;
      pool.push(ap);
    }
    return pool;
  }

  function _rollAndRender() {
    const pool = _candidatePool();
    const el = document.getElementById('surResults');
    if (!pool.length) {
      el.innerHTML = `
        <div class="results-placeholder">
          <span class="placeholder-icon">🎲</span>
          <span>${t('surprise_no_match')}</span>
        </div>`;
      return;
    }

    /* Pick a random one, avoiding immediate repeat */
    let pick;
    do { pick = pool[Math.floor(Math.random() * pool.length)]; }
    while (pool.length > 1 && lastSuggestion && pick.iata === lastSuggestion.iata);
    lastSuggestion = pick;

    const dist = (typeof getAirportDistance === 'function')
      ? getAirportDistance(lastOrigin, pick.iata)
      : null;
    const distStr = dist != null ? t('surprise_distance', Math.round(dist)) : '';
    const oriInfo = airportInfo(lastOrigin);

    el.innerHTML = `
      <div class="surprise-card">
        <div class="surprise-intro">${t('surprise_intro')}</div>
        <div class="surprise-destination">
          <div class="surprise-iata">${escapeHtml(pick.iata)}</div>
          <div class="surprise-city">${escapeHtml(pick.city)}</div>
          <div class="surprise-country">${escapeHtml(pick.country)}</div>
        </div>
        <div class="surprise-meta">
          <span class="surprise-name">${escapeHtml(pick.name)}</span>
          ${distStr ? `<span class="surprise-distance">${distStr}</span>` : ''}
          <span class="surprise-from">${escapeHtml(lastOrigin)} · ${escapeHtml(oriInfo.city)}</span>
        </div>
        <div class="surprise-actions">
          <button type="button" class="btn-import" id="surBtnAgain">${t('surprise_btn_again')}</button>
          <button type="button" class="btn-search" id="surBtnSearch">${t('surprise_btn_search')}</button>
        </div>
      </div>`;

    document.getElementById('surBtnAgain')?.addEventListener('click', _rollAndRender);
    document.getElementById('surBtnSearch')?.addEventListener('click', () => {
      if (typeof selectorFrom !== 'undefined' && typeof selectorTo !== 'undefined') {
        selectorFrom.setSelected([lastOrigin]);
        selectorTo.setSelected([pick.iata]);
        document.querySelector('[data-tab="search"]')?.click();
        document.getElementById('selectorFrom')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
  }

  /* ── Language change ── */
  if (typeof onLangChange === 'function') {
    onLangChange(() => {
      if (lastSuggestion && document.getElementById('surResults')?.children.length) {
        /* Re-render without rolling again */
        const tmp = lastSuggestion; lastSuggestion = null;
        const el  = document.getElementById('surResults');
        el.innerHTML = '';
        lastSuggestion = tmp;
        /* Easiest path: re-trigger render with the same pick */
        const oriInfo = airportInfo(lastOrigin);
        const dist = (typeof getAirportDistance === 'function')
          ? getAirportDistance(lastOrigin, tmp.iata)
          : null;
        const distStr = dist != null ? t('surprise_distance', Math.round(dist)) : '';
        el.innerHTML = `
          <div class="surprise-card">
            <div class="surprise-intro">${t('surprise_intro')}</div>
            <div class="surprise-destination">
              <div class="surprise-iata">${escapeHtml(tmp.iata)}</div>
              <div class="surprise-city">${escapeHtml(tmp.city)}</div>
              <div class="surprise-country">${escapeHtml(tmp.country)}</div>
            </div>
            <div class="surprise-meta">
              <span class="surprise-name">${escapeHtml(tmp.name)}</span>
              ${distStr ? `<span class="surprise-distance">${distStr}</span>` : ''}
              <span class="surprise-from">${escapeHtml(lastOrigin)} · ${escapeHtml(oriInfo.city)}</span>
            </div>
            <div class="surprise-actions">
              <button type="button" class="btn-import" id="surBtnAgain">${t('surprise_btn_again')}</button>
              <button type="button" class="btn-search" id="surBtnSearch">${t('surprise_btn_search')}</button>
            </div>
          </div>`;
        document.getElementById('surBtnAgain')?.addEventListener('click', _rollAndRender);
        document.getElementById('surBtnSearch')?.addEventListener('click', () => {
          selectorFrom.setSelected([lastOrigin]);
          selectorTo.setSelected([tmp.iata]);
          document.querySelector('[data-tab="search"]')?.click();
        });
      }
    });
  }
})();
