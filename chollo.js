/* -------------------------------------------
   CHOLLO DETECTOR + PRICE HISTORY INDEX
   Feature #23. Also exposed for #22 stats.

   Scans all saved data (main searches, express, cheap, round-trip,
   saved flights) and builds a per-route price history. Exposes:
     window.buildPriceHistory()             → Map<route, {prices, min, avg, count}>
     window.checkChollo(flight, history?)   → null | {savings, pctOff, ...}
     window.getCholloRouteThreshold(route)  → null | {type, value}
     window.setCholloRouteThreshold(route, type, value)   (type: 'abs' | 'pct' | null)
     window.listCholloRouteThresholds()     → object {route → {type, value}}
     window.openCholloThresholdsModal()     → opens management UI

   The threshold system allows per-route overrides on top of the global
   default (≥20% below historical average). Overrides are persisted to
   localStorage. There are two override flavours:
     • abs:  trigger when price ≤ value €
     • pct:  trigger when price ≤ historicalAvg × (1 − value/100)
     • null: remove the override (revert to default)

   Depends on: parsePrice from render.js. UI: i18n.js (t).
------------------------------------------- */

(function initChollo() {
  const CHOLLO_DISCOUNT_DEFAULT = 0.20;   // ≥20% below historical avg
  const MIN_HISTORY             = 3;      // need ≥3 historical prices for a route
  const LS_KEY                  = 'cholloRouteThresholds';

  /* ── Threshold persistence ───────────────── */
  function _loadThresholds() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return {};
      const obj = JSON.parse(raw);
      return obj && typeof obj === 'object' ? obj : {};
    } catch { return {}; }
  }
  function _saveThresholds(obj) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(obj)); } catch {}
  }

  window.getCholloRouteThreshold = function getCholloRouteThreshold(routeKey) {
    return _loadThresholds()[routeKey] || null;
  };
  window.setCholloRouteThreshold = function setCholloRouteThreshold(routeKey, type, value) {
    const all = _loadThresholds();
    if (type === null || type === undefined) {
      delete all[routeKey];
    } else if (type === 'abs' || type === 'pct') {
      const v = Number(value);
      if (!Number.isFinite(v) || v <= 0) return;
      all[routeKey] = { type, value: v };
    } else {
      return;
    }
    _saveThresholds(all);
  };
  window.listCholloRouteThresholds = function listCholloRouteThresholds() {
    return _loadThresholds();
  };

  /* ── Price history ──────────────────────── */
  window.buildPriceHistory = function buildPriceHistory() {
    const map = new Map();

    function addFlight(v) {
      if (!v || !v.origen || !v.destino) return;
      const p = (typeof parsePrice === 'function') ? parsePrice(v.precio) : 0;
      if (!p || p <= 0) return;
      const key = `${v.origen}→${v.destino}`;
      let entry = map.get(key);
      if (!entry) {
        entry = { prices: [], min: Infinity, avg: 0, count: 0 };
        map.set(key, entry);
      }
      entry.prices.push(p);
      if (p < entry.min) entry.min = p;
      entry.count += 1;
    }

    function safeCall(name) {
      try { return (typeof window[name] === 'function') ? window[name]() : []; }
      catch { return []; }
    }

    (safeCall('loadSavedSearches')      || []).forEach(s => (s?.data?.vuelos || []).forEach(addFlight));
    (safeCall('loadSavedCheapSearches') || []).forEach(s => (s?.data?.vuelos || []).forEach(addFlight));
    (safeCall('loadSavedExpressRoutes') || []).forEach(s => {
      (s?.vuelosOut || []).forEach(addFlight);
      (s?.vuelosRet || []).forEach(addFlight);
    });
    (safeCall('loadSavedRoundTripsList') || []).forEach(s => {
      (s?.vuelosOut || []).forEach(addFlight);
      (s?.vuelosRet || []).forEach(addFlight);
    });
    (safeCall('loadSaved') || []).forEach(addFlight);

    for (const entry of map.values()) {
      entry.avg = entry.prices.reduce((s, p) => s + p, 0) / entry.prices.length;
    }
    return map;
  };

  /**
   * Returns { savings, pctOff } if the flight qualifies as a chollo
   * under either the per-route override or the global default.
   *
   * Per-route abs threshold doesn't require any history (it's a hard
   * price ceiling). Pct and default still require ≥MIN_HISTORY samples.
   */
  window.checkChollo = function checkChollo(flight, history) {
    if (!flight) return null;
    const routeKey = `${flight.origen}→${flight.destino}`;
    const override = window.getCholloRouteThreshold(routeKey);

    const p = (typeof parsePrice === 'function') ? parsePrice(flight.precio) : 0;
    if (!p || p <= 0) return null;

    /* Absolute-price ceiling — no history required */
    if (override && override.type === 'abs') {
      if (p > override.value) return null;
      const h = history || window.buildPriceHistory();
      const entry = h.get(routeKey);
      const avg = entry?.avg || override.value;
      return {
        savings: Math.max(0, Math.round(avg - p)),
        pctOff:  Math.max(0, Math.round((1 - p / avg) * 100)),
        historicalAvg: Math.round(avg),
        historicalMin: Math.round(entry?.min ?? p),
        thresholdType: 'abs',
        thresholdValue: override.value,
      };
    }

    /* For pct override or default, we need history */
    const h = history || window.buildPriceHistory();
    const entry = h.get(routeKey);
    if (!entry || entry.count < MIN_HISTORY) return null;

    const discount = (override && override.type === 'pct')
      ? Math.min(0.95, Math.max(0.01, override.value / 100))
      : CHOLLO_DISCOUNT_DEFAULT;

    if (p >= entry.avg * (1 - discount)) return null;
    return {
      savings: Math.round(entry.avg - p),
      pctOff:  Math.round((1 - p / entry.avg) * 100),
      historicalAvg: Math.round(entry.avg),
      historicalMin: Math.round(entry.min),
      thresholdType: override ? 'pct' : 'default',
      thresholdValue: override ? override.value : Math.round(CHOLLO_DISCOUNT_DEFAULT * 100),
    };
  };

  window.findChollos = function findChollos(flights) {
    const h = window.buildPriceHistory();
    const out = [];
    for (const v of flights) {
      const c = window.checkChollo(v, h);
      if (c) out.push({ flight: v, ...c });
    }
    return out;
  };

  /* ═══════════════════════════════════════════
     THRESHOLDS MANAGEMENT MODAL
  ═══════════════════════════════════════════ */
  let _modalEl = null;

  window.openCholloThresholdsModal = function openCholloThresholdsModal() {
    if (_modalEl) { _modalEl.remove(); _modalEl = null; }

    const history = window.buildPriceHistory();
    const overrides = window.listCholloRouteThresholds();
    /* Build the union of routes from both history and overrides */
    const routeSet = new Set([...history.keys(), ...Object.keys(overrides)]);
    const routes = [...routeSet].sort();

    const rows = routes.map(routeKey => {
      const entry = history.get(routeKey);
      const ov    = overrides[routeKey] || {};
      const avg   = entry ? Math.round(entry.avg) : '—';
      const min   = entry ? Math.round(entry.min) : '—';
      const count = entry ? entry.count : 0;
      const type  = ov.type || '';
      const val   = ov.value != null ? ov.value : '';
      return `
        <tr class="ct-row" data-route="${escapeHtml(routeKey)}">
          <td class="ct-route">${escapeHtml(routeKey)}</td>
          <td class="ct-hist">${count > 0 ? `${avg} € · min ${min} € · n=${count}` : t('chollo_no_history')}</td>
          <td class="ct-type">
            <select class="ct-type-sel">
              <option value=""${type === ''    ? ' selected' : ''}>${t('chollo_threshold_default')}</option>
              <option value="abs"${type === 'abs' ? ' selected' : ''}>${t('chollo_threshold_abs')}</option>
              <option value="pct"${type === 'pct' ? ' selected' : ''}>${t('chollo_threshold_pct')}</option>
            </select>
          </td>
          <td class="ct-value">
            <input type="number" class="ct-value-input" min="1" step="1"
                   value="${escapeHtml(String(val))}"
                   placeholder="${type === 'abs' ? '€' : type === 'pct' ? '%' : '—'}"
                   ${type === '' ? 'disabled' : ''}/>
          </td>
          <td class="ct-actions">
            <button type="button" class="ct-clear-btn" title="${t('chollo_threshold_clear_title')}">✕</button>
          </td>
        </tr>`;
    }).join('');

    const html = `
      <div class="ct-modal-backdrop" id="ctBackdrop"></div>
      <div class="ct-modal" role="dialog" aria-labelledby="ctTitle">
        <div class="ct-modal-head">
          <h3 id="ctTitle">${t('chollo_threshold_title')}</h3>
          <button type="button" class="ct-close-btn" id="ctCloseBtn" aria-label="Close">✕</button>
        </div>
        <p class="ct-modal-desc">${t('chollo_threshold_desc')}</p>
        ${routes.length === 0 ? `
          <div class="ct-empty">${t('chollo_threshold_empty')}</div>
        ` : `
          <div class="ct-table-wrap">
            <table class="ct-table">
              <thead>
                <tr>
                  <th>${t('chollo_threshold_col_route')}</th>
                  <th>${t('chollo_threshold_col_history')}</th>
                  <th>${t('chollo_threshold_col_type')}</th>
                  <th>${t('chollo_threshold_col_value')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
        `}
        <div class="ct-modal-foot">
          <button type="button" class="ct-save-btn" id="ctSaveBtn">${t('chollo_threshold_save')}</button>
        </div>
      </div>`;

    _modalEl = document.createElement('div');
    _modalEl.className = 'ct-modal-wrap';
    _modalEl.innerHTML = html;
    document.body.appendChild(_modalEl);

    /* Behaviour */
    const closeAll = () => { _modalEl?.remove(); _modalEl = null; };
    _modalEl.querySelector('#ctCloseBtn').addEventListener('click', closeAll);
    _modalEl.querySelector('#ctBackdrop').addEventListener('click', closeAll);

    /* Sync the value input enabled/disabled state with the type selector */
    _modalEl.querySelectorAll('.ct-type-sel').forEach(sel => {
      sel.addEventListener('change', () => {
        const row = sel.closest('.ct-row');
        const inp = row.querySelector('.ct-value-input');
        if (sel.value === '') { inp.disabled = true; inp.value = ''; }
        else {
          inp.disabled = false;
          inp.placeholder = sel.value === 'abs' ? '€' : '%';
        }
      });
    });

    /* Clear button → reset row */
    _modalEl.querySelectorAll('.ct-clear-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const row = btn.closest('.ct-row');
        row.querySelector('.ct-type-sel').value = '';
        const inp = row.querySelector('.ct-value-input');
        inp.disabled = true;
        inp.value = '';
      });
    });

    _modalEl.querySelector('#ctSaveBtn')?.addEventListener('click', () => {
      _modalEl.querySelectorAll('.ct-row').forEach(row => {
        const route = row.dataset.route;
        const type  = row.querySelector('.ct-type-sel').value || null;
        const value = parseFloat(row.querySelector('.ct-value-input').value);
        if (!type || !Number.isFinite(value) || value <= 0) {
          window.setCholloRouteThreshold(route, null);
        } else {
          window.setCholloRouteThreshold(route, type, value);
        }
      });
      closeAll();
    });
  };

  /* Tiny HTML escape — local to avoid hard dep on render.js for this UI */
  function escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
})();
