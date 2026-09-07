(function () {
  'use strict';

  var splide = null;

  // Compute the site base URL from the apps-index.js <script> src so that
  // absolute paths (like /static/...) resolve correctly everywhere:
  // served at root, opened via file://, or hosted on GitHub Pages under /repo/.
  var baseSrc = document.querySelector('script[src*="apps-index.js"]');
  var BASE = baseSrc ? baseSrc.src.replace(/\/static\/apps-index\.js.*$/, '') : '';

  function fileUrl(rel) {
    if (!rel) return rel;
    return (BASE === '' || rel.charAt(0) !== '/') ? rel : BASE + rel;
  }

  function init() {
    window.addEventListener('hashchange', onHashChange);
    document.addEventListener('click', function (e) {
      var back = e.target.closest('[data-back]');
      if (back) {
        e.preventDefault();
        window.location.hash = '#/';
      }
    });
    onHashChange();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function getApps() {
    var idx = window.APPS_INDEX;
    return idx && Array.isArray(idx.apps) ? idx.apps : [];
  }

  function getApp(id) {
    return getApps().find(function (a) { return a.id === id; });
  }

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function fmtSize(bytes) {
    if (bytes == null) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1048576).toFixed(1) + ' MB';
  }

  function osIcon(os) {
    os = (os || '').toLowerCase();
    if (os.indexOf('android') !== -1) return 'fa-android';
    if (os.indexOf('ios') !== -1) return 'fa-apple';
    if (os.indexOf('windows') !== -1) return 'fa-windows';
    if (os.indexOf('mac') !== -1) return 'fa-apple';
    if (os.indexOf('linux') !== -1) return 'fa-linux';
    if (os.indexOf('web') !== -1) return 'fa-globe';
    return 'fa-download';
  }

  function letterIcon(name) {
    return esc((name || '?').charAt(0).toUpperCase());
  }

  function iconHtml(app, sizeClass) {
    if (app.icon_url) {
      return '<img class="app-icon-img ' + (sizeClass || '') + '" src="' + esc(fileUrl(app.icon_url)) + '" alt="' + esc(app.name) + '">';
    }
    return '<div class="app-icon ' + (sizeClass || '') + '">' + letterIcon(app.name) + '</div>';
  }

  // ---------- Routing ----------
  function parseRoute(hash) {
    var path = hash.replace(/^#\/?/, '').replace(/\/+$/, '');
    var parts = path.split('/').filter(Boolean);
    if (parts.length === 0) return { view: 'home' };
    if ((parts[0] === 'app' || parts[0] === 'apps') && parts[1]) {
      return { view: 'app', id: parts[1] };
    }
    return { view: 'home' };
  }

  function onHashChange() {
    var route = parseRoute(window.location.hash || '#/');
    var hero = document.getElementById('heroSection');
    if (route.view === 'app') {
      if (hero) hero.hidden = true;
      renderDetail(route.id);
    } else {
      if (hero) hero.hidden = false;
      renderHome();
    }
    window.scrollTo(0, 0);
  }

  // ---------- Home (grid) ----------
  var currentFilter = 'All';

  function buildFilters() {
    var bar = document.getElementById('filterBar');
    var osSet = {};
    getApps().forEach(function (a) {
      if (a.os_target) osSet[a.os_target] = true;
    });
    var names = Object.keys(osSet).sort();

    var chips = ['<button class="filter-chip active" data-os="All">All</button>'];
    names.forEach(function (n) {
      chips.push('<button class="filter-chip" data-os="' + esc(n) + '">' + esc(n) + '</button>');
    });
    bar.innerHTML = chips.join('');

    bar.querySelectorAll('.filter-chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        currentFilter = chip.getAttribute('data-os');
        bar.querySelectorAll('.filter-chip').forEach(function (c) {
          c.classList.toggle('active', c === chip);
        });
        renderGrid();
      });
    });
  }

  function renderGrid() {
    var grid = document.getElementById('appGrid');
    var empty = document.getElementById('emptyState');
    var apps = getApps().filter(function (a) {
      return currentFilter === 'All' || (a.os_target === currentFilter);
    });

    if (apps.length === 0) {
      grid.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;

    grid.innerHTML = apps.map(function (app) {
      var screenshotHtml = app.screenshots && app.screenshots.length
        ? '<div class="chips"><span class="chip"><i class="fas fa-camera"></i> ' + app.screenshots.length + ' screenshot' + (app.screenshots.length > 1 ? 's' : '') + '</span></div>'
        : '';
      return '' +
        '<div class="app-card" data-id="' + esc(app.id) + '" role="button" tabindex="0">' +
        '  <span class="card-chevron"><i class="fas fa-chevron-right"></i></span>' +
        '  <div class="app-card-top">' +
        '    ' + iconHtml(app) +
        '    <div class="app-card-title">' +
        '      <h3>' + esc(app.name) + '</h3>' +
        '      <div class="app-meta"><i class="fab ' + osIcon(app.os_target) + '"></i> ' + esc(app.os_target) +
        (app.version ? ' · v' + esc(app.version) : '') + '</div>' +
        '    </div>' +
        '  </div>' +
        '  <p class="app-desc">' + esc(app.description) + '</p>' +
        '  <div>' + screenshotHtml + '</div>' +
        '</div>';
    }).join('');

    grid.querySelectorAll('.app-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;
        window.location.hash = '#/apps/' + card.getAttribute('data-id');
      });
    });
  }

  function renderHome() {
    destroySplide();
    var root = document.getElementById('app');
    root.innerHTML = '' +
      '<section class="section">' +
      '  <div class="section-head">' +
      '    <h2 class="section-title"><i class="fas fa-th-large"></i> Available apps</h2>' +
      '    <div class="filter-bar" id="filterBar"></div>' +
      '  </div>' +
      '  <div class="app-grid" id="appGrid"></div>' +
      '  <div class="empty-state" id="emptyState" hidden>' +
      '    <i class="fas fa-box-open"></i>' +
      '    <p>No apps available yet.</p>' +
      '  </div>' +
      '</section>';
    buildFilters();
    renderGrid();
  }

  // ---------- App detail page ----------
  function renderDetail(id) {
    var app = getApp(id);
    var root = document.getElementById('app');
    if (!app) {
      root.innerHTML =
        '<section class="section">' +
        '  <div class="empty-state"><i class="fas fa-box-open"></i><p>App not found.</p></div>' +
        '</section>';
      document.getElementById('heroSection').hidden = false;
      return;
    }
    destroySplide();

    var hasShots = app.screenshots && app.screenshots.length;
    var gallery;
    if (hasShots) {
      gallery = '<div class="detail-gallery" id="detailGallery"></div>';
    } else {
      gallery = '';
    }

    root.innerHTML = '' +
      '<section class="section detail-section">' +
      '  <div class="back-row">' +
      '    <button class="btn-back" data-back><i class="fas fa-arrow-left"></i> Back to apps</button>' +
      '  </div>' +
      '  <div class="detail-header">' +
      '    ' + iconHtml(app, 'app-icon-xl') +
      '    <div class="detail-title-wrap">' +
      '      <h1>' + esc(app.name) + '</h1>' +
      '      <div class="dev">' + esc(app.developer || 'Unknown developer') + '</div>' +
      '      <div class="detail-meta">' +
      '        <span><i class="fab ' + osIcon(app.os_target) + '"></i> ' + esc(app.os_target) + '</span>' +
      (app.version ? '<span><i class="fas fa-tag"></i> v' + esc(app.version) + '</span>' : '') +
      '        <span><i class="fas fa-file-archive"></i> ' + esc((app.package || '').split('/').pop()) + '</span>' +
      '      </div>' +
      '    </div>' +
      '  </div>' +
      gallery +
      '  <p class="detail-desc">' + esc(app.description) + '</p>' +
      '  <dl class="detail-list">' +
      '    <div class="detail-row"><dt>Size</dt><dd>' + fmtSize(app.size) + '</dd></div>' +
      '    <div class="detail-row"><dt>Platform</dt><dd>' + esc(app.os_target) + '</dd></div>' +
      '    <div class="detail-row"><dt>Version</dt><dd>' + esc(app.version || '—') + '</dd></div>' +
      '    <div class="detail-row"><dt>Developer</dt><dd>' + esc(app.developer || '—') + '</dd></div>' +
      '    <div class="detail-row"><dt>Added</dt><dd>' + esc((app.created || '').replace('T', ' ').slice(0, 19)) + '</dd></div>' +
      '    <div class="detail-row"><dt>Screenshots</dt><dd>' + (hasShots ? app.screenshots.length : 0) + '</dd></div>' +
      '  </dl>' +
      '  <div class="download-bar">' +
      '    <a class="btn-download" href="' + esc(fileUrl(app.package_url)) + '" download>' +
      '      <i class="fas fa-download"></i> Download (' + fmtSize(app.size) + ')' +
      '    </a>' +
      '  </div>' +
      '</section>';

    if (hasShots && typeof Splide !== 'undefined') {
      var slides = app.screenshots.map(function (src) {
        return '<li class="splide__slide"><img src="' + esc(fileUrl(src)) + '" alt="' + esc(app.name) + '"></li>';
      }).join('');
      document.getElementById('detailGallery').innerHTML =
        '<div class="splide" id="appSplide">' +
        '  <div class="splide__track"><ul class="splide__list">' + slides + '</ul></div>' +
        '</div>';
      splide = new Splide('#appSplide', {
        type: 'loop',
        perPage: 1,
        autoplay: true,
        interval: 3500,
        pauseOnHover: true,
        arrows: true,
        pagination: true
      });
      splide.mount();
    } else if (hasShots) {
      var imgs = app.screenshots.map(function (src) {
        return '<img src="' + esc(fileUrl(src)) + '" alt="' + esc(app.name) + '">';
      }).join('');
      document.getElementById('detailGallery').innerHTML =
        '<div class="gallery-grid">' + imgs + '</div>';
    }
  }

  function destroySplide() {
    if (splide) {
      try { splide.destroy(true); } catch (e) {}
      splide = null;
    }
  }
})();