/**
 * WASI Network Navigation Bar
 * Drop <script src="wasi-network.js"></script> into any WASI site.
 * Auto-detects the current site and highlights it as active.
 * No dependencies — plain ES5, works offline as a file:// fallback too.
 */
(function () {
  var BASE = 'https://atarawendesidkabore-hash.github.io';

  var SITES = [
    {
      label:   'Intelligence',
      icon:    '🌍',
      url:     BASE + '/wasi-platform/',
      pattern: /\/wasi-platform\/?(?:index\.html)?$/
    },
    {
      label:   'DEX',
      icon:    '📊',
      url:     BASE + '/wasi-platform/wasi-dex/',
      pattern: /\/wasi-dex\//
    },
    {
      label:   'Éco Hub',
      icon:    '🏛️',
      url:     BASE + '/wasi-platform/ecosystem-hub/',
      pattern: /\/ecosystem-hub\//
    },
    {
      label:   'Microfinance',
      icon:    '💳',
      url:     BASE + '/wasi-platform/microfinance-app/',
      pattern: /\/microfinance-app\//
    },
    {
      label:   'Console',
      icon:    '⌨️',
      url:     BASE + '/wasi-platform/wasi-core-console.html',
      pattern: /wasi-core-console/
    },
    {
      label:   'OHADA Compta',
      icon:    '📒',
      url:     BASE + '/ohada-compta/',
      pattern: /\/ohada-compta\//
    }
  ];

  var loc = window.location.href;

  /* ── Build bar ─────────────────────────────────────────────────────── */
  var bar = document.createElement('div');
  bar.id = 'wasi-net';
  bar.style.cssText = [
    'background:#060d1a',
    'border-bottom:1px solid rgba(200,146,42,.22)',
    'padding:0 16px',
    'display:flex',
    'align-items:center',
    'gap:0',
    'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif',
    'font-size:.67rem',
    'letter-spacing:.03em',
    'height:26px',
    'overflow-x:auto',
    'white-space:nowrap',
    'scrollbar-width:none',
    '-ms-overflow-style:none',
    'box-sizing:border-box',
    'position:relative',
    'z-index:10000'
  ].join(';');

  var parts = [];

  /* Brand */
  parts.push(
    '<span style="color:#f0c14b;font-weight:700;letter-spacing:.18em;' +
    'margin-right:14px;font-size:.62rem;flex-shrink:0;">W A S I</span>'
  );

  /* Site links */
  SITES.forEach(function (site, i) {
    if (i > 0) {
      parts.push(
        '<span style="color:rgba(200,146,42,.22);margin:0 5px;flex-shrink:0;">·</span>'
      );
    }

    var active = site.pattern.test(loc);

    if (active) {
      parts.push(
        '<span style="color:#f0c14b;font-weight:600;flex-shrink:0;">' +
        site.label +
        '</span>'
      );
    } else {
      parts.push(
        '<a href="' + site.url + '" ' +
        'style="color:rgba(190,190,190,.48);text-decoration:none;flex-shrink:0;' +
        'transition:color .12s;" ' +
        'onmouseover="this.style.color=\'#f0c14b\'" ' +
        'onmouseout="this.style.color=\'rgba(190,190,190,.48)\'">' +
        site.label +
        '</a>'
      );
    }
  });

  bar.innerHTML = parts.join('');

  /* ── Inject ────────────────────────────────────────────────────────── */
  function inject() {
    if (document.getElementById('wasi-net')) return; // already present
    var body = document.body;
    if (!body) return;
    body.insertBefore(bar, body.firstChild);
  }

  if (document.body) {
    inject();
  } else {
    document.addEventListener('DOMContentLoaded', inject);
  }
})();
