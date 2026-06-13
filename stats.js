/* -------------------------------------------
   STATS DASHBOARD — Feature #22
   Renders a compact dashboard at the top of the Saved tab.
   Pure analysis over localStorage data.

   Depends on: chollo.js (buildPriceHistory), saved.js,
   express.js, round-trip.js, i18n.js, render.js (parsePrice,
   airportInfo, escapeHtml).
------------------------------------------- */

(function initStats() {

  function safeCall(name) {
    try { return (typeof window[name] === 'function') ? window[name]() : []; }
    catch { return []; }
  }

  function computeStats() {
    const mainList   = safeCall('loadSavedSearches') || [];
    const cheapList  = safeCall('loadSavedCheapSearches') || [];
    const expressList= safeCall('loadSavedExpressRoutes') || [];
    const rtList     = safeCall('loadSavedRoundTripsList') || [];
    const flights    = safeCall('loadSaved') || [];

    const totalSearches = mainList.length + cheapList.length + expressList.length + rtList.length;
    const totalFlights  = flights.length;
    const totalTrips    = rtList.length + expressList.length;

    /* Build per-route stats from all snapshots */
    const history = (typeof window.buildPriceHistory === 'function')
      ? window.buildPriceHistory()
      : new Map();

    let bestDeal = null;
    let bestRoute = null;
    let sumAvg = 0;
    let nRoutes = 0;
    const routeCounts = []; // for sorting by popularity
    const destCounts  = new Map();

    for (const [route, entry] of history.entries()) {
      sumAvg += entry.avg;
      nRoutes++;
      routeCounts.push({ route, ...entry });
      if (bestDeal == null || entry.min < bestDeal) {
        bestDeal  = entry.min;
        bestRoute = route;
      }
      /* Tally destination counts */
      const dst = route.split('→')[1];
      destCounts.set(dst, (destCounts.get(dst) || 0) + entry.count);
    }

    const avgPrice = nRoutes > 0 ? Math.round(sumAvg / nRoutes) : 0;

    /* Top routes by occurrence count */
    const topRoutes = routeCounts
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    /* Top destinations by occurrence count */
    const topDests = [...destCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([iata, count]) => ({ iata, count }));

    return {
      totalSearches, totalFlights, totalTrips,
      routesTracked: nRoutes,
      avgPrice,
      bestDeal,
      bestRoute,
      topRoutes,
      topDests,
    };
  }

  function fmtEur(n) {
    return Math.round(n).toLocaleString() + ' €';
  }

  function _renderDashboard() {
    const container = document.getElementById('statsDashboard');
    if (!container) return;

    const s = computeStats();
    const hasAny = s.totalSearches > 0 || s.totalFlights > 0;

    if (!hasAny) {
      container.innerHTML = `
        <div class="stats-empty">
          <span class="stats-empty-icon">📊</span>
          <span>${t('stats_empty')}</span>
        </div>`;
      return;
    }

    /* Hero KPIs */
    const kpis = [
      { value: s.totalSearches,  label: t('stats_total_searches'), icon: '💾' },
      { value: s.totalTrips,     label: t('stats_total_trips'),    icon: '🌍' },
      { value: s.totalFlights,   label: t('stats_total_flights'),  icon: '✈️' },
      { value: s.routesTracked,  label: t('stats_routes_tracked'), icon: '🛫' },
    ];
    const kpisHtml = kpis.map(k => `
      <div class="stats-kpi">
        <span class="stats-kpi-icon">${k.icon}</span>
        <span class="stats-kpi-value">${k.value}</span>
        <span class="stats-kpi-label">${k.label}</span>
      </div>`).join('');

    /* Best deal banner */
    let bestDealHtml = '';
    if (s.bestDeal != null && s.bestRoute) {
      const [ori, dst] = s.bestRoute.split('→');
      const oriInfo = airportInfo(ori);
      const dstInfo = airportInfo(dst);
      bestDealHtml = `
        <div class="stats-best-deal">
          <span class="stats-best-deal-icon">⭐</span>
          <div class="stats-best-deal-body">
            <span class="stats-best-deal-label">${t('stats_best_deal')}</span>
            <span class="stats-best-deal-value">${fmtEur(s.bestDeal)}</span>
            <span class="stats-best-deal-route">${escapeHtml(ori)} → ${escapeHtml(dst)} · ${escapeHtml(oriInfo.city)} → ${escapeHtml(dstInfo.city)}</span>
          </div>
          ${s.avgPrice ? `<span class="stats-best-deal-avg">${t('stats_avg_price')}: <strong>${fmtEur(s.avgPrice)}</strong></span>` : ''}
        </div>`;
    }

    /* Top routes */
    let topRoutesHtml = '';
    if (s.topRoutes.length) {
      topRoutesHtml = `
        <div class="stats-section">
          <h3 class="stats-section-title">${t('stats_top_routes_title')}</h3>
          <div class="stats-route-list">
            ${s.topRoutes.map(r => {
              const [ori, dst] = r.route.split('→');
              return `
                <div class="stats-route-row">
                  <span class="stats-route-iatas">
                    <strong>${escapeHtml(ori)}</strong>
                    <span class="stats-route-arrow">→</span>
                    <strong>${escapeHtml(dst)}</strong>
                  </span>
                  <span class="stats-route-meta">
                    <span class="stats-route-count">${t('stats_route_count', r.count)}</span>
                    <span class="stats-route-min">${t('stats_route_min', fmtEur(r.min))}</span>
                    <span class="stats-route-avg">${t('stats_route_avg', fmtEur(r.avg))}</span>
                  </span>
                </div>`;
            }).join('')}
          </div>
        </div>`;
    }

    /* Top destinations as chips */
    let topDestsHtml = '';
    if (s.topDests.length) {
      topDestsHtml = `
        <div class="stats-section">
          <h3 class="stats-section-title">${t('stats_top_dest_title')}</h3>
          <div class="stats-dest-chips">
            ${s.topDests.map(d => {
              const info = airportInfo(d.iata);
              return `
                <span class="stats-dest-chip">
                  <span class="stats-dest-chip-iata">${escapeHtml(d.iata)}</span>
                  <span class="stats-dest-chip-city">${escapeHtml(info.city || '')}</span>
                  <span class="stats-dest-chip-count">${d.count}</span>
                </span>`;
            }).join('')}
          </div>
        </div>`;
    }

    container.innerHTML = `
      <div class="stats-dashboard">
        <div class="stats-header">
          <h2 class="stats-title">${t('stats_title')}</h2>
        </div>
        <div class="stats-kpi-grid">${kpisHtml}</div>
        ${bestDealHtml}
        ${topRoutesHtml}
        ${topDestsHtml}
      </div>`;
  }

  /* Expose so renderSavedTab() picks it up */
  window.renderStatsDashboard = _renderDashboard;

  /* Refresh on language change */
  if (typeof onLangChange === 'function') {
    onLangChange(() => {
      if (document.getElementById('statsDashboard')?.children.length) {
        _renderDashboard();
      }
    });
  }
})();
