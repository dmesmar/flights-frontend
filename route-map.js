/* -------------------------------------------
   ROUTE MAP — Feature #16
   Renders a real-world SVG map (using files/world.svg as
   background) with airport dots and great-circle-approximating
   arcs between them. Uses a Mercator projection compatible with
   the source world.svg (viewBox 2000×857).

   Public API:
     window.buildRouteMapSvg(outOri, outDst, retOri, retDst, pricesMap?)
        → Promise<string>  with <svg>…</svg>
   pricesMap is an optional Map<"ORI→DST", number> with the min
   price per route — when present, it is painted as a chip on
   each arc.

   Depends on: AIRPORT_COORDS (airport_coords.js).
   Lazily fetches files/world.svg on first use and caches the
   parsed country paths.
------------------------------------------- */

(function initRouteMap() {

  /* ── Projection matching files/world.svg (Mercator, cropped) ── */
  const WORLD_W = 2000;
  const WORLD_H = 857;
  const Y_EQUATOR = 428.5;
  const Y_SCALE   = 156.2;

  function _projectLatLon(lat, lon) {
    const x = (lon + 180) * (WORLD_W / 360);
    const yMerc = Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360));
    const y = Y_EQUATOR - Y_SCALE * yMerc;
    return { x, y };
  }

  function _airportLatLon(iata) {
    if (typeof AIRPORT_COORDS === 'undefined') return null;
    return AIRPORT_COORDS[iata] || null;
  }

  /* ── Lazy world-paths loader ── */
  let _worldPathsPromise = null;
  function _loadWorldPaths() {
    if (_worldPathsPromise) return _worldPathsPromise;
    _worldPathsPromise = fetch('files/world.svg')
      .then(r => r.ok ? r.text() : '')
      .then(txt => {
        if (!txt) return '';
        let combined = '';
        const re = /<path\b[^>]*\bd="([^"]+)"/g;
        let m;
        while ((m = re.exec(txt)) !== null) {
          combined += m[1] + ' ';
        }
        return combined;
      })
      .catch(() => '');
    return _worldPathsPromise;
  }

  if ('requestIdleCallback' in window) {
    requestIdleCallback(_loadWorldPaths);
  } else {
    setTimeout(_loadWorldPaths, 1200);
  }

  /* Quadratic-bezier control point for an arc between two projected
     points. Reused by both the path command and the midpoint label. */
  function _arcControlPoint(from, to, curveAbove) {
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const dist = Math.sqrt(dx*dx + dy*dy) || 1;
    const curveAmount = Math.min(dist * 0.25, 90);
    const px = -dy / dist * curveAmount * (curveAbove ? 1 : -1);
    const py =  dx / dist * curveAmount * (curveAbove ? 1 : -1);
    return { cx: mx + px, cy: my + py, dist };
  }

  function _arcPath(from, to, curveAbove) {
    const { cx, cy } = _arcControlPoint(from, to, curveAbove);
    return `M${from.x.toFixed(1)},${from.y.toFixed(1)} ` +
           `Q${cx.toFixed(1)},${cy.toFixed(1)} ${to.x.toFixed(1)},${to.y.toFixed(1)}`;
  }

  /* Point on the quadratic bezier at t=0.5 — used to anchor the
     price label so it sits ON the curve, not between the endpoints */
  function _arcMidpoint(from, to, curveAbove) {
    const { cx, cy } = _arcControlPoint(from, to, curveAbove);
    return {
      x: (from.x + 2 * cx + to.x) / 4,
      y: (from.y + 2 * cy + to.y) / 4,
    };
  }

  let _planeIdSeq = 0;

  window.buildRouteMapSvg = async function buildRouteMapSvg(outOri, outDst, retOri, retDst, pricesMap) {
    const all = [...(outOri||[]), ...(outDst||[]), ...(retOri||[]), ...(retDst||[])];
    const points = [];
    const seen = new Set();
    for (const iata of all) {
      if (seen.has(iata)) continue;
      const c = _airportLatLon(iata);
      if (!c) continue;
      seen.add(iata);
      points.push({ iata, lat: c.lat, lon: c.lon });
    }
    if (points.length < 2) return '';

    const proj = {};
    for (const p of points) proj[p.iata] = _projectLatLon(p.lat, p.lon);

    const xs = points.map(p => proj[p.iata].x);
    const ys = points.map(p => proj[p.iata].y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const spanX = Math.max(maxX - minX, 200);
    const spanY = Math.max(maxY - minY, 140);
    const padX  = Math.max(60, spanX * 0.18);
    const padY  = Math.max(45, spanY * 0.22);
    let vbX = Math.max(0, (minX + maxX) / 2 - spanX / 2 - padX);
    let vbY = Math.max(0, (minY + maxY) / 2 - spanY / 2 - padY);
    let vbW = Math.min(WORLD_W - vbX, spanX + padX * 2);
    let vbH = Math.min(WORLD_H - vbY, spanY + padY * 2);

    const worldPaths = await _loadWorldPaths();

    function unique(pairs) {
      const seen = new Set();
      return pairs.filter(([f, t]) => {
        const k = `${f}|${t}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    }

    const outPairs = unique((outOri || []).flatMap(f => (outDst || []).map(t => [f, t])));
    const retPairs = unique((retOri || []).flatMap(f => (retDst || []).map(t => [f, t])));

    const scale = Math.min(vbW, vbH) / 280;
    const dotR     = Math.max(3.5, 4.5 * scale);
    const labelOff = Math.max(7, 10 * scale);
    const labelSz  = Math.max(9, 11 * scale);
    /* Plane / price-label sizes are scaled to viewBox so they read at any zoom */
    const planeScale = Math.max(0.8, 1.2 * scale);
    const priceFontSz = Math.max(8, 10 * scale);
    const pricePillW  = Math.max(38, 48 * scale);
    const pricePillH  = Math.max(13, 16 * scale);

    /* Build arcs + animated plane + (optional) price label per pair */
    function buildOne(f, t, curveAbove, cls, priceKey) {
      if (!proj[f] || !proj[t]) return '';
      const d = _arcPath(proj[f], proj[t], curveAbove);
      const arcId = `rm-arc-${_planeIdSeq++}`;
      /* Stagger animation phase so multiple planes don't overlap exactly */
      const dur   = (4.5 + Math.random() * 2.5).toFixed(2);
      const begin = (-Math.random() * 4).toFixed(2);
      /* Plane SVG shape — minimalist silhouette pointing right (rotate=auto)
         Scaled via the <g transform>; we use animateMotion for translation. */
      const planeShape = `
        <g class="rm-plane" transform="scale(${planeScale.toFixed(2)})">
          <path class="rm-plane-shape"
                d="M-6,0 L4,-1 L6,0 L4,1 Z M-2,-0.5 L0,-3 L1,-3 L-1,-0.5 Z M-2,0.5 L0,3 L1,3 L-1,0.5 Z M2,-0.6 L4,-1.5 L4.5,-1.5 L3,-0.6 Z M2,0.6 L4,1.5 L4.5,1.5 L3,0.6 Z"/>
          <animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" rotate="auto">
            <mpath href="#${arcId}"/>
          </animateMotion>
        </g>`;

      /* Optional price label at the arc midpoint */
      let priceLabel = '';
      if (pricesMap) {
        const price = pricesMap.get(priceKey);
        if (price && Number.isFinite(price)) {
          const mid = _arcMidpoint(proj[f], proj[t], curveAbove);
          const fmtPrice = Math.round(price) + ' €';
          priceLabel = `
            <g class="rm-price-pill" transform="translate(${mid.x.toFixed(1)},${mid.y.toFixed(1)})">
              <rect class="rm-price-bg"
                    x="${(-pricePillW/2).toFixed(1)}" y="${(-pricePillH/2).toFixed(1)}"
                    width="${pricePillW.toFixed(1)}" height="${pricePillH.toFixed(1)}"
                    rx="${(pricePillH/2).toFixed(1)}"/>
              <text class="rm-price-text" x="0" y="${(priceFontSz * 0.35).toFixed(1)}"
                    text-anchor="middle"
                    style="font-size:${priceFontSz.toFixed(1)}px">${fmtPrice}</text>
            </g>`;
        }
      }

      return `<path id="${arcId}" d="${d}" class="rm-arc ${cls}"/>` +
             priceLabel + planeShape;
    }

    const outArcs = outPairs.map(([f, t]) => buildOne(f, t, true,  'rm-arc-out', `${f}→${t}`)).join('');
    const retArcs = retPairs.map(([f, t]) => buildOne(f, t, false, 'rm-arc-ret', `${f}→${t}`)).join('');

    const dots = points.map(p => {
      const { x, y } = proj[p.iata];
      return `
        <g class="rm-airport">
          <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${dotR.toFixed(1)}" class="rm-dot"/>
          <text x="${x.toFixed(1)}" y="${(y - labelOff).toFixed(1)}"
                class="rm-label" style="font-size:${labelSz.toFixed(1)}px">${p.iata}</text>
        </g>`;
    }).join('');

    const worldLayer = worldPaths
      ? `<path d="${worldPaths}" class="rm-country" fill-rule="evenodd"/>`
      : '';

    return `
      <svg class="rm-svg" xmlns="http://www.w3.org/2000/svg"
           viewBox="${vbX.toFixed(0)} ${vbY.toFixed(0)} ${vbW.toFixed(0)} ${vbH.toFixed(0)}"
           preserveAspectRatio="xMidYMid meet">
        <rect class="rm-ocean" x="${vbX.toFixed(0)}" y="${vbY.toFixed(0)}"
              width="${vbW.toFixed(0)}" height="${vbH.toFixed(0)}"/>
        <g class="rm-world">${worldLayer}</g>
        <g class="rm-arcs">${outArcs}${retArcs}</g>
        <g class="rm-points">${dots}</g>
      </svg>`;
  };

  /* ── Auto-inject above the round-trip filter bar ── */
  function _maybeInjectRouteMap() {
    const resultsEl = document.getElementById('rtResults');
    if (!resultsEl) return;

    function readSelections() {
      const read = id => [...document.querySelectorAll(`#${id} .airport-tag`)]
        .map(t => t.dataset.iata).filter(Boolean);
      return {
        outOri: read('rtSelectorOutFrom'),
        outDst: read('rtSelectorOutTo'),
        retOri: read('rtSelectorRetFrom'),
        retDst: read('rtSelectorRetTo'),
      };
    }

    async function inject() {
      if (!resultsEl.querySelector('.rt-trip-group')) return;
      if (resultsEl.querySelector('.rm-panel')) return;
      const sel = readSelections();
      if (!sel.outOri.length || !sel.outDst.length) return;

      const panel = document.createElement('div');
      panel.className = 'rm-panel';
      panel.innerHTML = `
        <div class="rm-head">
          <span class="rm-title">${t('routemap_title')}</span>
          <span class="rm-legend">
            <span class="rm-legend-item rm-legend-out">${t('routemap_legend_out')}</span>
            <span class="rm-legend-item rm-legend-ret">${t('routemap_legend_ret')}</span>
          </span>
        </div>
        <div class="rm-placeholder"></div>`;
      const filterBar = resultsEl.querySelector('#rtFilterBar');
      if (filterBar) resultsEl.insertBefore(panel, filterBar);
      else resultsEl.insertBefore(panel, resultsEl.firstChild);

      try {
        /* Round-trip exposes min prices per route via window.rtRouteMinPrices() */
        const pricesMap = (typeof window.rtRouteMinPrices === 'function')
          ? window.rtRouteMinPrices() : null;
        const svg = await window.buildRouteMapSvg(
          sel.outOri, sel.outDst, sel.retOri, sel.retDst, pricesMap);
        if (svg) {
          panel.querySelector('.rm-placeholder').outerHTML = svg;
        } else {
          panel.remove();
        }
      } catch {
        panel.remove();
      }
    }

    const observer = new MutationObserver(() => { inject(); });
    observer.observe(resultsEl, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _maybeInjectRouteMap);
  } else {
    _maybeInjectRouteMap();
  }
})();
