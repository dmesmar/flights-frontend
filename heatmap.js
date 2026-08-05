/* -------------------------------------------
   PRICE HEATMAP — Feature #1
   Triggers one wide /api/search across a whole month for one or
   more routes, then renders a calendar grid colored by the minimum
   price per day. One card per ORI→DST pair.

   New in this version:
     • Scale toggle — per-route (default) or shared absolute scale.
       Shared scale makes price differences BETWEEN routes obvious.
     • Diff view — when exactly 2 routes are present, generates a
       third card painting the price delta day-by-day (positive = the
       2nd route is cheaper).
     • Synchronised hover — highlighting a day on one card highlights
       the same day on every other card.
     • Budget threshold — input lets the user mark a max budget;
       cells under that price get a glowing border.

   Depends on: createAirportSelector + isAirportAllowed + executeSearch
   (app.js), parsePrice + parseDateYMD + renderSpinner + renderError
   (render.js), i18n.js.
------------------------------------------- */

(function initHeatmap() {

  /* ── Airport selectors ── */
  const hmSelectorFrom = createAirportSelector(
    document.getElementById('hmSelectorFrom'),
    document.getElementById('hmTagsFrom')
  );
  const hmSelectorTo = createAirportSelector(
    document.getElementById('hmSelectorTo'),
    document.getElementById('hmTagsTo')
  );
  hmSelectorFrom.setGetAllowed(isAirportAllowed);
  hmSelectorTo.setGetAllowed(isAirportAllowed);

  document.addEventListener('showAllAirportsChanged', () => {
    [hmSelectorFrom, hmSelectorTo].forEach(s => {
      s.setGetAllowed(isAirportAllowed);
      s.clearDisallowed?.();
      s.refresh?.();
    });
  });

  /* ── Module state — persisted between renders so the toolbar
        toggles can re-render without losing the data ── */
  let hmStateMonths   = null;   // array of {year, month} in the range
  let hmStateRoutes   = null;   // sorted array of route objects
  let hmStateFrom     = [];
  let hmStateTo       = [];
  let hmStateScaleAbs = false;  // false = per-route, true = shared
  let hmStateDiffOn   = false;  // diff card on/off (requires routes.length === 2)
  let hmStateBudget   = null;   // number or null

  /* ── Month/Year selectors (rango: mes desde / mes hasta) ── */
  const monthSelFrom = document.getElementById('hmMonthFrom');
  const monthSelTo   = document.getElementById('hmMonthTo');
  const yearSelFrom  = document.getElementById('hmYearFrom');
  const yearSelTo    = document.getElementById('hmYearTo');
  // Blindaje: si el HTML servido no tiene los IDs nuevos (caché rara, versión
  // vieja de index.html), no revientes la IIFE — los selectores de aeropuerto
  // ya están cableados arriba y deben seguir funcionando.
  if (!monthSelFrom || !monthSelTo || !yearSelFrom || !yearSelTo) {
    console.warn('[heatmap] Month/year selectors missing; range picker disabled. Refresh with cache clear.');
    return;
  }
  const now = new Date();
  function _monthName(m) {
    const locale = t('locale_tag') || 'es';
    const name = new Date(2000, m, 1).toLocaleString(locale, { month: 'long' });
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  function _fillMonthSel(sel, defMonth) {
    for (let m = 0; m < 12; m++) {
      const o = document.createElement('option');
      o.value = String(m);
      o.textContent = _monthName(m);
      if (m === defMonth) o.selected = true;
      sel.appendChild(o);
    }
  }
  function _fillYearSel(sel, defYear) {
    for (let y = now.getFullYear(); y <= now.getFullYear() + 2; y++) {
      const o = document.createElement('option');
      o.value = String(y);
      o.textContent = String(y);
      if (y === defYear) o.selected = true;
      sel.appendChild(o);
    }
  }
  _fillMonthSel(monthSelFrom, now.getMonth());
  _fillMonthSel(monthSelTo,   now.getMonth());
  _fillYearSel(yearSelFrom,   now.getFullYear());
  _fillYearSel(yearSelTo,     now.getFullYear());

  /* Utilidad: lista {year,month} en el rango [from, to] inclusive.
     Si el rango es inválido (to < from), devuelve sólo el from. */
  function _monthRange(yFrom, mFrom, yTo, mTo) {
    const out = [];
    let y = yFrom, m = mFrom;
    let steps = 0;                  // guard: máx 36 meses (cubre currentYear → +2 años entero)
    while ((y < yTo || (y === yTo && m <= mTo)) && steps < 36) {
      out.push({ year: y, month: m });
      m++;
      if (m > 11) { m = 0; y++; }
      steps++;
    }
    return out.length ? out : [{ year: yFrom, month: mFrom }];
  }

  /* ── Submit ── */
  document.getElementById('heatmapForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const from = hmSelectorFrom.getSelected();
    const to   = hmSelectorTo.getSelected();
    if (!from.length || !to.length) {
      alert(t('heatmap_alert_route'));
      return;
    }
    const monthFrom = parseInt(monthSelFrom.value);
    const yearFrom  = parseInt(yearSelFrom.value);
    const monthTo   = parseInt(monthSelTo.value);
    const yearTo    = parseInt(yearSelTo.value);
    // Rango inclusivo. Si el usuario invierte "hasta" antes que "desde", avisamos.
    if (yearTo < yearFrom || (yearTo === yearFrom && monthTo < monthFrom)) {
      alert(t('heatmap_alert_range') || 'El mes final no puede ser anterior al mes de inicio.');
      return;
    }
    const monthsRange = _monthRange(yearFrom, monthFrom, yearTo, monthTo);
    const firstDay = new Date(yearFrom, monthFrom, 1);
    const lastDay  = new Date(yearTo, monthTo + 1, 0);
    const fmt = d => `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;

    const submitBtn = document.getElementById('hmSubmitBtn');
    const resultsEl = document.getElementById('hmResults');

    submitBtn.disabled    = true;
    submitBtn.textContent = t('heatmap_loading');

    const allRoutes = from.flatMap(f => to.map(d => `${f} → ${d}`));
    resultsEl.innerHTML = renderSpinner(allRoutes);

    const controller = new AbortController();
    resultsEl.querySelector('#searchCancelBtn')?.addEventListener('click',
      () => controller.abort(), { once: true });

    const payload = {
      search_id:    crypto.randomUUID(),
      fecha_ini:    fmt(firstDay),
      fecha_fin:    fmt(lastDay),
      airport_from: from,
      airport_to:   to,
      max_stops:    0,
      max_results:  5,
    };

    try {
      const { data } = await executeSearch(payload, resultsEl, controller, { showTimer: true, showEta: true });
      if (!data.vuelos?.length) {
        resultsEl.innerHTML = `<div class="results-placeholder"><span class="placeholder-icon">🗓️</span>${t('heatmap_no_data')}</div>`;
        return;
      }

      /* Group flights by route */
      const byRoute = new Map();  // "ORI→DST" → { ori, dst, byDay }
      for (const v of data.vuelos) {
        if (!v.origen || !v.destino) continue;
        const d = parseDateYMD(v.fecha);
        if (!d || isNaN(d.getTime())) continue;
        const p = parsePrice(v.precio);
        if (!p || p <= 0) continue;

        const routeKey = `${v.origen}→${v.destino}`;
        let route = byRoute.get(routeKey);
        if (!route) {
          route = { ori: v.origen, dst: v.destino, byDay: new Map() };
          byRoute.set(routeKey, route);
        }
        const dayKey = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const prev = route.byDay.get(dayKey);
        if (!prev) route.byDay.set(dayKey, { min: p, count: 1 });
        else { prev.count++; if (p < prev.min) prev.min = p; }
      }

      if (!byRoute.size) {
        resultsEl.innerHTML = `<div class="results-placeholder"><span class="placeholder-icon">🗓️</span>${t('heatmap_no_data')}</div>`;
        return;
      }

      /* Persist state for toolbar interactions */
      hmStateMonths = monthsRange;
      hmStateFrom   = from;
      hmStateTo     = to;
      hmStateRoutes = [...byRoute.values()]
        .map(r => ({
          ...r,
          overallMin: Math.min(...[...r.byDay.values()].map(d => d.min)),
        }))
        .sort((a, b) => a.overallMin - b.overallMin);
      /* Diff card OFF por defecto — el usuario la activa desde la toolbar. */
      hmStateDiffOn = false;

      _renderResults();
    } catch (err) {
      if (err.name === 'AbortError') {
        resultsEl.innerHTML = renderError(t('search_cancelled'));
      } else {
        resultsEl.innerHTML = renderError(err.isApiError ? err.message : t('conn_error_full'));
      }
    } finally {
      submitBtn.disabled    = false;
      submitBtn.textContent = t('heatmap_btn');
    }
  });

  /* ═══════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════ */
  function _renderResults() {
    if (!hmStateRoutes || !hmStateMonths?.length) return;
    const resultsEl = document.getElementById('hmResults');

    const locale = t('locale_tag') || 'es';
    const first  = hmStateMonths[0];
    const last   = hmStateMonths[hmStateMonths.length - 1];
    const firstLabel = new Date(first.year, first.month, 1)
      .toLocaleString(locale, { month: 'long', year: 'numeric' });
    const lastLabel  = new Date(last.year, last.month, 1)
      .toLocaleString(locale, { month: 'long', year: 'numeric' });
    const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
    const rangeCap = hmStateMonths.length === 1
      ? cap(firstLabel)
      : `${cap(firstLabel)} → ${cap(lastLabel)}`;

    /* Global lo/hi across ALL routes (used when scale is shared) */
    let globalLo = Infinity, globalHi = -Infinity;
    for (const r of hmStateRoutes) {
      for (const v of r.byDay.values()) {
        if (v.min < globalLo) globalLo = v.min;
        if (v.min > globalHi) globalHi = v.min;
      }
    }

    const canDiff = hmStateRoutes.length === 2;

    const headerHtml = `
      <div class="hm-results-header">
        <div class="hm-results-header-row">
          <h3 class="hm-month-title">${escapeHtml(rangeCap)}</h3>
          <button type="button" class="hm-share-btn" id="hmShareBtn" title="${t('share_btn_title')}">${t('share_btn')}</button>
        </div>
        ${hmStateRoutes.length > 1
          ? `<div class="hm-results-summary">${t('heatmap_routes_count', hmStateRoutes.length)}</div>`
          : ''}
        <div class="hm-toolbar">
          <div class="hm-tb-group">
            <span class="hm-tb-label">${t('heatmap_tb_scale')}</span>
            <div class="hm-tb-toggle">
              <button type="button" class="hm-tb-toggle-btn${!hmStateScaleAbs ? ' is-active' : ''}"
                      data-scale="rel">${t('heatmap_tb_scale_rel')}</button>
              <button type="button" class="hm-tb-toggle-btn${ hmStateScaleAbs ? ' is-active' : ''}"
                      data-scale="abs">${t('heatmap_tb_scale_abs')}</button>
            </div>
          </div>
          ${canDiff ? `
            <div class="hm-tb-group">
              <label class="hm-tb-check">
                <input type="checkbox" id="hmTbDiff"${hmStateDiffOn ? ' checked' : ''}/>
                <span>${t('heatmap_tb_diff')}</span>
              </label>
            </div>` : ''}
          <div class="hm-tb-group">
            <label class="hm-tb-label" for="hmTbBudget">${t('heatmap_tb_budget')}</label>
            <input type="number" id="hmTbBudget" class="hm-tb-budget"
                   min="0" step="5" placeholder="€"
                   value="${hmStateBudget != null ? hmStateBudget : ''}"/>
          </div>
        </div>
      </div>`;

    /* Un card por (mes × ruta). Si hay 2 rutas y el usuario tiene el diff
       activado, se añade también un card diff por mes. */
    const cardsHtml = hmStateMonths.map(({year, month}) => {
      const routeCards = hmStateRoutes.map(r =>
        _buildCalendarCardHtml(year, month, r.byDay, r.ori, r.dst,
          hmStateScaleAbs ? globalLo : null,
          hmStateScaleAbs ? globalHi : null,
          hmStateBudget)
      ).join('');
      const diffCard = (canDiff && hmStateDiffOn)
        ? _buildDiffCardHtml(year, month, hmStateRoutes[0], hmStateRoutes[1])
        : '';
      return routeCards + diffCard;
    }).join('');

    resultsEl.innerHTML = headerHtml + `<div class="hm-cards-grid">${cardsHtml}</div>`;

    /* Share button */
    document.getElementById('hmShareBtn')?.addEventListener('click', async () => {
      if (typeof window.copyShareUrl !== 'function') return;
      const params = {
        kind:      'heatmap',
        from:      hmStateFrom,
        to:        hmStateTo,
        monthFrom: hmStateMonths[0].month,
        yearFrom:  hmStateMonths[0].year,
        monthTo:   hmStateMonths[hmStateMonths.length - 1].month,
        yearTo:    hmStateMonths[hmStateMonths.length - 1].year,
      };
      const ok = await window.copyShareUrl(params);
      const btn = document.getElementById('hmShareBtn');
      if (ok && btn) {
        const orig = btn.textContent;
        btn.textContent = t('share_copied');
        btn.disabled = true;
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2200);
      }
    });

    /* Toolbar: scale toggle */
    resultsEl.querySelectorAll('.hm-tb-toggle-btn[data-scale]').forEach(b => {
      b.addEventListener('click', () => {
        hmStateScaleAbs = b.dataset.scale === 'abs';
        _renderResults();
      });
    });
    /* Toolbar: diff checkbox */
    document.getElementById('hmTbDiff')?.addEventListener('change', e => {
      hmStateDiffOn = e.target.checked;
      _renderResults();
    });
    /* Toolbar: budget input — debounce so typing doesn't thrash */
    let budgetTimer = null;
    document.getElementById('hmTbBudget')?.addEventListener('input', e => {
      clearTimeout(budgetTimer);
      const v = parseFloat(e.target.value);
      budgetTimer = setTimeout(() => {
        hmStateBudget = Number.isFinite(v) && v > 0 ? v : null;
        _renderResults();
      }, 350);
    });

    /* Per-cell click → open the main search at that date / route */
    resultsEl.querySelectorAll('.hm-card').forEach(card => {
      const ori = card.dataset.ori;
      const dst = card.dataset.dst;
      if (!ori || !dst) return;   /* skip diff cards */
      card.querySelectorAll('.hm-cell-day[data-date]').forEach(c => {
        c.addEventListener('click', () => {
          const d = c.dataset.date;
          if (!d) return;
          if (typeof selectorFrom !== 'undefined' && typeof selectorTo !== 'undefined') {
            selectorFrom.setSelected([ori]);
            selectorTo.setSelected([dst]);
            const ini = document.getElementById('fechaIni');
            const fin = document.getElementById('fechaFin');
            if (ini) ini.value = d;
            if (fin) fin.value = d;
            document.querySelector('[data-tab="search"]')?.click();
            document.getElementById('selectorFrom')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        });
      });
    });

    /* Sync hover — when the user hovers a cell on ANY card, every cell
       with the same date across ALL cards gets the .hm-cell-sync class.
       This works for the diff card too (it has data-date on its cells). */
    resultsEl.querySelectorAll('.hm-cell-day[data-date]').forEach(c => {
      c.addEventListener('mouseenter', () => {
        const d = c.dataset.date;
        if (!d) return;
        resultsEl.querySelectorAll(`.hm-cell-day[data-date="${CSS.escape(d)}"]`)
          .forEach(s => s.classList.add('hm-cell-sync'));
      });
      c.addEventListener('mouseleave', () => {
        resultsEl.querySelectorAll('.hm-cell-sync').forEach(s =>
          s.classList.remove('hm-cell-sync'));
      });
    });
  }

  /**
   * Builds one calendar card. When scaleLo/scaleHi are non-null the
   * shared (absolute) color scale is used; otherwise each card uses
   * its own local lo/hi (relative scale).
   * `budget`: when set, cells with price ≤ budget get an under-budget
   * border highlight.
   */
  function _buildCalendarCardHtml(year, month, byDay, oriIata, dstIata,
                                  scaleLo, scaleHi, budget) {
    const firstDay    = new Date(year, month, 1);
    const lastDay     = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    const localMins = [...byDay.values()].map(v => v.min);
    const lo = scaleLo != null ? scaleLo : Math.min(...localMins);
    const hi = scaleHi != null ? scaleHi : Math.max(...localMins);
    function colorFor(price) {
      if (lo === hi) return 'hsl(135 70% 40%)';
      const tx = Math.max(0, Math.min(1, (price - lo) / (hi - lo)));
      const hue = 135 - tx * 127;
      return `hsl(${Math.round(hue)} 65% 42%)`;
    }

    const weekdayNames  = t('weekdays');
    const weekdayHeader = [1,2,3,4,5,6,0]
      .map(i => `<div class="hm-cell hm-cell-header">${weekdayNames[i]}</div>`)
      .join('');

    const firstWeekday  = firstDay.getDay();
    const leadingBlanks = (firstWeekday + 6) % 7;

    const cells = [];
    for (let i = 0; i < leadingBlanks; i++) {
      cells.push(`<div class="hm-cell hm-cell-blank"></div>`);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const entry = byDay.get(key);
      const dateStr = `${String(day).padStart(2,'0')}/${String(month+1).padStart(2,'0')}/${year}`;
      if (entry) {
        const color = colorFor(entry.min);
        const fmt = entry.min.toFixed(2).replace('.', ',') + ' €';
        const underBudget = (budget != null && entry.min <= budget) ? ' hm-cell-under-budget' : '';
        cells.push(`
          <div class="hm-cell hm-cell-day${underBudget}" style="background:${color}"
               data-date="${key}"
               title="${escapeHtml(t('heatmap_cell_tooltip', dateStr, fmt, entry.count))}">
            <span class="hm-day-num">${day}</span>
            <span class="hm-day-price">${fmt}</span>
          </div>`);
      } else {
        cells.push(`
          <div class="hm-cell hm-cell-day hm-cell-empty"
               data-date="${key}"
               title="${escapeHtml(t('heatmap_cell_empty', dateStr))}">
            <span class="hm-day-num">${day}</span>
          </div>`);
      }
    }

    const scaleHint = (scaleLo != null)
      ? `<span class="hm-scale-hint hm-scale-hint-abs">${t('heatmap_tb_scale_abs_hint')}</span>`
      : '';

    const monthTag = new Date(year, month, 1)
      .toLocaleString(t('locale_tag') || 'es', { month: 'short', year: 'numeric' });
    return `
      <div class="hm-card" data-ori="${escapeHtml(oriIata)}" data-dst="${escapeHtml(dstIata)}">
        <div class="hm-card-head">
          <span class="hm-route">${escapeHtml(oriIata)} → ${escapeHtml(dstIata)} <span class="hm-card-month">· ${escapeHtml(monthTag)}</span></span>
          ${scaleHint}
        </div>
        <div class="hm-grid">
          ${weekdayHeader}
          ${cells.join('')}
        </div>
        <div class="hm-legend">
          <span class="hm-legend-label">${t('heatmap_legend_cheap')}</span>
          <span class="hm-legend-gradient"></span>
          <span class="hm-legend-label">${t('heatmap_legend_pricey')}</span>
          <span class="hm-legend-sep">·</span>
          <span class="hm-legend-empty-swatch"></span>
          <span class="hm-legend-label">${t('heatmap_legend_none')}</span>
        </div>
      </div>`;
  }

  /**
   * Builds the diff card for routes A vs B. Each cell shows the
   * difference (B − A) in €. Positive values = route B is more
   * expensive (painted red); negative = B is cheaper (painted green).
   * Days where one route has no data are marked empty.
   */
  function _buildDiffCardHtml(year, month, routeA, routeB) {
    const firstDay    = new Date(year, month, 1);
    const lastDay     = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();

    /* Collect all diffs and find symmetric scale */
    const diffsByKey = new Map();
    let absMax = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const a = routeA.byDay.get(key);
      const b = routeB.byDay.get(key);
      if (a && b) {
        const diff = b.min - a.min;
        diffsByKey.set(key, diff);
        if (Math.abs(diff) > absMax) absMax = Math.abs(diff);
      }
    }
    if (!diffsByKey.size) return '';

    function colorFor(diff) {
      if (absMax === 0) return 'hsl(0 0% 50%)';
      const tx = Math.max(-1, Math.min(1, diff / absMax));
      if (tx >= 0) {
        /* B more expensive → red */
        const lit = 45 - tx * 8;
        const sat = 30 + tx * 40;
        return `hsl(8 ${sat}% ${lit}%)`;
      }
      /* B cheaper → green */
      const tnorm = -tx;
      const lit = 45 - tnorm * 8;
      const sat = 30 + tnorm * 40;
      return `hsl(135 ${sat}% ${lit}%)`;
    }

    const weekdayNames  = t('weekdays');
    const weekdayHeader = [1,2,3,4,5,6,0]
      .map(i => `<div class="hm-cell hm-cell-header">${weekdayNames[i]}</div>`)
      .join('');

    const firstWeekday  = firstDay.getDay();
    const leadingBlanks = (firstWeekday + 6) % 7;

    const cells = [];
    for (let i = 0; i < leadingBlanks; i++) {
      cells.push(`<div class="hm-cell hm-cell-blank"></div>`);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const key = `${year}-${String(month+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const dateStr = `${String(day).padStart(2,'0')}/${String(month+1).padStart(2,'0')}/${year}`;
      const diff = diffsByKey.get(key);
      if (diff == null) {
        cells.push(`
          <div class="hm-cell hm-cell-day hm-cell-empty" data-date="${key}"
               title="${escapeHtml(t('heatmap_cell_empty', dateStr))}">
            <span class="hm-day-num">${day}</span>
          </div>`);
      } else {
        const sign  = diff > 0 ? '+' : (diff < 0 ? '−' : '');
        const fmt   = `${sign}${Math.abs(diff).toFixed(0)} €`;
        const tip   = t('heatmap_diff_cell_tooltip', dateStr, fmt,
                       `${routeA.ori}→${routeA.dst}`,
                       `${routeB.ori}→${routeB.dst}`);
        cells.push(`
          <div class="hm-cell hm-cell-day hm-cell-diff" style="background:${colorFor(diff)}"
               data-date="${key}"
               title="${escapeHtml(tip)}">
            <span class="hm-day-num">${day}</span>
            <span class="hm-day-price">${fmt}</span>
          </div>`);
      }
    }

    const routeA_lbl = `${routeA.ori}→${routeA.dst}`;
    const routeB_lbl = `${routeB.ori}→${routeB.dst}`;
    const monthTag = new Date(year, month, 1)
      .toLocaleString(t('locale_tag') || 'es', { month: 'short', year: 'numeric' });
    return `
      <div class="hm-card hm-card-diff">
        <div class="hm-card-head">
          <span class="hm-route">${t('heatmap_diff_title')} <span class="hm-card-month">· ${escapeHtml(monthTag)}</span></span>
          <span class="hm-scale-hint">${escapeHtml(routeB_lbl)} − ${escapeHtml(routeA_lbl)}</span>
        </div>
        <div class="hm-grid">
          ${weekdayHeader}
          ${cells.join('')}
        </div>
        <div class="hm-legend">
          <span class="hm-legend-label">${t('heatmap_diff_legend_b_cheaper')}</span>
          <span class="hm-legend-gradient hm-legend-gradient-diff"></span>
          <span class="hm-legend-label">${t('heatmap_diff_legend_a_cheaper')}</span>
        </div>
      </div>`;
  }
})();
