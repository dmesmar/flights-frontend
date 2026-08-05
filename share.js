/* -------------------------------------------
   SHARE LINKS — Feature #20
   Encodes search parameters into the URL hash so a search
   can be reproduced on another device / tab.

   Hash payload format:
     #share=<base64url>           legacy / short payloads
     #share=c.<base64url>         compressed (deflate-raw via
                                  the Compression Streams API)

   Compression is opt-in based on payload size: anything > 180
   chars of JSON is compressed so very large multi-city payloads
   stay shareable in messaging apps.

   Public API (window):
     buildShareUrl(params)  → Promise<string>
     copyShareUrl(params)   → Promise<bool>
     parseShareHash()       → Promise<object | null>
     attachShareButton(containerEl, paramsFn)

   On load, if URL hash carries a payload:
     1. The relevant tab/form is restored.
     2. A dynamic og:image (SVG data URL) + og:title are injected
        so client-rendered previews show a brief trip summary.

   Depends on: i18n.js (t)
------------------------------------------- */

(function initShare() {

  /* ── base64url encoding (no padding, URL-safe) ── */
  function _b64encodeBytes(bytes) {
    let bin = '';
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function _b64decodeBytes(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function _b64encodeStr(str) {
    return btoa(unescape(encodeURIComponent(str)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function _b64decodeStr(str) {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return decodeURIComponent(escape(atob(str)));
  }

  /* ── Compression (deflate-raw via Streams API) ─────
     deflate-raw produces smaller output than gzip for short JSON
     because it skips the gzip header / footer (~20 bytes). */
  const _hasCompression =
    typeof CompressionStream !== 'undefined' &&
    typeof DecompressionStream !== 'undefined';

  async function _compress(str) {
    if (!_hasCompression) return null;
    try {
      const stream = new Blob([str]).stream()
        .pipeThrough(new CompressionStream('deflate-raw'));
      const buf = await new Response(stream).arrayBuffer();
      return new Uint8Array(buf);
    } catch { return null; }
  }
  async function _decompress(bytes) {
    if (!_hasCompression) return null;
    try {
      const stream = new Blob([bytes]).stream()
        .pipeThrough(new DecompressionStream('deflate-raw'));
      return await new Response(stream).text();
    } catch { return null; }
  }

  /* ── Build payload string (with optional compression) ── */
  async function _encodePayload(obj) {
    const json = JSON.stringify(obj);
    /* Only compress if it's worth it (CompressionStream call + b64
       overhead is real). 180 chars is empirically the break-even point. */
    if (json.length > 180 && _hasCompression) {
      const bytes = await _compress(json);
      if (bytes && bytes.length + 2 < json.length) {
        return 'c.' + _b64encodeBytes(bytes);
      }
    }
    return _b64encodeStr(json);
  }

  async function _decodePayload(str) {
    if (str.startsWith('c.')) {
      const bytes = _b64decodeBytes(str.slice(2));
      const txt = await _decompress(bytes);
      if (!txt) return null;
      return JSON.parse(txt);
    }
    return JSON.parse(_b64decodeStr(str));
  }

  window.buildShareUrl = async function buildShareUrl(params) {
    if (!params) return location.href;
    const payload = await _encodePayload(params);
    const baseUrl = location.origin + location.pathname + location.search;
    return `${baseUrl}#share=${payload}`;
  };

  window.copyShareUrl = async function copyShareUrl(params) {
    const url = await window.buildShareUrl(params);
    // Aviso si estamos en localhost: la URL sólo funciona en esta máquina.
    const host = location.hostname;
    const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '';
    let ok = false;
    try {
      await navigator.clipboard.writeText(url);
      ok = true;
    } catch {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { ok = document.execCommand('copy'); } catch {}
      document.body.removeChild(ta);
    }
    if (ok && isLocalHost) {
      _showToast('⚠ El enlace copiado sólo abre en este ordenador (localhost). Para compartir fuera necesitas exponer la app (ngrok / IP local).');
    }
    return ok;
  };

  function _showToast(msg) {
    const el = document.createElement('div');
    el.className = 'share-loaded-notice';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('fade-out'), 4000);
    setTimeout(() => el.remove(), 5000);
  }

  window.parseShareHash = async function parseShareHash() {
    /* Allow '.' inside the payload to support the 'c.' compression prefix */
    const m = (location.hash || '').match(/share=([A-Za-z0-9_.\-]+)/);
    if (!m) return null;
    try {
      const obj = await _decodePayload(m[1]);
      return obj && typeof obj === 'object' ? obj : null;
    } catch {
      return null;
    }
  };

  window.attachShareButton = function attachShareButton(containerEl, paramsFn) {
    if (!containerEl) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'results-action-btn share-btn-action';
    btn.title = t('share_btn_title');
    btn.textContent = t('share_btn');
    btn.addEventListener('click', async () => {
      const params = (typeof paramsFn === 'function') ? paramsFn() : paramsFn;
      const ok = await window.copyShareUrl(params);
      if (ok) {
        const orig = btn.textContent;
        btn.textContent = t('share_copied');
        btn.disabled = true;
        setTimeout(() => { btn.textContent = orig; btn.disabled = false; }, 2200);
      }
    });
    containerEl.appendChild(btn);
  };

  /* ═══════════════════════════════════════════
     OG image generation — Feature improvement
     Generates a small SVG preview card encoded as a data URL,
     injected into <head> as og:image. Also updates og:title /
     og:description and document.title to summarise the trip.

     KNOWN LIMITATION: scrapers (WhatsApp, Facebook, etc.) fetch
     the URL WITHOUT the #hash, so they cannot see the share
     payload. This means the rich preview only renders for clients
     that load the page in a real browser (e.g. Discord / Slack
     unfurls that follow redirects, or when the user opens the
     link directly and shares the resulting tab).
  ═══════════════════════════════════════════ */
  function _summariseParams(p) {
    if (!p || !p.kind) return null;
    const fmtAirports = arr => Array.isArray(arr) ? arr.join('/') : (arr || '');
    let title = 'Vuelos';
    let subtitle = '';
    let details = '';

    switch (p.kind) {
      case 'main':
        title = `${fmtAirports(p.from)} → ${fmtAirports(p.to)}`;
        subtitle = (p.dateIni && p.dateFin) ? `${p.dateIni} → ${p.dateFin}` : '';
        details = `Búsqueda de vuelos`;
        break;
      case 'roundtrip':
        title = `${fmtAirports(p.outFrom || p.from)} ⇄ ${fmtAirports(p.outTo || p.to)}`;
        subtitle = (p.dateIni && p.dateFin) ? `${p.dateIni} → ${p.dateFin}` : '';
        details = `Ida y vuelta · ${p.minStay || '?'}–${p.maxStay || '?'} noches`;
        break;
      case 'express':
        title = `${fmtAirports(p.from)} ⇄ ${fmtAirports(p.to)}`;
        subtitle = (p.dateIni && p.dateFin) ? `${p.dateIni} → ${p.dateFin}` : '';
        details = 'Express';
        break;
      case 'cheap':
        title = `${fmtAirports(p.from)} → ${fmtAirports(p.to)}`;
        subtitle = (p.dateIni && p.dateFin) ? `${p.dateIni} → ${p.dateFin}` : '';
        details = 'Más baratos';
        break;
      case 'heatmap': {
        title = `${fmtAirports(p.from)} → ${fmtAirports(p.to)}`;
        // Nuevo formato: monthFrom/yearFrom + monthTo/yearTo. Backwards-compat: month/year.
        const mF = p.monthFrom != null ? p.monthFrom : p.month;
        const yF = p.yearFrom  != null ? p.yearFrom  : p.year;
        const mT = p.monthTo   != null ? p.monthTo   : p.month;
        const yT = p.yearTo    != null ? p.yearTo    : p.year;
        if (mF != null && yF != null) {
          const from = `${String(mF + 1).padStart(2, '0')}/${yF}`;
          const to   = `${String(mT + 1).padStart(2, '0')}/${yT}`;
          subtitle = (from === to) ? from : `${from} → ${to}`;
        } else subtitle = '';
        details = 'Calendario de precios';
        break;
      }
      case 'multicity':
      case 'multicity-v2': {
        const seq = [p.origin, ...(p.destinations || [])]
          .filter(Boolean)
          .map(a => Array.isArray(a) ? a[0] : a);
        if (p.returnToOrigin && Array.isArray(p.origin)) seq.push(p.origin[0]);
        title = seq.join(' → ');
        subtitle = (p.startDate && p.endDate) ? `${p.startDate} → ${p.endDate}` : '';
        details = `Multi-ciudad · ${p.minNights || '?'}–${p.maxNights || '?'} noches por destino`;
        break;
      }
      default: return null;
    }
    return { title, subtitle, details };
  }

  function _buildOgSvg(summary) {
    const esc = s => String(s || '').replace(/[<>&"]/g, c =>
      ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    /* 1200x630 is the canonical OG image aspect ratio */
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0" stop-color="#0f172a"/>
      <stop offset="1" stop-color="#1e3a8a"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <text x="60" y="120" font-family="system-ui,sans-serif" font-size="36" fill="#94a3b8" font-weight="600">✈ Vuelos</text>
  <text x="60" y="260" font-family="system-ui,sans-serif" font-size="80" fill="#ffffff" font-weight="800">${esc(summary.title)}</text>
  <text x="60" y="340" font-family="system-ui,sans-serif" font-size="44" fill="#cbd5e1" font-weight="500">${esc(summary.subtitle)}</text>
  <text x="60" y="500" font-family="system-ui,sans-serif" font-size="32" fill="#a5b4fc" font-weight="500">${esc(summary.details)}</text>
  <rect x="60" y="540" width="120" height="6" rx="3" fill="#38bdf8"/>
</svg>`;
  }

  function _setMeta(prop, content) {
    let el = document.querySelector(`meta[property="${prop}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute('property', prop);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  }

  function _injectOgPreview(params) {
    const summary = _summariseParams(params);
    if (!summary) return;

    const svgStr = _buildOgSvg(summary);
    const dataUrl = 'data:image/svg+xml;base64,' + _b64encodeStr(svgStr).replace(/-/g, '+').replace(/_/g, '/');

    _setMeta('og:image', dataUrl);
    _setMeta('og:image:type', 'image/svg+xml');
    _setMeta('og:image:width', '1200');
    _setMeta('og:image:height', '630');
    _setMeta('og:title', summary.title);
    _setMeta('og:description', `${summary.subtitle} · ${summary.details}`);
    _setMeta('twitter:card', 'summary_large_image');
    _setMeta('twitter:image', dataUrl);

    /* Also update document.title for better browser-tab presence */
    document.title = `${summary.title} · ${summary.details}`;
  }

  /* ── On page load / hashchange: if URL has #share=…, restore the search. ── */
  async function _applyShareHashOnLoad() {
    const params = await window.parseShareHash();
    if (!params || !params.kind) return;

    _injectOgPreview(params);

    // Espera activa: los selectores se cablean después de app.js. En vez de
    // asumir un delay fijo, pollea hasta ~2s. Falla silencioso si nunca están
    // listos (mejor no aplicar que aplicar mal).
    _waitForReady(params, 0);
  }

  function _waitForReady(params, tries) {
    const needsMain      = params.kind === 'main'      && typeof selectorFrom  === 'undefined';
    const needsCheap     = params.kind === 'cheap'     && typeof chSelectorFrom === 'undefined';
    const needsExpress   = params.kind === 'express'   && typeof exSelectorFrom === 'undefined';
    const needsHeatmap   = params.kind === 'heatmap'   && typeof hmSelectorFrom === 'undefined';
    const needsSurprise  = params.kind === 'surprise'  && typeof surSelectorFrom === 'undefined';
    const needsRoundtrip = params.kind === 'roundtrip' && typeof window.rtApplyShared !== 'function';
    const needsMulticity = (params.kind === 'multicity' || params.kind === 'multicity-v2')
                           && typeof window.mcApplyShared !== 'function';
    const notReady = needsMain || needsCheap || needsExpress || needsHeatmap
                     || needsSurprise || needsRoundtrip || needsMulticity;
    if (notReady && tries < 40) {           // 40 × 50 ms = 2 s máximo
      return setTimeout(() => _waitForReady(params, tries + 1), 50);
    }
    _applyParams(params);
  }

  function _applyParams(p) {
    function ymdToInput(d) {
      if (!d) return '';
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
      const m = d.match(/^(\d{2})-(\d{2})-(\d{4})$/);
      return m ? `${m[3]}-${m[2]}-${m[1]}` : d;
    }

    switch (p.kind) {
      case 'main':
        if (typeof selectorFrom !== 'undefined' && p.from) selectorFrom.setSelected(p.from);
        if (typeof selectorTo   !== 'undefined' && p.to)   selectorTo.setSelected(p.to);
        if (p.dateIni) document.getElementById('fechaIni').value = ymdToInput(p.dateIni);
        if (p.dateFin) document.getElementById('fechaFin').value = ymdToInput(p.dateFin);
        if (p.maxStops != null) {
          const row = document.getElementById('stopsRow');
          if (row) {
            row.querySelectorAll('.stop-btn').forEach(b => b.classList.toggle('active', b.dataset.value == p.maxStops));
            const hidden = document.getElementById('maxStops');
            if (hidden) hidden.value = p.maxStops;
          }
        }
        document.querySelector('[data-tab="search"]')?.click();
        break;

      case 'roundtrip':
        if (typeof window.rtApplyShared === 'function') window.rtApplyShared(p);
        document.querySelector('[data-tab="roundtrip"]')?.click();
        break;

      case 'express':
        if (typeof exSelectorFrom !== 'undefined' && p.from) exSelectorFrom.setSelected(p.from);
        if (typeof exSelectorTo   !== 'undefined' && p.to)   exSelectorTo.setSelected(p.to);
        if (p.dateIni) document.getElementById('exFechaIni').value = ymdToInput(p.dateIni);
        if (p.dateFin) document.getElementById('exFechaFin').value = ymdToInput(p.dateFin);
        document.querySelector('[data-tab="express"]')?.click();
        break;

      case 'cheap':
        if (typeof chSelectorFrom !== 'undefined' && p.from) chSelectorFrom.setSelected(p.from);
        if (typeof chSelectorTo   !== 'undefined' && p.to)   chSelectorTo.setSelected(p.to);
        if (p.dateIni) document.getElementById('chFechaIni').value = ymdToInput(p.dateIni);
        if (p.dateFin) document.getElementById('chFechaFin').value = ymdToInput(p.dateFin);
        document.querySelector('[data-tab="cheap"]')?.click();
        break;

      case 'heatmap': {
        if (typeof hmSelectorFrom !== 'undefined' && p.from) hmSelectorFrom.setSelected(p.from);
        if (typeof hmSelectorTo   !== 'undefined' && p.to)   hmSelectorTo.setSelected(p.to);
        const mF = p.monthFrom != null ? p.monthFrom : p.month;
        const yF = p.yearFrom  != null ? p.yearFrom  : p.year;
        const mT = p.monthTo   != null ? p.monthTo   : p.month;
        const yT = p.yearTo    != null ? p.yearTo    : p.year;
        if (mF != null) document.getElementById('hmMonthFrom').value = mF;
        if (yF != null) document.getElementById('hmYearFrom').value  = yF;
        if (mT != null) document.getElementById('hmMonthTo').value   = mT;
        if (yT != null) document.getElementById('hmYearTo').value    = yT;
        document.querySelector('[data-tab="heatmap"]')?.click();
        break;
      }

      case 'multicity':       /* legacy v1 payload */
      case 'multicity-v2':    /* new payload shape */
        if (typeof window.mcApplyShared === 'function') {
          window.mcApplyShared(p.kind === 'multicity' ? p.legs : p);
        }
        document.querySelector('[data-tab="multicity"]')?.click();
        break;

      default:
        break;
    }
    _showSharedNotice();
  }

  function _showSharedNotice() {
    const notice = document.createElement('div');
    notice.className = 'share-loaded-notice';
    notice.textContent = t('share_loaded');
    document.body.appendChild(notice);
    setTimeout(() => notice.classList.add('fade-out'), 2500);
    setTimeout(() => notice.remove(), 3500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _applyShareHashOnLoad);
  } else {
    _applyShareHashOnLoad();
  }
  // Si el usuario pega un link con #share=... en la misma pestaña, o navega
  // con back/forward a un hash anterior, también restauramos.
  window.addEventListener('hashchange', _applyShareHashOnLoad);
})();
