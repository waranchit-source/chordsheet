(function () {
  var C = window.Chords;
  var L = window.I18n;
  var t = L.t;
  var esc = C.esc;
  var CFG = window.APP_CONFIG || {};
  var API_URL = String(CFG.API_URL || '').trim();
  var MONTHS = {
    th: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
    en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  };
  var KEY_OPTIONS = C.MAJOR_KEY_NAMES.concat(['C#', 'Gb', 'Cb']).concat(C.MINOR_KEY_NAMES).concat(['D#m', 'Abm', 'A#m']);
  var PERMS = ['songs.view', 'songs.edit', 'songs.delete', 'setlist.create', 'history.view', 'setlist.delete', 'stats.view', 'users.manage'];
  var PERM_NEEDS = { 'songs.edit': ['songs.view'], 'songs.delete': ['songs.view'], 'setlist.create': ['songs.view'], 'setlist.delete': ['history.view'] };
  var ROLE_PERMS = { viewer: ['songs.view', 'history.view', 'stats.view'], leader: ['songs.view', 'songs.edit', 'setlist.create', 'history.view', 'stats.view'], admin: PERMS };
  var LAYOUTS = ['auto', 'half', 'full'];
  var ACCS = ['auto', 'sharp', 'flat'];
  var USERNAME_RE = /^[a-z0-9._-]{3,30}$/;
  var modalDismiss = null;
  var lastFocus = null;
  var revealObserver = null;

  var state = {
    token: null,
    user: null,
    remember: false,
    view: 'library',
    songs: [],
    songsLoaded: false,
    search: '',
    sort: 'title',
    current: null,
    viewShift: 0,
    viewAcc: 'auto',
    viewZoom: 16,
    editing: null,
    builder: null,
    leaders: [],
    setlists: [],
    setlistsLoaded: false,
    stats: null,
    statsFilter: { from: '', to: '', leader: '' },
    statsLeader: '',
    users: [],
    usersLoaded: false,
    usersTab: 'pending',
    pendingCount: 0,
    pickerQuery: '',
    lastResult: null,
    busy: 0,
    authView: 'login',
    authDraft: {},
    sidebarOpen: document.documentElement.classList.contains('sb-open'),
    statsKey: '',
    reveal: false
  };
  var narrowMq = window.matchMedia ? window.matchMedia('(max-width: 1023px)') : null;

  function store(key, value) {
    try {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (e) {
    }
  }

  function load(key) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch (e) {
      return null;
    }
  }

  function sessionStore(key, value) {
    try {
      if (value === null) {
        sessionStorage.removeItem(key);
      } else {
        sessionStorage.setItem(key, JSON.stringify(value));
      }
    } catch (e) {
    }
  }

  function sessionLoad(key) {
    try {
      var v = sessionStorage.getItem(key);
      return v ? JSON.parse(v) : null;
    } catch (e) {
      return null;
    }
  }

  function saveToken(token, remember, user) {
    store('cs_token', null);
    store('cs_user', null);
    sessionStore('cs_token', null);
    sessionStore('cs_user', null);
    if (!token) {
      return;
    }
    if (remember) {
      store('cs_token', token);
      store('cs_user', user || null);
    } else {
      sessionStore('cs_token', token);
      sessionStore('cs_user', user || null);
    }
  }

  function saveUser(user) {
    if (state.remember) {
      store('cs_user', user);
    } else {
      sessionStore('cs_user', user);
    }
  }

  function loadToken() {
    var tk = load('cs_token');
    if (tk) {
      return { token: tk, remember: true, user: load('cs_user') };
    }
    tk = sessionLoad('cs_token');
    return tk ? { token: tk, remember: false, user: sessionLoad('cs_user') } : null;
  }

  function saveCache() {
    try {
      localStorage.setItem('cs_cache', JSON.stringify({ songs: state.songs, leaders: state.leaders }));
    } catch (e) {
      try {
        localStorage.removeItem('cs_cache');
      } catch (e2) {
      }
    }
  }

  function loadCache() {
    var c = load('cs_cache');
    return c && Array.isArray(c.songs) ? c : null;
  }

  function findSong(id) {
    for (var i = 0; i < state.songs.length; i++) {
      if (state.songs[i].id === id) {
        return state.songs[i];
      }
    }
    return null;
  }

  function applyBoot(data) {
    if (!data) {
      return;
    }
    if (data.user) {
      state.user = data.user;
      saveUser(data.user);
    }
    if (Array.isArray(data.songs)) {
      state.songs = data.songs;
      state.songsLoaded = true;
    }
    if (Array.isArray(data.leaders)) {
      state.leaders = data.leaders;
    }
    state.pendingCount = Number(data.pendingCount) || 0;
    saveCache();
  }

  function syncBuilderSongs() {
    if (!state.builder || !state.songsLoaded) {
      return;
    }
    var before = state.builder.items.length;
    var missingContent = [];
    state.builder.items = state.builder.items.filter(function (it) { return findSong(it.songId); });
    state.builder.items.forEach(function (it) {
      var s = findSong(it.songId);
      it.title = s.title;
      it.originalKey = s.originalKey;
      if (typeof s.content === 'string') {
        it.content = s.content;
      } else if (!it.content) {
        missingContent.push(it.songId);
      }
    });
    saveBuilder();
    if (missingContent.length) {
      api('getSongs', missingContent).then(function (map) {
        state.builder.items.forEach(function (it) {
          if (map[it.songId]) {
            it.content = map[it.songId].content;
          }
        });
        if (state.view === 'builder') {
          renderBuilderItems();
        }
      }).catch(fail);
    }
    return before !== state.builder.items.length;
  }

  function isNarrow() {
    return !!(narrowMq && narrowMq.matches);
  }

  function setSidebar(open, focusTarget) {
    state.sidebarOpen = !!open;
    document.documentElement.classList.toggle('sb-open', state.sidebarOpen);
    var sb = $('sidebar');
    if (state.sidebarOpen && !document.body.classList.contains('auth-mode')) {
      sb.removeAttribute('inert');
      sb.removeAttribute('aria-hidden');
    } else {
      sb.setAttribute('inert', '');
      sb.setAttribute('aria-hidden', 'true');
    }
    var toggle = $('menuToggle');
    toggle.setAttribute('aria-expanded', state.sidebarOpen ? 'true' : 'false');
    toggle.setAttribute('aria-label', t(state.sidebarOpen ? 'nav.closeMenu' : 'nav.openMenu'));
    toggle.setAttribute('title', t(state.sidebarOpen ? 'nav.closeMenu' : 'nav.openMenu'));
    if (!isNarrow()) {
      store('cs_sidebar', state.sidebarOpen);
    }
    if (focusTarget === 'nav' && state.sidebarOpen) {
      var first = $('nav').querySelector('.nav-link.active') || $('nav').querySelector('.nav-link');
      if (first) {
        first.focus();
      }
    } else if (focusTarget === 'close' && state.sidebarOpen) {
      $('sbClose').focus();
    } else if (focusTarget === 'toggle') {
      toggle.focus();
    }
  }

  function closeDrawerIfNarrow() {
    if (isNarrow() && state.sidebarOpen) {
      setSidebar(false);
    }
  }

  function $(id) {
    return document.getElementById(id);
  }

  function each(root, selector, fn) {
    Array.prototype.forEach.call(root.querySelectorAll(selector), fn);
  }

  function ic(name) {
    return '<span class="ph ph-' + name + '" aria-hidden="true"></span>';
  }

  function btnLabel(icon, label) {
    return (icon ? ic(icon) : '') + '<span>' + esc(label) + '</span>';
  }

  function tCount(key, n) {
    var k = n === 1 && L.hasOwnInLang(key + '.one') ? key + '.one' : key;
    return t(k, { n: n });
  }

  function errMsg(e) {
    var m = e && e.message ? String(e.message) : String(e);
    if (m.indexOf('SHEET_NOT_FOUND:') === 0) {
      return t('err.SHEET_NOT_FOUND', { name: m.substring(16) });
    }
    if (/^[A-Z_]+$/.test(m) && L.has('err.' + m)) {
      return t('err.' + m);
    }
    return m;
  }

  function setBusy(delta) {
    state.busy = Math.max(0, state.busy + delta);
    $('loading').classList.toggle('hide', state.busy === 0);
    $('view').setAttribute('aria-busy', state.busy > 0 ? 'true' : 'false');
  }

  function toast(msg, isErr) {
    var el = document.createElement('div');
    el.className = 'toast' + (isErr ? ' err' : '');
    el.setAttribute('role', isErr ? 'alert' : 'status');
    el.innerHTML = ic(isErr ? 'warning-circle' : 'check-circle') + '<span>' + esc(msg) + '</span>';
    $('toastRoot').appendChild(el);
    requestAnimationFrame(function () { el.classList.add('show'); });
    setTimeout(function () {
      el.classList.remove('show');
      setTimeout(function () { el.remove(); }, 400);
    }, isErr ? 5000 : 2800);
  }

  function modal(html, onReady, onDismiss) {
    lastFocus = document.activeElement;
    $('modalRoot').innerHTML = '<div class="overlay" id="overlay"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="modalTitle">' + html + '</div></div>';
    modalDismiss = onDismiss || closeModal;
    requestAnimationFrame(function () {
      var ov = $('overlay');
      if (ov) {
        ov.classList.add('show');
      }
    });
    if (onReady) {
      onReady();
    }
    var first = $('modalRoot').querySelector('input:not([disabled]), select, textarea, .modal-actions .btn.primary');
    if (first) {
      first.focus();
    }
  }

  function closeModal() {
    $('modalRoot').innerHTML = '';
    modalDismiss = null;
    if (lastFocus && document.body.contains(lastFocus)) {
      try {
        lastFocus.focus();
      } catch (e) {
      }
    }
    lastFocus = null;
  }

  function confirmBox(message, okLabel, danger) {
    return new Promise(function (resolve) {
      modal('<h3 class="heading-6" id="modalTitle">' + esc(t('common.confirm')) + '</h3><p class="body-3">' + esc(message) + '</p>' +
        '<div class="modal-actions"><button type="button" class="btn" id="mNo">' + esc(t('common.cancel')) + '</button>' +
        '<button type="button" class="btn ' + (danger ? 'danger-solid' : 'primary') + '" id="mYes">' + esc(okLabel || t('common.ok')) + '</button></div>', function () {
        $('mNo').onclick = function () { closeModal(); resolve(false); };
        $('mYes').onclick = function () { closeModal(); resolve(true); };
      }, function () { closeModal(); resolve(false); });
    });
  }

  function api(fn) {
    var args = Array.prototype.slice.call(arguments, 1);
    if (!API_URL) {
      return Promise.reject(new Error('API_NOT_CONFIGURED'));
    }
    var body = { action: fn, args: args };
    if (fn !== 'login' && fn !== 'register') {
      body.token = state.token;
    }
    setBusy(1);
    return fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      cache: 'no-store'
    }).then(function (r) {
      return r.text().then(function (txt) {
        try {
          return JSON.parse(txt);
        } catch (e) {
          throw new Error('SERVER_ERROR');
        }
      });
    }, function () {
      throw new Error('NETWORK_ERROR');
    }).then(function (res) {
      setBusy(-1);
      if (!res || res.ok !== true) {
        var msg = res && res.error ? String(res.error) : 'SERVER_ERROR';
        if (msg.indexOf('SESSION_EXPIRED') >= 0) {
          forceLogout(t('err.SESSION_EXPIRED'));
          throw new Error('SESSION_EXPIRED');
        }
        throw new Error(msg);
      }
      return res.data;
    }, function (err) {
      setBusy(-1);
      throw err;
    });
  }

  function fail(e) {
    if (e && e.message !== 'SESSION_EXPIRED') {
      toast(errMsg(e), true);
    }
  }

  function userPerms(user) {
    if (!user) {
      return [];
    }
    if (Array.isArray(user.perms)) {
      return user.perms;
    }
    return ROLE_PERMS[user.role] || [];
  }

  function roleForPerms(perms) {
    if (perms.indexOf('users.manage') >= 0) {
      return 'admin';
    }
    return perms.indexOf('setlist.create') >= 0 ? 'leader' : 'viewer';
  }

  function samePerms(a, b) {
    return a.length === b.length && a.every(function (p) { return b.indexOf(p) >= 0; });
  }

  function accessLabel(user) {
    var p = userPerms(user);
    if (p.indexOf('users.manage') >= 0) {
      return t('role.admin');
    }
    if (!p.length) {
      return t('role.none');
    }
    if (samePerms(p, ROLE_PERMS.leader)) {
      return t('role.leader');
    }
    if (samePerms(p, ROLE_PERMS.viewer)) {
      return t('role.viewer');
    }
    return t('role.custom');
  }

  var VIEW_PERM = { library: 'songs.view', song: 'songs.view', editor: 'songs.edit', builder: 'setlist.create', history: 'history.view', stats: 'stats.view', users: 'users.manage', account: '' };

  function viewAllowed(view) {
    var need = VIEW_PERM[view];
    return need === '' || (need !== undefined && can(need));
  }

  function firstView() {
    var order = ['library', 'builder', 'history', 'stats', 'users'];
    for (var i = 0; i < order.length; i++) {
      if (viewAllowed(order[i])) {
        return order[i];
      }
    }
    return 'account';
  }

  function can(role) {
    return userPerms(state.user).indexOf(role) >= 0;
  }

  function pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function isoDate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function nextSunday() {
    var d = new Date();
    d.setDate(d.getDate() + ((7 - d.getDay()) % 7));
    return isoDate(d);
  }

  function shortDate(iso) {
    var p = String(iso || '').substring(0, 10).split('-');
    if (p.length !== 3 || !Number(p[1])) {
      return iso || '';
    }
    if (L.getLang() === 'th') {
      return Number(p[2]) + ' ' + MONTHS.th[Number(p[1]) - 1] + p[0];
    }
    return Number(p[2]) + ' ' + MONTHS.en[Number(p[1]) - 1] + ' ' + p[0];
  }

  function defaultTitle(iso) {
    return t('builder.defaultTitle', { date: shortDate(iso) });
  }

  function newBuilder() {
    var date = nextSunday();
    return {
      title: defaultTitle(date),
      titleAuto: true,
      serviceDate: date,
      leader: state.user ? state.user.displayName : '',
      description: '',
      outputType: 'pdf',
      items: []
    };
  }

  function saveBuilder() {
    if (!state.builder) {
      return;
    }
    var copy = JSON.parse(JSON.stringify(state.builder));
    copy.items.forEach(function (it) { delete it.content; });
    store('cs_builder', copy);
  }

  function storedTheme() {
    var v = load('cs_theme');
    return v === 'light' || v === 'dark' ? v : null;
  }

  function isDark() {
    var s = storedTheme();
    if (s) {
      return s === 'dark';
    }
    return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
  }

  function applyTheme() {
    var s = storedTheme();
    if (s) {
      document.documentElement.setAttribute('data-theme', s);
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      meta.setAttribute('content', isDark() ? '#181818' : '#f7f7f8');
    }
  }

  function applyStaticText() {
    document.documentElement.lang = L.getLang();
    document.title = t('app.name');
    var desc = document.querySelector('meta[name="description"]');
    if (desc) {
      desc.setAttribute('content', t('app.description'));
    }
    $('skipLink').textContent = t('a11y.skip');
    $('brandName').textContent = t('app.name');
    $('sidebar').setAttribute('aria-label', t('nav.main'));
    $('nav').setAttribute('aria-label', t('nav.main'));
    $('menuToggle').setAttribute('aria-label', t(state.sidebarOpen ? 'nav.closeMenu' : 'nav.openMenu'));
    $('menuToggle').setAttribute('title', t(state.sidebarOpen ? 'nav.closeMenu' : 'nav.openMenu'));
    $('sbClose').setAttribute('aria-label', t('nav.closeMenu'));
    $('sbClose').setAttribute('title', t('nav.closeMenu'));
  }

  function prefButtons() {
    return '<button type="button" class="pref-btn" data-pref="lang" lang="' + (L.getLang() === 'th' ? 'en' : 'th') + '" aria-label="' + esc(t('pref.langLabel')) + '" title="' + esc(t('pref.langLabel')) + '">' + ic('translate') + '<span>' + esc(t('pref.langSwitch')) + '</span></button>' +
      '<button type="button" class="pref-btn icon-only" data-pref="theme" aria-label="' + esc(t(isDark() ? 'pref.toLight' : 'pref.toDark')) + '" title="' + esc(t(isDark() ? 'pref.toLight' : 'pref.toDark')) + '">' + ic(isDark() ? 'sun' : 'moon') + '</button>';
  }

  function bindPrefs(root) {
    each(root, '[data-pref]', function (b) {
      b.onclick = function () {
        if (b.getAttribute('data-pref') === 'lang') {
          toggleLang();
        } else {
          toggleTheme();
        }
      };
    });
  }

  function toggleTheme() {
    store('cs_theme', isDark() ? 'light' : 'dark');
    applyTheme();
    if (state.user) {
      renderNav();
    } else {
      renderAuthTools();
    }
  }

  function toggleLang() {
    captureAuthDraft();
    L.setLang(L.getLang() === 'th' ? 'en' : 'th');
    applyStaticText();
    if (state.builder && state.builder.titleAuto) {
      state.builder.title = defaultTitle(state.builder.serviceDate);
      saveBuilder();
    }
    if (state.user) {
      render();
    } else if ($('authTools')) {
      renderAuth();
    } else {
      boot();
    }
  }

  function forceLogout(msg) {
    state.token = null;
    state.user = null;
    state.pendingCount = 0;
    state.users = [];
    state.usersLoaded = false;
    state.songs = [];
    state.songsLoaded = false;
    state.setlists = [];
    state.setlistsLoaded = false;
    state.stats = null;
    state.statsKey = '';
    saveToken(null);
    store('cs_cache', null);
    state.authView = 'login';
    renderLogin();
    if (msg) {
      toast(msg, true);
    }
  }

  function navItems() {
    var count = state.builder && state.builder.items.length ? state.builder.items.length : 0;
    return [
      ['library', 'music-notes', t('nav.library'), 'songs.view'],
      ['builder', 'playlist', t('nav.builder') + (count ? ' (' + count + ')' : ''), 'setlist.create'],
      ['history', 'clock-counter-clockwise', t('nav.history'), 'history.view'],
      ['stats', 'chart-bar', t('nav.stats'), 'stats.view'],
      ['users', 'users', t('nav.users'), 'users.manage'],
      ['account', 'user-circle', t('nav.account')]
    ].filter(function (i) { return !i[3] || can(i[3]); });
  }

  function isActiveNav(id) {
    return state.view === id || (id === 'library' && (state.view === 'song' || state.view === 'editor'));
  }

  function navButton(i, idx) {
    var active = isActiveNav(i[0]);
    var badge = i[0] === 'users' && state.pendingCount ? '<span class="badge" title="' + esc(t('nav.pending', { n: state.pendingCount })) + '">' + state.pendingCount + '<span class="sr-only"> ' + esc(t('nav.pending', { n: state.pendingCount })) + '</span></span>' : '';
    return '<button type="button" class="nav-link' + (active ? ' active' : '') + '" data-nav="' + i[0] + '"' + (active ? ' aria-current="page"' : '') + (idx !== undefined ? ' style="--i:' + idx + '"' : '') + '>' + ic(i[1]) + '<span>' + esc(i[2]) + '</span>' + badge + '</button>';
  }

  function renderNav() {
    if (!state.user) {
      return;
    }
    var items = navItems();
    var n = items.length;
    var who = esc(state.user.displayName) + ' · ' + esc(accessLabel(state.user));
    $('nav').innerHTML = items.map(function (i, idx) { return navButton(i, idx); }).join('');
    $('navTools').innerHTML = '<div class="sb-sep" style="--i:' + n + '"></div>' +
      '<div class="sb-prefs" style="--i:' + (n + 1) + '">' + prefButtons() + '</div>' +
      '<div class="who caption-2" title="' + who + '" style="--i:' + (n + 2) + '">' + ic('user-circle') + '<span>' + who + '</span></div>' +
      '<button type="button" class="nav-link" data-nav="logout" style="--i:' + (n + 3) + '">' + ic('sign-out') + '<span>' + esc(t('nav.logout')) + '</span></button>';
    [$('nav'), $('navTools')].forEach(function (root) {
      each(root, '[data-nav]', function (b) {
        b.onclick = function () { go(b.getAttribute('data-nav')); };
      });
      bindPrefs(root);
    });
    var current = items.filter(function (i) { return isActiveNav(i[0]); })[0];
    $('pageTitle').innerHTML = current ? ic(current[1]) + '<span>' + esc(current[2]) + '</span>' : esc(t('app.name'));
  }

  function hideChrome() {
    document.body.classList.add('auth-mode');
    document.body.classList.remove('has-dock');
    if (isNarrow()) {
      setSidebar(false);
    } else {
      setSidebar(state.sidebarOpen);
    }
  }

  function go(view) {
    closeDrawerIfNarrow();
    if (view === 'logout') {
      api('logout').catch(function () {});
      forceLogout();
      return;
    }
    show(view);
  }

  function show(view) {
    state.view = view;
    state.reveal = true;
    window.scrollTo(0, 0);
    render();
    try {
      $('view').focus({ preventScroll: true });
    } catch (e) {
    }
  }

  function render() {
    if (document.body.classList.contains('auth-mode')) {
      document.body.classList.remove('auth-mode');
      setSidebar(state.sidebarOpen);
    }
    document.body.classList.toggle('has-dock', state.view === 'song');
    renderNav();
    if (!viewAllowed(state.view)) {
      state.view = firstView();
    }
    var v = state.view;
    if (v === 'library') { renderLibrary(); }
    else if (v === 'song') { renderSong(); }
    else if (v === 'editor') { renderEditor(); }
    else if (v === 'builder') { renderBuilder(); }
    else if (v === 'history') { renderHistory(); }
    else if (v === 'stats') { renderStats(); }
    else if (v === 'users') { renderUsers(); }
    else if (v === 'account') { renderAccount(); }
    if (state.reveal) {
      state.reveal = false;
      revealSections();
    }
  }

  function revealSections() {
    if (!('IntersectionObserver' in window)) {
      return;
    }
    if (revealObserver) {
      revealObserver.disconnect();
    }
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          revealObserver.unobserve(en.target);
        }
      });
    }, { rootMargin: '0px 0px -24px 0px' });
    Array.prototype.forEach.call($('view').children, function (el) {
      el.classList.add('reveal');
      if (el.querySelector('.song-dock')) {
        el.classList.add('reveal-fade');
      }
      revealObserver.observe(el);
    });
  }

  function skeleton(rows) {
    var out = '<div class="skeleton" aria-hidden="true">';
    for (var i = 0; i < rows; i++) {
      out += '<div class="sk-row"><span class="sk sk-a"></span><span class="sk sk-b"></span><span class="sk sk-c"></span></div>';
    }
    return out + '</div><span class="sr-only">' + esc(t('common.loading')) + '</span>';
  }

  function emptyState(icon, title, text, actionHtml) {
    return '<div class="empty"><span class="empty-icon">' + ic(icon) + '</span><h3 class="title-2">' + esc(title) + '</h3>' +
      (text ? '<p class="body-6 muted">' + esc(text) + '</p>' : '') + (actionHtml || '') + '</div>';
  }

  function field(id, label, control, hint) {
    return '<div class="field"><label class="f" for="' + id + '">' + esc(label) + '</label>' + control +
      (hint ? '<p class="caption-5 muted hint">' + esc(hint) + '</p>' : '') +
      '<p class="field-error" id="' + id + 'Err" hidden></p></div>';
  }

  function passwordInput(id, autocomplete) {
    return '<div class="pw"><input type="password" id="' + id + '" autocomplete="' + autocomplete + '">' +
      '<button type="button" class="pw-toggle" data-pw="' + id + '" aria-label="' + esc(t('common.showPassword')) + '">' + ic('eye') + '</button></div>';
  }

  function bindPasswordToggles(root) {
    each(root || document, '[data-pw]', function (b) {
      b.onclick = function () {
        var input = $(b.getAttribute('data-pw'));
        var reveal = input.type === 'password';
        input.type = reveal ? 'text' : 'password';
        b.innerHTML = ic(reveal ? 'eye-slash' : 'eye');
        b.setAttribute('aria-label', t(reveal ? 'common.hidePassword' : 'common.showPassword'));
      };
    });
  }

  function setFieldError(id, msg) {
    var el = $(id + 'Err');
    var input = $(id);
    if (el) {
      el.textContent = msg || '';
      el.hidden = !msg;
    }
    if (input) {
      if (msg) {
        input.setAttribute('aria-invalid', 'true');
        input.setAttribute('aria-describedby', id + 'Err');
      } else {
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
      }
    }
  }

  function clearErrors(root) {
    each(root, '.field-error', function (el) {
      el.hidden = true;
      el.textContent = '';
    });
    each(root, '[aria-invalid]', function (el) {
      el.removeAttribute('aria-invalid');
      el.removeAttribute('aria-describedby');
    });
    each(root, '.form-error', function (el) {
      el.hidden = true;
      el.innerHTML = '';
    });
  }

  function showFormError(id, msg) {
    var el = $(id);
    if (el) {
      el.innerHTML = ic('warning-circle') + '<span>' + esc(msg) + '</span>';
      el.hidden = false;
    }
  }

  function setButtonBusy(btn, busy, label) {
    if (!btn) {
      return;
    }
    btn.disabled = busy;
    btn.classList.toggle('is-busy', busy);
    btn.innerHTML = '<span>' + esc(label) + '</span>';
  }

  function brandMark() {
    return '<div class="auth-mark" aria-hidden="true">' + ic('music-notes') + '</div>';
  }

  function authShell(inner) {
    return '<section class="auth"><div class="auth-tools" id="authTools">' + prefButtons() + '</div><div class="card auth-card">' + inner + '</div></section>';
  }

  function renderAuthTools() {
    if ($('authTools')) {
      $('authTools').innerHTML = prefButtons();
      bindPrefs($('authTools'));
    }
  }

  function captureAuthDraft() {
    ['lgUser', 'rgUser', 'rgName'].forEach(function (id) {
      if ($(id)) {
        state.authDraft[id] = $(id).value;
      }
    });
    if ($('lgRemember')) {
      state.authDraft.lgRemember = $('lgRemember').checked;
    }
  }

  function renderAuth() {
    if (state.authView === 'register') {
      renderRegister();
    } else if (state.authView === 'registered') {
      renderRegisterDone(state.authDraft.doneUser || '');
    } else {
      renderLogin();
    }
  }

  function renderLogin() {
    state.authView = 'login';
    hideChrome();
    var d = state.authDraft;
    var lastUser = d.lgUser !== undefined ? d.lgUser : (load('cs_last_user') || '');
    var remember = d.lgRemember !== undefined ? d.lgRemember : load('cs_remember') === true;
    $('view').innerHTML = authShell(
      brandMark() +
      '<h1 class="heading-5">' + esc(t('login.title')) + '</h1>' +
      '<p class="body-6 muted">' + esc(t('app.name')) + '</p>' +
      '<form id="lgForm" class="form" novalidate>' +
      field('lgUser', t('login.username'), '<input type="text" id="lgUser" name="username" autocomplete="username" autocapitalize="none" spellcheck="false" value="' + esc(lastUser) + '">') +
      field('lgPass', t('login.password'), passwordInput('lgPass', 'current-password')) +
      '<label class="check"><input type="checkbox" id="lgRemember"' + (remember ? ' checked' : '') + '><span>' + esc(t('login.remember')) + '</span></label>' +
      '<p class="caption-5 muted hint">' + esc(t('login.rememberHint')) + '</p>' +
      '<div class="form-error" id="lgErr" role="alert" hidden></div>' +
      '<button class="btn primary block" type="submit" id="lgBtn"><span>' + esc(t('login.submit')) + '</span></button>' +
      '</form>' +
      '<p class="auth-switch body-6">' + esc(t('login.noAccount')) + ' <button type="button" class="link" id="toRegister">' + esc(t('login.request')) + '</button></p>'
    );
    bindPrefs($('authTools'));
    bindPasswordToggles($('view'));
    var form = $('lgForm');
    form.onsubmit = function (e) {
      e.preventDefault();
      var u = $('lgUser').value.trim();
      var p = $('lgPass').value;
      var rem = $('lgRemember').checked;
      clearErrors(form);
      if (!u || !p) {
        showFormError('lgErr', t('login.missing'));
        (u ? $('lgPass') : $('lgUser')).focus();
        return;
      }
      setButtonBusy($('lgBtn'), true, t('login.submitting'));
      api('login', u, p, rem).then(function (res) {
        state.token = res.token;
        state.user = res.user;
        state.remember = !!res.remember;
        saveToken(res.token, state.remember, res.user);
        store('cs_remember', rem);
        store('cs_last_user', rem ? u : null);
        state.authDraft = {};
        if (res.boot) {
          applyBoot(res.boot);
          afterLogin();
        } else {
          afterLogin();
          refreshAll();
        }
      }).catch(function (err) {
        setButtonBusy($('lgBtn'), false, t('login.submit'));
        if ($('lgErr')) {
          showFormError('lgErr', errMsg(err));
        }
      });
    };
    $('lgUser').onkeydown = function (e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        $('lgPass').focus();
      }
    };
    $('toRegister').onclick = function () {
      captureAuthDraft();
      state.authView = 'register';
      renderRegister();
    };
    (lastUser ? $('lgPass') : $('lgUser')).focus();
  }

  function renderRegister() {
    state.authView = 'register';
    hideChrome();
    var d = state.authDraft;
    $('view').innerHTML = authShell(
      brandMark() +
      '<h1 class="heading-5">' + esc(t('register.title')) + '</h1>' +
      '<p class="body-6 muted">' + esc(t('register.subtitle')) + '</p>' +
      '<form id="rgForm" class="form" novalidate>' +
      field('rgUser', t('register.username'), '<input type="text" id="rgUser" autocomplete="username" autocapitalize="none" spellcheck="false" maxlength="30" value="' + esc(d.rgUser || '') + '">', t('register.usernameHint')) +
      field('rgName', t('register.name'), '<input type="text" id="rgName" autocomplete="name" maxlength="60" value="' + esc(d.rgName || '') + '">', t('register.nameHint')) +
      field('rgPass', t('register.password'), passwordInput('rgPass', 'new-password'), t('register.passwordHint')) +
      field('rgPass2', t('register.password2'), passwordInput('rgPass2', 'new-password')) +
      '<div class="form-error" id="rgErr" role="alert" hidden></div>' +
      '<button class="btn primary block" type="submit" id="rgBtn"><span>' + esc(t('register.submit')) + '</span></button>' +
      '</form>' +
      '<p class="auth-switch body-6">' + esc(t('register.haveAccount')) + ' <button type="button" class="link" id="toLogin">' + esc(t('register.toLogin')) + '</button></p>'
    );
    bindPrefs($('authTools'));
    bindPasswordToggles($('view'));
    var form = $('rgForm');
    form.onsubmit = function (e) {
      e.preventDefault();
      clearErrors(form);
      var u = $('rgUser').value.trim().toLowerCase();
      var n = $('rgName').value.trim();
      var p = $('rgPass').value;
      var p2 = $('rgPass2').value;
      var firstBad = null;
      if (!USERNAME_RE.test(u)) {
        setFieldError('rgUser', t('err.INVALID_USERNAME'));
        firstBad = firstBad || 'rgUser';
      }
      if (!n) {
        setFieldError('rgName', t('register.nameRequired'));
        firstBad = firstBad || 'rgName';
      }
      if (p.length < 6) {
        setFieldError('rgPass', t('err.INVALID_PASSWORD'));
        firstBad = firstBad || 'rgPass';
      }
      if (p2 !== p) {
        setFieldError('rgPass2', t('register.mismatch'));
        firstBad = firstBad || 'rgPass2';
      }
      if (firstBad) {
        $(firstBad).focus();
        return;
      }
      setButtonBusy($('rgBtn'), true, t('register.submitting'));
      api('register', u, n, p).then(function () {
        state.authDraft = { lgUser: u, doneUser: u };
        renderRegisterDone(u);
      }).catch(function (err) {
        setButtonBusy($('rgBtn'), false, t('register.submit'));
        if (err.message === 'USERNAME_TAKEN' || err.message === 'INVALID_USERNAME') {
          setFieldError('rgUser', errMsg(err));
          $('rgUser').focus();
        } else if (err.message === 'INVALID_PASSWORD') {
          setFieldError('rgPass', errMsg(err));
          $('rgPass').focus();
        } else {
          showFormError('rgErr', errMsg(err));
        }
      });
    };
    $('toLogin').onclick = function () {
      captureAuthDraft();
      if ($('rgUser') && $('rgUser').value) {
        state.authDraft.lgUser = $('rgUser').value.trim().toLowerCase();
      }
      renderLogin();
    };
    $('rgUser').focus();
  }

  function renderRegisterDone(username) {
    state.authView = 'registered';
    hideChrome();
    $('view').innerHTML = authShell(
      '<div class="auth-mark ok" aria-hidden="true">' + ic('check-circle') + '</div>' +
      '<h1 class="heading-5">' + esc(t('register.doneTitle')) + '</h1>' +
      '<p class="body-3 muted">' + esc(t('register.doneText', { username: username })) + '</p>' +
      '<div class="sp-24"></div>' +
      '<button type="button" class="btn primary block" id="doneBack"><span>' + esc(t('register.backToLogin')) + '</span></button>'
    );
    bindPrefs($('authTools'));
    $('doneBack').onclick = function () {
      state.authDraft = { lgUser: username };
      renderLogin();
    };
    $('doneBack').focus();
  }

  function renderNotConfigured() {
    hideChrome();
    $('view').innerHTML = authShell(
      '<div class="auth-mark warn" aria-hidden="true">' + ic('warning-circle') + '</div>' +
      '<h1 class="heading-5">' + esc(t('boot.notConfiguredTitle')) + '</h1>' +
      '<p class="body-3 muted">' + esc(t('boot.notConfiguredText')) + '</p>'
    );
    bindPrefs($('authTools'));
  }

  function renderBootError(msg) {
    hideChrome();
    $('view').innerHTML = authShell(
      '<div class="auth-mark warn" aria-hidden="true">' + ic('warning-circle') + '</div>' +
      '<h1 class="heading-5">' + esc(t('boot.errorTitle')) + '</h1>' +
      '<p class="body-3 muted">' + esc(msg) + '</p><div class="sp-24"></div>' +
      '<button type="button" class="btn primary block" id="bootRetry"><span>' + esc(t('common.retry')) + '</span></button>'
    );
    bindPrefs($('authTools'));
    $('bootRetry').onclick = boot;
  }

  function afterLogin() {
    var saved = load('cs_builder');
    state.builder = saved && saved.items ? saved : newBuilder();
    if (!state.builder.leader) {
      state.builder.leader = state.user.displayName;
    }
    state.view = firstView();
    state.reveal = true;
    syncBuilderSongs();
    render();
  }

  function refreshAll() {
    return fetchBoot().then(function (data) {
      applyBoot(data);
      afterDataChange();
    }).catch(fail);
  }

  function afterDataChange() {
    if (!viewAllowed(state.view)) {
      show(firstView());
      return;
    }
    var builderChanged = syncBuilderSongs();
    renderNav();
    if (state.view === 'library') {
      renderLibraryList();
    } else if (state.view === 'builder' && builderChanged) {
      renderBuilder();
    }
  }

  function refreshPending() {
    return api('listUsers').then(function (users) {
      state.users = users;
      state.usersLoaded = true;
      state.pendingCount = users.filter(function (u) { return u.status === 'pending'; }).length;
      renderNav();
      if (state.view === 'users') {
        renderUsersBody();
      }
    }).catch(function () {});
  }

  function refreshSongs() {
    return api('listSongs').then(function (songs) {
      state.songs = songs;
      state.songsLoaded = true;
      saveCache();
      afterDataChange();
    }).catch(fail);
  }

  function songMatches(s, q) {
    if (!q) {
      return true;
    }
    var hay = (s.title + ' ' + s.artist + ' ' + s.tags + ' ' + (s.searchText || '')).toLowerCase();
    return q.toLowerCase().split(/\s+/).filter(Boolean).every(function (w) { return hay.indexOf(w) >= 0; });
  }

  function renderLibrary() {
    $('view').innerHTML =
      '<div class="card">' +
      '<div class="row"><div class="grow"><h1 class="heading-5">' + esc(t('library.title')) + '</h1><div class="caption-2 muted" id="libCount"></div></div>' +
      (can('songs.edit') ? '<button type="button" class="btn primary" id="btnNewSong">' + btnLabel('plus', t('library.add')) + '</button>' : '') +
      '</div><div class="sp-16"></div>' +
      '<div class="row"><div class="search grow">' + ic('magnifying-glass') + '<input type="search" id="libSearch" aria-label="' + esc(t('library.search')) + '" placeholder="' + esc(t('library.search')) + '" value="' + esc(state.search) + '"></div>' +
      '<select id="libSort" class="auto" aria-label="' + esc(t('library.sortLabel')) + '">' +
      '<option value="title">' + esc(t('library.sortTitle')) + '</option><option value="uses">' + esc(t('library.sortUses')) + '</option><option value="last">' + esc(t('library.sortLast')) + '</option><option value="updated">' + esc(t('library.sortUpdated')) + '</option>' +
      '</select></div></div>' +
      '<div class="card"><div id="libList"></div></div>';
    $('libSort').value = state.sort;
    $('libSearch').oninput = function () { state.search = this.value; renderLibraryList(); };
    $('libSort').onchange = function () { state.sort = this.value; renderLibraryList(); };
    if ($('btnNewSong')) {
      $('btnNewSong').onclick = function () { openEditor(null); };
    }
    renderLibraryList();
  }

  function sortedSongs() {
    var list = state.songs.filter(function (s) { return songMatches(s, state.search); });
    var sorters = {
      title: function (a, b) { return a.title.localeCompare(b.title, 'th'); },
      uses: function (a, b) { return b.useCount - a.useCount || a.title.localeCompare(b.title, 'th'); },
      last: function (a, b) { return (b.lastUsed || '').localeCompare(a.lastUsed || '') || a.title.localeCompare(b.title, 'th'); },
      updated: function (a, b) { return (b.updatedAt || '').localeCompare(a.updatedAt || ''); }
    };
    return list.sort(sorters[state.sort] || sorters.title);
  }

  function renderLibraryList() {
    var el = $('libList');
    if (!el) {
      return;
    }
    if (!state.songsLoaded) {
      el.innerHTML = skeleton(6);
      return;
    }
    var list = sortedSongs();
    $('libCount').textContent = tCount('library.count', state.songs.length) + (state.search ? t('library.found', { n: list.length }) : '');
    if (!state.songs.length) {
      el.innerHTML = emptyState('music-notes', t('library.emptyTitle'), can('songs.edit') ? t('library.emptyText') : t('library.emptyTextViewer'),
        can('songs.edit') ? '<button type="button" class="btn primary" id="emptyAdd">' + btnLabel('plus', t('library.add')) + '</button>' : '');
      if ($('emptyAdd')) {
        $('emptyAdd').onclick = function () { openEditor(null); };
      }
      return;
    }
    if (!list.length) {
      el.innerHTML = emptyState('magnifying-glass', t('library.noMatchTitle'), t('library.noMatchText'));
      return;
    }
    var inBuilder = {};
    if (state.builder) {
      state.builder.items.forEach(function (it) { inBuilder[it.songId] = true; });
    }
    el.innerHTML = '<table class="list"><thead><tr><th>' + esc(t('library.colTitle')) + '</th><th>' + esc(t('library.colKey')) + '</th><th>' + esc(t('library.colUses')) + '</th><th>' + esc(t('library.colLast')) + '</th><th><span class="sr-only">' + esc(t('common.actions')) + '</span></th></tr></thead><tbody>' +
      list.map(function (s) {
        return '<tr><td class="cell-main"><button type="button" class="song-title-link" data-open="' + esc(s.id) + '">' + esc(s.title) + '</button>' +
          (s.artist ? '<div class="caption-2 muted">' + esc(s.artist) + '</div>' : '') +
          (s.tags ? '<div class="tags">' + s.tags.split(',').map(function (tg) { return tg.trim() ? '<span class="pill gray">' + esc(tg.trim()) + '</span>' : ''; }).join('') + '</div>' : '') +
          '</td><td data-label="' + esc(t('library.colKey')) + '">' + (s.originalKey ? '<span class="pill">' + esc(s.originalKey) + '</span>' : '<span class="muted">-</span>') + '</td>' +
          '<td data-label="' + esc(t('library.colUses')) + '">' + esc(tCount('library.times', s.useCount)) + '</td>' +
          '<td data-label="' + esc(t('library.colLast')) + '">' + (s.lastUsed ? esc(shortDate(s.lastUsed)) : '<span class="muted">-</span>') + '</td>' +
          '<td class="cell-actions">' +
          (can('setlist.create') ? '<button type="button" class="btn sm" data-add="' + esc(s.id) + '"' + (inBuilder[s.id] ? ' disabled' : '') + '>' + (inBuilder[s.id] ? btnLabel('check', t('library.inSet')) : btnLabel('plus', t('library.addToSet'))) + '</button>' : '') +
          '</td></tr>';
      }).join('') + '</tbody></table>';
    each(el, '[data-open]', function (b) {
      b.onclick = function () { openSong(b.getAttribute('data-open')); };
    });
    each(el, '[data-add]', function (b) {
      b.onclick = function () { addToBuilder(b.getAttribute('data-add'), 0, 'auto'); };
    });
  }

  function openSong(id) {
    var local = findSong(id);
    if (local && typeof local.content === 'string') {
      state.current = JSON.parse(JSON.stringify(local));
      state.viewShift = 0;
      state.viewAcc = 'auto';
      show('song');
      return;
    }
    api('getSong', id).then(function (song) {
      state.current = song;
      state.viewShift = 0;
      state.viewAcc = 'auto';
      show('song');
    }).catch(fail);
  }

  function upsertSong(saved) {
    var existing = findSong(saved.id);
    var merged = JSON.parse(JSON.stringify(saved));
    merged.searchText = String(saved.content || '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').substring(0, 400);
    merged.useCount = existing ? existing.useCount : 0;
    merged.lastUsed = existing ? existing.lastUsed : '';
    if (existing) {
      state.songs[state.songs.indexOf(existing)] = merged;
    } else {
      state.songs.push(merged);
    }
    saveCache();
  }

  function accOptions(selected) {
    return ACCS.map(function (a) {
      return '<option value="' + a + '"' + (selected === a ? ' selected' : '') + '>' + esc(t('acc.' + a)) + '</option>';
    }).join('');
  }

  function renderSong() {
    var s = state.current;
    if (!s) {
      go('library');
      return;
    }
    var prepared = C.prepareForOutput(s, state.viewShift, state.viewAcc);
    $('view').innerHTML =
      '<div class="card">' +
      '<div class="row"><button type="button" class="btn sm ghost" id="backLib">' + btnLabel('arrow-left', t('common.back')) + '</button></div><div class="sp-12"></div>' +
      '<div class="row"><div class="grow"><h1 class="heading-5">' + esc(s.title) + '</h1>' +
      '<div class="caption-2 muted">' + (s.artist ? esc(s.artist) + ' · ' : '') + esc(t('song.originalKey', { key: s.originalKey || '-' })) + ' · ' + esc(t('song.lastEditedBy', { name: s.updatedBy || '-' })) + '</div></div>' +
      '<div class="row">' +
      (can('songs.edit') ? '<button type="button" class="btn" id="btnEdit">' + btnLabel('pencil-simple', t('common.edit')) + '</button>' : '') +
      (can('songs.delete') ? '<button type="button" class="btn danger" id="btnDel">' + btnLabel('trash', t('common.delete')) + '</button>' : '') +
      (can('setlist.create') ? '<button type="button" class="btn primary" id="btnAdd">' + btnLabel('list-plus', t('song.addToSet')) + '</button>' : '') +
      '</div></div><div class="sp-16"></div>' +
      '<div class="row song-tools">' +
      '<div class="song-dock" id="songDock">' +
      '<span class="keybox dock-key" role="group" aria-label="' + esc(t('song.keyLabel')) + '"><button type="button" id="kDown" aria-label="' + esc(t('song.down')) + '">− ½</button><span class="k" aria-live="polite">' + esc(prepared.key || C.shiftLabel(state.viewShift)) + '</span><button type="button" id="kUp" aria-label="' + esc(t('song.up')) + '">+ ½</button></span>' +
      '<button type="button" class="btn sm dock-reset" id="kReset" aria-label="' + esc(t('song.resetKey')) + '">' + ic('arrow-counter-clockwise') + '<span class="dock-label">' + esc(t('song.resetKey')) + '</span></button>' +
      '<span class="keybox dock-zoom" role="group" aria-label="' + esc(t('song.textSize')) + '"><button type="button" id="zOut" aria-label="' + esc(t('song.smaller')) + '">A−</button><span class="k k-sm">' + state.viewZoom + '</span><button type="button" id="zIn" aria-label="' + esc(t('song.larger')) + '">A+</button></span>' +
      '</div>' +
      '<span class="caption-2 muted shift-note">' + esc(t('song.shift', { n: C.shiftLabel(state.viewShift) })) + '</span>' +
      '<select id="kAcc" class="auto acc-select" aria-label="#/b">' + accOptions(state.viewAcc) + '</select>' +
      '</div></div>' +
      '<div class="card"><div class="sheet" style="font-size:' + state.viewZoom + 'px">' + C.renderHtml(prepared.content) + '</div></div>' +
      '<div class="dock-spacer" aria-hidden="true"></div>';
    $('backLib').onclick = function () { go('library'); };
    $('kDown').onclick = function () { state.viewShift = shiftStep(state.viewShift, -1); renderSong(); $('kDown').focus(); };
    $('kUp').onclick = function () { state.viewShift = shiftStep(state.viewShift, 1); renderSong(); $('kUp').focus(); };
    $('kReset').onclick = function () { state.viewShift = 0; state.viewAcc = 'auto'; renderSong(); $('kReset').focus(); };
    $('kAcc').onchange = function () { state.viewAcc = this.value; renderSong(); $('kAcc').focus(); };
    $('zOut').onclick = function () { state.viewZoom = Math.max(11, state.viewZoom - 1); renderSong(); $('zOut').focus(); };
    $('zIn').onclick = function () { state.viewZoom = Math.min(30, state.viewZoom + 1); renderSong(); $('zIn').focus(); };
    if ($('btnEdit')) {
      $('btnEdit').onclick = function () { openEditor(s); };
    }
    if ($('btnAdd')) {
      $('btnAdd').onclick = function () { addToBuilder(s.id, state.viewShift, state.viewAcc); };
    }
    if ($('btnDel')) {
      $('btnDel').onclick = function () {
        confirmBox(t('song.deleteConfirm', { title: s.title }), t('common.delete'), true).then(function (ok) {
          if (!ok) {
            return;
          }
          api('deleteSong', s.id).then(function () {
            toast(t('song.deleted'));
            state.current = null;
            state.songs = state.songs.filter(function (x) { return x.id !== s.id; });
            saveCache();
            syncBuilderSongs();
            go('library');
            refreshSongs();
          }).catch(fail);
        });
      };
    }
  }

  function shiftStep(shift, delta) {
    var n = shift + delta;
    if (n > 11) { n -= 12; }
    if (n < -11) { n += 12; }
    return n;
  }

  function openEditor(song) {
    var base = song ? JSON.parse(JSON.stringify(song)) : { id: '', title: '', artist: '', originalKey: '', tags: '', defaultLayout: 'auto', content: '' };
    var ed = C.toEditable(base.content || '');
    base.text = ed.text;
    base.memo = ed.memo;
    state.editing = base;
    show('editor');
  }

  function renderEditor() {
    var s = state.editing;
    if (!s) {
      go('library');
      return;
    }
    var helps = ['editor.help1', 'editor.help2', 'editor.help3', 'editor.help4', 'editor.help5', 'editor.help6', 'editor.help7'];
    $('view').innerHTML =
      '<div class="card"><div class="row"><button type="button" class="btn sm ghost" id="edBack">' + btnLabel('arrow-left', t('common.cancel')) + '</button><div class="grow"><h1 class="heading-5">' + esc(s.id ? t('editor.titleEdit') : t('editor.titleNew')) + '</h1></div>' +
      '<button type="button" class="btn primary" id="edSave">' + btnLabel('check', t('common.save')) + '</button></div></div>' +
      '<div class="card"><div class="grid2">' +
      field('edTitle', t('editor.fTitle') + ' *', '<input type="text" id="edTitle" value="' + esc(s.title) + '">') +
      field('edArtist', t('editor.fArtist'), '<input type="text" id="edArtist" value="' + esc(s.artist) + '">') +
      field('edKey', t('editor.fKey'), '<input type="text" id="edKey" list="keyList" value="' + esc(s.originalKey) + '" placeholder="' + esc(t('editor.keyPlaceholder')) + '" autocapitalize="none" spellcheck="false">' +
        '<datalist id="keyList">' + KEY_OPTIONS.map(function (k) { return '<option value="' + k + '">'; }).join('') + '</datalist>') +
      field('edLayout', t('editor.fLayout'), '<select id="edLayout">' + LAYOUTS.map(function (l) { return '<option value="' + l + '">' + esc(t('layout.' + l)) + '</option>'; }).join('') + '</select>') +
      '<div class="span-all">' + field('edTags', t('editor.fTags'), '<input type="text" id="edTags" value="' + esc(s.tags) + '" placeholder="' + esc(t('editor.tagsPlaceholder')) + '">') + '</div>' +
      '</div></div>' +
      '<div class="grid2">' +
      '<div class="card"><div class="row"><h2 class="heading-6 grow">' + esc(t('editor.content')) + '</h2><button type="button" class="btn sm" id="edTidy">' + btnLabel('magic-wand', t('editor.tidy')) + '</button></div><div class="sp-12"></div>' +
      '<textarea class="code" id="edContent" spellcheck="false" aria-label="' + esc(t('editor.content')) + '" placeholder="' + esc(t('editor.placeholder')) + '"></textarea>' +
      '<p class="field-error" id="edContentErr" hidden></p>' +
      '<div class="sp-12"></div><div class="help">' + helps.map(function (h, i) {
        return '<p>' + t(h) + '</p>' + (i === 2 ? '<pre class="help-pre">G       D\nAmazing grace</pre>' : '');
      }).join('') + '</div></div>' +
      '<div class="card"><h2 class="heading-6">' + esc(t('editor.preview')) + '</h2><div class="sp-12"></div><div class="sheet" id="edPreview" aria-live="off"></div></div>' +
      '</div>';
    $('edContent').value = s.text;
    $('edLayout').value = s.defaultLayout || 'auto';
    var updatePreview = function () {
      s.text = $('edContent').value;
      var content = C.fromEditable(s.text, s.memo);
      $('edPreview').innerHTML = content.trim() ? C.renderHtml(content) : '<p class="caption-2 muted">' + esc(t('editor.previewEmpty')) + '</p>';
    };
    updatePreview();
    $('edContent').oninput = function () {
      setFieldError('edContent', '');
      updatePreview();
    };
    $('edContent').onpaste = function () {
      var before = $('edContent').value;
      setTimeout(function () {
        if (before.trim() || !$('edContent')) {
          return;
        }
        var pasted = $('edContent').value;
        var res = C.tidy(pasted, null);
        if (res.text !== pasted) {
          $('edContent').value = res.text;
          s.memo = res.memo;
          toast(t('editor.pasted'));
        }
        updatePreview();
      }, 0);
    };
    $('edTidy').onclick = function () {
      var res = C.tidy($('edContent').value, s.memo);
      $('edContent').value = res.text;
      s.memo = res.memo;
      updatePreview();
      toast(t('editor.tidied'));
    };
    $('edTitle').oninput = function () { s.title = this.value; setFieldError('edTitle', ''); };
    $('edArtist').oninput = function () { s.artist = this.value; };
    $('edKey').oninput = function () { s.originalKey = this.value; setFieldError('edKey', ''); };
    $('edLayout').onchange = function () { s.defaultLayout = this.value; };
    $('edTags').oninput = function () { s.tags = this.value; };
    $('edBack').onclick = function () {
      if (s.id && state.current && state.current.id === s.id) {
        show('song');
      } else {
        go('library');
      }
    };
    $('edSave').onclick = function () { saveEditor(false); };
  }

  function saveEditor(allowDuplicate) {
    var s = state.editing;
    var key = $('edKey').value.trim();
    var title = $('edTitle').value;
    var content = C.fromEditable($('edContent').value, s.memo);
    var bad = null;
    if (!title.trim()) {
      setFieldError('edTitle', t('err.TITLE_REQUIRED'));
      bad = bad || 'edTitle';
    }
    if (key && !C.parseKey(key)) {
      setFieldError('edKey', t('err.KEY_FORMAT'));
      bad = bad || 'edKey';
    }
    if (!content.trim()) {
      setFieldError('edContent', t('err.CONTENT_REQUIRED'));
      bad = bad || 'edContent';
    }
    if (bad) {
      $(bad).focus();
      return;
    }
    var data = {
      id: s.id,
      title: title,
      artist: $('edArtist').value,
      originalKey: key,
      defaultLayout: $('edLayout').value,
      tags: $('edTags').value,
      content: content,
      allowDuplicate: allowDuplicate
    };
    $('edSave').disabled = true;
    api('saveSong', data).then(function (saved) {
      toast(t('editor.saved'));
      state.current = saved;
      state.viewShift = 0;
      state.viewAcc = 'auto';
      state.editing = null;
      if (state.builder) {
        state.builder.items.forEach(function (it) {
          if (it.songId === saved.id) {
            it.content = saved.content;
            it.title = saved.title;
            it.originalKey = saved.originalKey;
          }
        });
        saveBuilder();
      }
      upsertSong(saved);
      show('song');
    }).catch(function (e) {
      if ($('edSave')) {
        $('edSave').disabled = false;
      }
      if (e.message === 'DUPLICATE_TITLE') {
        confirmBox(t('editor.duplicate'), t('common.save')).then(function (ok) {
          if (ok) {
            saveEditor(true);
          }
        });
        return;
      }
      fail(e);
    });
  }

  function addToBuilder(songId, shift, acc) {
    if (!state.builder) {
      state.builder = newBuilder();
    }
    if (state.builder.items.some(function (it) { return it.songId === songId; })) {
      toast(t('builder.already'));
      return;
    }
    var push = function (s) {
      state.builder.items.push({
        songId: s.id,
        title: s.title,
        originalKey: s.originalKey,
        content: s.content,
        shift: shift || 0,
        accidental: acc || 'auto',
        layout: s.defaultLayout || 'auto',
        note: '',
        open: false
      });
      saveBuilder();
      toast(t('builder.added', { title: s.title, n: state.builder.items.length }));
      renderNav();
      if (state.view === 'library') {
        renderLibraryList();
      }
      if (state.view === 'builder') {
        renderBuilder();
      }
    };
    var local = findSong(songId);
    if (local && typeof local.content === 'string') {
      push(local);
      return;
    }
    api('getSong', songId).then(push).catch(fail);
  }

  function renderBuilder() {
    var b = state.builder;
    var hasNotes = b.description.trim() !== '' || b.items.some(function (it) { return (it.note || '').trim() !== ''; });
    var effectiveDoc = b.outputType === 'doc' || hasNotes;
    $('view').innerHTML =
      '<div class="card"><div class="row"><div class="grow"><h1 class="heading-5">' + esc(t('builder.title')) + '</h1><div class="caption-2 muted">' + esc(t('builder.subtitle')) + '</div></div>' +
      '<button type="button" class="btn danger" id="bClear">' + btnLabel('trash', t('builder.clear')) + '</button></div></div>' +
      '<div class="card"><div class="grid2">' +
      field('bDate', t('builder.date'), '<input type="date" id="bDate" value="' + esc(b.serviceDate) + '">') +
      field('bLeader', t('builder.leader'), '<input type="text" id="bLeader" list="leaderList" value="' + esc(b.leader) + '">' +
        '<datalist id="leaderList">' + state.leaders.map(function (n) { return '<option value="' + esc(n) + '">'; }).join('') + '</datalist>') +
      '<div class="span-all">' + field('bTitle', t('builder.header'), '<input type="text" id="bTitle" value="' + esc(b.title) + '">') + '</div>' +
      '<div class="span-all">' + field('bDesc', t('builder.desc'), '<textarea id="bDesc" rows="2">' + esc(b.description) + '</textarea>') + '</div>' +
      '</div></div>' +
      '<div class="card"><div class="row"><h2 class="heading-6 grow">' + esc(t('builder.songs', { n: b.items.length })) + '</h2></div><div class="sp-12"></div>' +
      '<div class="dropdown"><div class="search">' + ic('magnifying-glass') + '<input type="search" id="bPick" aria-label="' + esc(t('builder.pick')) + '" placeholder="' + esc(t('builder.pick')) + '" value="' + esc(state.pickerQuery) + '" autocomplete="off"></div><div class="menu hide" id="bMenu" role="listbox"></div></div>' +
      '<div class="sp-16"></div><div id="bItems"></div></div>' +
      '<div class="card"><h2 class="heading-6">' + esc(t('builder.output')) + '</h2><div class="sp-12"></div>' +
      '<div class="row">' +
      '<label class="check"><input type="radio" name="bOut" value="pdf"' + (!effectiveDoc ? ' checked' : '') + (hasNotes ? ' disabled' : '') + '><span>' + ic('file-pdf') + ' ' + esc(t('builder.pdf')) + '</span></label>' +
      '<label class="check"><input type="radio" name="bOut" value="doc"' + (effectiveDoc ? ' checked' : '') + '><span>' + ic('file-doc') + ' ' + esc(t('builder.doc')) + '</span></label>' +
      '</div>' +
      (hasNotes ? '<p class="caption-2 muted">' + esc(t('builder.hasNotes')) + '</p>' : '') +
      '<div class="sp-16"></div><button type="button" class="btn primary" id="bGen"' + (b.items.length ? '' : ' disabled') + '>' + btnLabel('download-simple', t('builder.generate')) + '</button>' +
      '<div id="bSaved">' + savedNote() + '</div>' +
      '<div id="bResult" aria-live="polite"></div></div>';

    $('bDate').onchange = function () {
      b.serviceDate = this.value;
      if (b.titleAuto) {
        b.title = defaultTitle(b.serviceDate);
        $('bTitle').value = b.title;
      }
      saveBuilder();
    };
    $('bLeader').oninput = function () { b.leader = this.value; saveBuilder(); };
    $('bTitle').oninput = function () { b.title = this.value; b.titleAuto = false; saveBuilder(); };
    $('bDesc').oninput = function () { b.description = this.value; saveBuilder(); };
    $('bDesc').onchange = function () { renderBuilder(); };
    each(document, 'input[name=bOut]', function (r) {
      r.onchange = function () { b.outputType = this.value; saveBuilder(); };
    });
    $('bClear').onclick = function () {
      confirmBox(t('builder.clearConfirm'), t('builder.clearOk'), true).then(function (ok) {
        if (ok) {
          state.builder = newBuilder();
          state.lastResult = null;
          saveBuilder();
          render();
        }
      });
    };
    $('bGen').onclick = generate;
    setupPicker();
    renderBuilderItems();
    if (state.lastResult) {
      renderResult(state.lastResult);
    }
  }

  function setupPicker() {
    var input = $('bPick');
    var menu = $('bMenu');
    var show2 = function () {
      var q = input.value.trim();
      state.pickerQuery = input.value;
      if (!q) {
        menu.classList.add('hide');
        return;
      }
      var taken = {};
      state.builder.items.forEach(function (it) { taken[it.songId] = true; });
      var list = state.songs.filter(function (s) { return !taken[s.id] && songMatches(s, q); }).slice(0, 12);
      if (!list.length) {
        menu.innerHTML = '<div class="menu-empty caption-2 muted">' + esc(t('builder.noMatch')) + '</div>';
      } else {
        menu.innerHTML = list.map(function (s) {
          return '<div class="menu-item" role="option" data-pick="' + esc(s.id) + '"><span class="title-4">' + esc(s.title) + '</span> <span class="caption-2 muted">' + esc(t('builder.pickMeta', { key: s.originalKey || '', n: s.useCount })) + '</span></div>';
        }).join('');
      }
      menu.classList.remove('hide');
      each(menu, '[data-pick]', function (d) {
        d.onmousedown = function (e) {
          e.preventDefault();
          state.pickerQuery = '';
          input.value = '';
          menu.classList.add('hide');
          addToBuilder(d.getAttribute('data-pick'), 0, 'auto');
        };
      });
    };
    input.oninput = show2;
    input.onfocus = show2;
    input.onblur = function () { setTimeout(function () { menu.classList.add('hide'); }, 150); };
  }

  function renderBuilderItems() {
    var b = state.builder;
    var el = $('bItems');
    if (!b.items.length) {
      el.innerHTML = emptyState('playlist', t('builder.emptyTitle'), t('builder.emptyText'));
      return;
    }
    el.innerHTML = b.items.map(function (it, i) {
      var prepared = it.content ? C.prepareForOutput(it, it.shift, it.accidental) : { key: '', content: '' };
      return '<div class="item" data-i="' + i + '">' +
        '<div class="row"><span class="num">' + (i + 1) + '.</span><span class="title-3 grow">' + esc(it.title) + '</span>' +
        '<button type="button" class="btn sm icon" data-act="up" aria-label="' + esc(t('common.moveUp')) + '"' + (i === 0 ? ' disabled' : '') + '>' + ic('arrow-up') + '</button>' +
        '<button type="button" class="btn sm icon" data-act="down" aria-label="' + esc(t('common.moveDown')) + '"' + (i === b.items.length - 1 ? ' disabled' : '') + '>' + ic('arrow-down') + '</button>' +
        '<button type="button" class="btn sm danger" data-act="remove">' + btnLabel('trash', t('common.remove')) + '</button></div>' +
        '<div class="sp-8"></div><div class="row">' +
        '<span class="keybox" role="group" aria-label="' + esc(t('song.keyLabel')) + '"><button type="button" data-act="kdown" aria-label="' + esc(t('song.down')) + '">− ½</button><span class="k">' + esc(prepared.key || C.shiftLabel(it.shift)) + '</span><button type="button" data-act="kup" aria-label="' + esc(t('song.up')) + '">+ ½</button></span>' +
        '<span class="caption-2 muted">' + (it.originalKey ? esc(t('builder.originalKey', { key: it.originalKey })) + ' · ' : '') + esc(t('song.shift', { n: C.shiftLabel(it.shift) })) + '</span>' +
        '<select data-act="acc" class="auto" aria-label="#/b">' + accOptions(it.accidental) + '</select>' +
        '<select data-act="layout" class="auto" aria-label="' + esc(t('editor.fLayout')) + '">' + LAYOUTS.map(function (l) { return '<option value="' + l + '"' + (it.layout === l ? ' selected' : '') + '>' + esc(t('layout.' + l)) + '</option>'; }).join('') + '</select>' +
        '<button type="button" class="btn sm" data-act="toggle" aria-expanded="' + (it.open ? 'true' : 'false') + '">' + btnLabel(it.open ? 'eye-slash' : 'eye', it.open ? t('builder.hidePreview') : t('builder.preview')) + '</button>' +
        '</div><div class="sp-8"></div>' +
        '<textarea data-act="note" rows="1" aria-label="' + esc(t('builder.note')) + '" placeholder="' + esc(t('builder.note')) + '">' + esc(it.note || '') + '</textarea>' +
        (it.open ? '<div class="sheet item-preview">' + C.renderHtml(prepared.content) + '</div>' : '') +
        '</div>';
    }).join('');
    each(el, '.item', function (card) {
      var i = Number(card.getAttribute('data-i'));
      var it = b.items[i];
      each(card, '[data-act]', function (c) {
        var act = c.getAttribute('data-act');
        if (act === 'note') {
          c.oninput = function () { it.note = this.value; saveBuilder(); };
          c.onchange = function () { renderBuilder(); };
          return;
        }
        if (act === 'acc' || act === 'layout') {
          c.onchange = function () {
            if (act === 'acc') { it.accidental = this.value; } else { it.layout = this.value; }
            saveBuilder();
            renderBuilderItems();
          };
          return;
        }
        c.onclick = function () {
          if (act === 'up' && i > 0) { b.items.splice(i - 1, 0, b.items.splice(i, 1)[0]); }
          if (act === 'down' && i < b.items.length - 1) { b.items.splice(i + 1, 0, b.items.splice(i, 1)[0]); }
          if (act === 'remove') { b.items.splice(i, 1); }
          if (act === 'kup') { it.shift = shiftStep(it.shift, 1); }
          if (act === 'kdown') { it.shift = shiftStep(it.shift, -1); }
          if (act === 'toggle') { it.open = !it.open; }
          saveBuilder();
          if (act === 'remove') {
            renderBuilder();
            renderNav();
          } else {
            renderBuilderItems();
          }
        };
      });
    });
  }

  function savedNote() {
    var b = state.builder;
    if (!b || !b.setlistId) {
      return '';
    }
    return '<div class="sp-12"></div><p class="note-line caption-2">' + ic('info') + '<span>' + esc(t('builder.updateNote')) + '</span></p>';
  }

  function base64ToBlob(b64, type) {
    var bin = atob(b64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return new Blob([bytes], { type: type });
  }

  function saveFile(file) {
    if (!file || (!file.blob && !file.base64)) {
      return false;
    }
    if (!file.blob) {
      file.blob = base64ToBlob(file.base64, file.mimeType || 'application/octet-stream');
      delete file.base64;
    }
    var url = URL.createObjectURL(file.blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = file.name || 'setlist';
    a.rel = 'noopener';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      if (a.parentNode) {
        a.parentNode.removeChild(a);
      }
      URL.revokeObjectURL(url);
    }, 60000);
    return true;
  }

  function sortSetlists(list) {
    return list.sort(function (a, b) {
      return (String(b.serviceDate) + String(b.createdAt)).localeCompare(String(a.serviceDate) + String(a.createdAt));
    });
  }

  function rememberSetlist(id, payload, outputType) {
    if (!state.setlistsLoaded || !id) {
      return;
    }
    var old = state.setlists.filter(function (s) { return s.id === id; })[0];
    var rec = {
      id: id,
      title: payload.title,
      serviceDate: payload.serviceDate,
      leader: payload.leader || (state.user ? state.user.displayName : ''),
      description: payload.description,
      outputType: outputType,
      createdBy: old ? old.createdBy : (state.user ? state.user.displayName : ''),
      createdAt: old ? old.createdAt : new Date().toISOString(),
      songTitles: payload.items.map(function (it) { return it.title; }),
      songs: payload.items.map(function (it) { return { title: it.title, key: it.key }; })
    };
    state.setlists = sortSetlists(state.setlists.filter(function (s) { return s.id !== id; }).concat([rec]));
  }

  function generate() {
    var b = state.builder;
    if (b.items.some(function (it) { return !it.content; })) {
      toast(t('builder.loadingSongs'), true);
      return;
    }
    var items = b.items.map(function (it) {
      var p = C.prepareForOutput(it, it.shift, it.accidental);
      return { songId: it.songId, title: it.title, key: p.key, shift: it.shift, accidental: it.accidental, layout: it.layout, note: it.note || '', content: p.content };
    });
    var payload = { setlistId: b.setlistId || '', title: b.title, serviceDate: b.serviceDate, leader: b.leader, description: b.description, outputType: b.outputType, items: items };
    $('bGen').disabled = true;
    $('bResult').innerHTML = '<div class="sp-12"></div><div class="progress-note">' + ic('hourglass-medium') + '<span class="body-6">' + esc(t('builder.generating')) + '</span></div>';
    api('generateSetlist', payload).then(function (res) {
      var current = state.builder === b;
      if (current && res && res.setlistId) {
        b.setlistId = res.setlistId;
        saveBuilder();
      }
      rememberSetlist(res && res.setlistId, payload, res && res.outputType);
      if (res && res.file) {
        saveFile(res.file);
      }
      if (current) {
        state.lastResult = res;
      }
      if ($('bGen')) {
        $('bGen').disabled = false;
      }
      if ($('bSaved')) {
        $('bSaved').innerHTML = savedNote();
      }
      if (current) {
        renderResult(res);
      }
      toast(t(res && res.updated ? 'builder.doneUpdated' : 'builder.done'));
      refreshSongs();
      api('listLeaderNames').then(function (names) { state.leaders = names; }).catch(function () {});
    }).catch(function (e) {
      if ($('bGen')) {
        $('bGen').disabled = false;
      }
      if ($('bResult')) {
        $('bResult').innerHTML = '';
        if (state.lastResult && state.builder === b) {
          renderResult(state.lastResult);
        }
      }
      fail(e);
    });
  }

  function legacyLinks(r) {
    var out = [];
    if (r.docUrl) {
      out.push('<a class="btn" target="_blank" rel="noopener" href="' + esc(r.docUrl) + '">' + btnLabel('file-doc', t('result.openDoc')) + '</a>');
    }
    if (r.pdfUrl) {
      out.push('<a class="btn" target="_blank" rel="noopener" href="' + esc(r.pdfUrl) + '">' + btnLabel('file-pdf', t('result.openPdf')) + '</a>');
    }
    return out.length ? '<div class="result-links">' + out.join('') + '</div>' : '';
  }

  function pageSongLabel(s) {
    if (typeof s === 'string') {
      return s;
    }
    return s.title + ' · ' + (L.has('reason.' + s.reason) ? t('reason.' + s.reason) : s.reason);
  }

  function finishSetlist() {
    state.builder = newBuilder();
    state.lastResult = null;
    state.pickerQuery = '';
    saveBuilder();
    toast(t('builder.finished'));
    go(viewAllowed('history') ? 'history' : 'builder');
  }

  function renderResult(r) {
    var el = $('bResult');
    if (!el) {
      return;
    }
    var isDoc = r.outputType === 'doc';
    var hasFile = !!(r.file && (r.file.blob || r.file.base64));
    el.innerHTML = '<div class="sp-16"></div><div class="result">' +
      '<div class="row result-head">' + ic('check-circle') + '<span class="title-3 grow">' + esc(t(hasFile ? (r.updated ? 'result.updated' : 'result.done') : 'result.created')) + '</span><span class="pill gray">' + ic(isDoc ? 'file-doc' : 'file-pdf') + esc(isDoc ? t('result.typeDoc') : 'PDF') + '</span></div>' +
      (hasFile ?
        '<div class="sp-12"></div><div class="result-file">' + ic(isDoc ? 'file-doc' : 'file-pdf') + '<div class="result-file-text"><span class="title-4">' + esc(r.file.name) + '</span><span class="caption-2 muted">' + esc(t('result.downloaded')) + '</span></div>' +
        '<button type="button" class="btn sm" id="rAgain">' + btnLabel('download-simple', t('result.downloadAgain')) + '</button></div>' :
        '<div class="sp-8"></div>' + legacyLinks(r)) +
      ((r.pages || []).length ? '<div class="sp-12"></div><div class="result-pages">' + r.pages.map(function (p) {
        return '<div class="caption-2 muted">' + esc(t('result.page', { page: p.page, songs: p.songs.map(pageSongLabel).join(' | ') })) + '</div>';
      }).join('') + '</div>' : '') +
      '<div class="result-finish"><p class="body-6 grow">' + esc(t('result.finishHint')) + '</p>' +
      '<button type="button" class="btn primary" id="rFinish">' + btnLabel('check-square-offset', t('result.finish')) + '</button></div>' +
      '</div>';
    if ($('rAgain')) {
      $('rAgain').onclick = function () { saveFile(r.file); };
    }
    $('rFinish').onclick = finishSetlist;
  }

  function renderHistory() {
    $('view').innerHTML = '<div class="card"><div class="row"><div class="grow"><h1 class="heading-5">' + esc(t('history.title')) + '</h1><div class="caption-2 muted">' + esc(t('history.subtitle')) + '</div></div></div>' +
      '<div class="sp-16"></div><div class="search">' + ic('magnifying-glass') + '<input type="search" id="hSearch" aria-label="' + esc(t('history.search')) + '" placeholder="' + esc(t('history.search')) + '"></div></div>' +
      '<div id="hList"><div class="card">' + skeleton(4) + '</div></div>';
    $('hSearch').oninput = renderHistoryList;
    renderHistoryList();
    api('listSetlists').then(function (list) {
      state.setlists = list;
      state.setlistsLoaded = true;
      if (state.view === 'history') {
        renderHistoryList();
      }
    }).catch(function (e) {
      if (state.view === 'history' && !state.setlistsLoaded && $('hList')) {
        $('hList').innerHTML = '<div class="card"><div class="form-error">' + esc(errMsg(e)) + '</div></div>';
      }
      fail(e);
    });
  }

  function historySongs(s) {
    if (Array.isArray(s.songs) && s.songs.length) {
      return s.songs;
    }
    return (s.songTitles || []).map(function (title) { return { title: title, key: '' }; });
  }

  function historyDate(iso) {
    var p = String(iso || '').substring(0, 10).split('-');
    if (p.length !== 3 || !Number(p[1])) {
      return '<div class="hist-date" aria-hidden="true"><span class="hist-day">–</span></div>';
    }
    var months = MONTHS[L.getLang() === 'th' ? 'th' : 'en'];
    return '<div class="hist-date" aria-hidden="true"><span class="hist-mon">' + esc(months[Number(p[1]) - 1]) + '</span><span class="hist-day">' + Number(p[2]) + '</span><span class="hist-year">' + esc(p[0]) + '</span></div>';
  }

  function historyCard(s) {
    var songs = historySongs(s);
    var actions = (can('setlist.create') ? '<button type="button" class="btn sm" data-reuse="' + esc(s.id) + '">' + btnLabel('arrow-counter-clockwise', t('history.reuse')) + '</button>' : '') +
      (can('setlist.delete') ? '<button type="button" class="btn sm danger" data-del="' + esc(s.id) + '">' + btnLabel('trash', t('common.delete')) + '</button>' : '');
    return '<article class="hist-card">' +
      '<header class="hist-head">' + historyDate(s.serviceDate) +
      '<div class="hist-info"><h2 class="title-2 hist-title">' + esc(s.title) + '</h2>' +
      '<div class="hist-meta caption-2"><span class="sr-only">' + esc(shortDate(s.serviceDate)) + '</span>' +
      (s.leader ? '<span class="hist-meta-item">' + ic('user') + '<span>' + esc(s.leader) + '</span></span>' : '') +
      '<span class="hist-meta-item">' + ic('music-notes') + '<span>' + esc(tCount('history.songCount', songs.length)) + '</span></span>' +
      '</div></div></header>' +
      (songs.length ? '<ol class="hist-songs">' + songs.map(function (song, i) {
        return '<li class="hist-song"><span class="hist-num">' + (i + 1) + '</span><span class="hist-song-title">' + esc(song.title) + '</span>' +
          (song.key ? '<span class="hist-key" aria-label="' + esc(t('history.keyLabel', { key: song.key })) + '">' + esc(song.key) + '</span>' : '') + '</li>';
      }).join('') + '</ol>' : '') +
      (s.description ? '<p class="hist-desc caption-2 pre-wrap">' + esc(s.description) + '</p>' : '') +
      (actions ? '<div class="hist-actions">' + actions + '</div>' : '') +
      '</article>';
  }

  function renderHistoryList() {
    var el = $('hList');
    if (!el || !state.setlistsLoaded) {
      return;
    }
    var q = ($('hSearch').value || '').toLowerCase().trim();
    var list = state.setlists.filter(function (s) {
      if (!q) {
        return true;
      }
      return (s.title + ' ' + s.leader + ' ' + (s.songTitles || []).join(' ') + ' ' + s.serviceDate + ' ' + shortDate(s.serviceDate)).toLowerCase().indexOf(q) >= 0;
    });
    if (!state.setlists.length) {
      el.innerHTML = '<div class="card">' + emptyState('clock-counter-clockwise', t('history.emptyTitle'), t('history.emptyText')) + '</div>';
      return;
    }
    if (!list.length) {
      el.innerHTML = '<div class="card">' + emptyState('magnifying-glass', t('history.noMatch'), '') + '</div>';
      return;
    }
    el.innerHTML = '<div class="hist-grid">' + list.map(historyCard).join('') + '</div>';
    each(el, '[data-reuse]', function (btn) {
      btn.onclick = function () { reuseSetlist(btn.getAttribute('data-reuse')); };
    });
    each(el, '[data-del]', function (btn) {
      btn.onclick = function () {
        confirmBox(t('history.deleteConfirm'), t('common.delete'), true).then(function (ok) {
          if (!ok) {
            return;
          }
          var id = btn.getAttribute('data-del');
          api('deleteSetlist', id).then(function () {
            state.setlists = state.setlists.filter(function (s) { return s.id !== id; });
            if (state.builder && state.builder.setlistId === id) {
              delete state.builder.setlistId;
              saveBuilder();
            }
            toast(t('history.deleted'));
            refreshSongs();
            renderHistory();
          }).catch(fail);
        });
      };
    });
  }

  function reuseSetlist(id) {
    var go2 = function () {
      api('getSetlist', id).then(function (s) {
        var ids = s.items.map(function (it) { return it.songId; });
        var songsReady = state.songsLoaded ? Promise.resolve(ids.reduce(function (acc, sid) {
          var local = findSong(sid);
          if (local) {
            acc[sid] = local;
          }
          return acc;
        }, {})) : api('getSongs', ids);
        return songsReady.then(function (map) {
          var date = nextSunday();
          var b = newBuilder();
          b.serviceDate = date;
          b.title = defaultTitle(date);
          b.description = s.description || '';
          var missing = 0;
          b.items = s.items.filter(function (it) {
            if (!map[it.songId]) {
              missing++;
              return false;
            }
            return true;
          }).map(function (it) {
            var song = map[it.songId];
            return { songId: song.id, title: song.title, originalKey: song.originalKey, content: song.content, shift: it.shift || 0, accidental: it.accidental || 'auto', layout: it.layout || 'auto', note: it.note || '', open: false };
          });
          state.builder = b;
          state.lastResult = null;
          saveBuilder();
          if (missing) {
            toast(t('history.missing', { n: missing }), true);
          } else {
            toast(t('history.loaded'));
          }
          go('builder');
        });
      }).catch(fail);
    };
    if (state.builder && state.builder.items.length) {
      confirmBox(t('history.replaceConfirm'), t('history.replace')).then(function (ok) { if (ok) { go2(); } });
    } else {
      go2();
    }
  }

  function renderStats() {
    var f = state.statsFilter;
    $('view').innerHTML = '<div class="card"><h1 class="heading-5">' + esc(t('stats.title')) + '</h1><div class="sp-16"></div><div class="row filters">' +
      field('sFrom', t('stats.from'), '<input type="date" id="sFrom" value="' + esc(f.from) + '">') +
      field('sTo', t('stats.to'), '<input type="date" id="sTo" value="' + esc(f.to) + '">') +
      '<div class="grow">' + field('sLeader', t('stats.leader'), '<select id="sLeader"><option value="">' + esc(t('stats.everyone')) + '</option>' + state.leaders.map(function (n) { return '<option value="' + esc(n) + '"' + (f.leader === n ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select>') + '</div>' +
      '<div class="field filter-btn"><button type="button" class="btn primary" id="sGo">' + btnLabel('chart-bar', t('stats.show')) + '</button></div>' +
      '</div></div><div id="sBody"><div class="card">' + skeleton(5) + '</div></div>';
    $('sGo').onclick = function () {
      state.statsFilter = { from: $('sFrom').value, to: $('sTo').value, leader: $('sLeader').value };
      $('sBody').innerHTML = '<div class="card">' + skeleton(5) + '</div>';
      loadStats();
    };
    if (state.stats && state.statsKey === JSON.stringify(state.statsFilter)) {
      renderStatsBody();
    }
    loadStats();
  }

  function loadStats() {
    var key = JSON.stringify(state.statsFilter);
    api('getStats', state.statsFilter).then(function (st) {
      state.stats = st;
      state.statsKey = key;
      if (!state.statsLeader || !st.leaders.some(function (l) { return l.leader === state.statsLeader; })) {
        state.statsLeader = st.leaders.length ? st.leaders[0].leader : '';
      }
      if (state.view === 'stats' && key === JSON.stringify(state.statsFilter)) {
        renderStatsBody();
      }
    }).catch(fail);
  }

  function songTable(rows, extraCol) {
    if (!rows.length) {
      return '<p class="caption-2 muted">' + esc(t('stats.noData')) + '</p>';
    }
    var max = rows[0].count || 1;
    return '<table class="list"><thead><tr><th>#</th><th>' + esc(t('stats.colSong')) + '</th><th>' + esc(t('stats.colCount')) + '</th><th>' + esc(t('stats.colKey')) + '</th>' + (extraCol ? '<th>' + esc(t('stats.colLeader')) + '</th>' : '') + '<th>' + esc(t('stats.colLast')) + '</th></tr></thead><tbody>' +
      rows.map(function (r, i) {
        return '<tr><td class="num-cell">' + (i + 1) + '</td><td class="cell-main"><button type="button" class="song-title-link" data-open="' + esc(r.songId) + '">' + esc(r.title) + '</button></td>' +
          '<td data-label="' + esc(t('stats.colCount')) + '"><div class="row tight"><div class="bar"><span style="transform:scaleX(' + (r.count / max).toFixed(3) + ')"></span></div>' + r.count + '</div></td>' +
          '<td data-label="' + esc(t('stats.colKey')) + '">' + (r.topKey ? '<span class="pill">' + esc(r.topKey) + '</span>' : '-') + '</td>' +
          (extraCol ? '<td data-label="' + esc(t('stats.colLeader')) + '">' + esc(r.topLeader || '-') + '</td>' : '') +
          '<td data-label="' + esc(t('stats.colLast')) + '">' + esc(shortDate(r.last)) + '</td></tr>';
      }).join('') + '</tbody></table>';
  }

  function renderStatsBody() {
    var st = state.stats;
    var el = $('sBody');
    if (!el) {
      return;
    }
    var leader = st.leaders.filter(function (l) { return l.leader === state.statsLeader; })[0];
    el.innerHTML =
      '<div class="grid2">' +
      '<div class="card stat"><div class="caption-2 muted">' + esc(t('stats.totalSets')) + '</div><div class="stat-num">' + st.totalSetlists + '</div></div>' +
      '<div class="card stat"><div class="caption-2 muted">' + esc(t('stats.totalUses')) + '</div><div class="stat-num">' + st.totalUses + '</div></div>' +
      '</div>' +
      '<div class="card"><h2 class="heading-6">' + esc(t('stats.topSongs')) + '</h2><div class="sp-12"></div>' + songTable(st.topSongs.slice(0, 30), true) + '</div>' +
      '<div class="card"><div class="row"><h2 class="heading-6 grow">' + esc(t('stats.byLeader')) + '</h2>' +
      '<select id="sL" class="auto" aria-label="' + esc(t('stats.leader')) + '">' + st.leaders.map(function (l) { return '<option value="' + esc(l.leader) + '"' + (l.leader === state.statsLeader ? ' selected' : '') + '>' + esc(t('stats.leaderOption', { name: l.leader, n: l.setlistCount })) + '</option>'; }).join('') + '</select></div><div class="sp-12"></div>' +
      (leader ? '<p class="caption-2 muted">' + esc(t('stats.leaderSummary', { sets: leader.setlistCount, uses: leader.total, unique: leader.songs.length })) + '</p>' + songTable(leader.songs.slice(0, 30), false) : '<p class="caption-2 muted">' + esc(t('stats.noData')) + '</p>') +
      '</div>' +
      '<div class="card"><h2 class="heading-6">' + esc(t('stats.leadersTitle')) + '</h2><div class="sp-12"></div>' + (st.leaders.length ? '<table class="list"><thead><tr><th>' + esc(t('stats.colName')) + '</th><th>' + esc(t('stats.colSets')) + '</th><th>' + esc(t('stats.colTop')) + '</th></tr></thead><tbody>' +
        st.leaders.map(function (l) {
          return '<tr><td class="cell-main">' + esc(l.leader) + '</td><td data-label="' + esc(t('stats.colSets')) + '">' + l.setlistCount + '</td><td data-label="' + esc(t('stats.colTop')) + '">' + (l.songs[0] ? esc(t('stats.topSongCount', { title: l.songs[0].title, n: l.songs[0].count })) : '-') + '</td></tr>';
        }).join('') + '</tbody></table>' : '<p class="caption-2 muted">' + esc(t('stats.noData')) + '</p>') + '</div>' +
      (st.neverUsed.length ? '<div class="card"><h2 class="heading-6">' + esc(t('stats.neverUsed', { n: st.neverUsed.length })) + '</h2><div class="sp-12"></div><div class="tags">' + st.neverUsed.map(function (s) { return '<button type="button" class="pill gray pill-btn" data-open="' + esc(s.songId) + '">' + esc(s.title) + '</button>'; }).join('') + '</div></div>' : '');
    if ($('sL')) {
      $('sL').onchange = function () { state.statsLeader = this.value; renderStatsBody(); };
    }
    each(el, '[data-open]', function (b) {
      b.onclick = function () { openSong(b.getAttribute('data-open')); };
    });
  }

  function statusPill(u) {
    if (u.status === 'pending') {
      return '<span class="pill warn">' + ic('hourglass-medium') + esc(t('users.status.pending')) + '</span>';
    }
    if (u.status === 'rejected') {
      return '<span class="pill danger">' + ic('x-circle') + esc(t('users.status.rejected')) + '</span>';
    }
    return u.active ? '<span class="pill ok">' + ic('check-circle') + esc(t('users.status.active')) + '</span>' : '<span class="pill gray">' + ic('lock-key') + esc(t('users.status.disabled')) + '</span>';
  }

  function renderUsers() {
    if (!can('users.manage')) {
      go('library');
      return;
    }
    $('view').innerHTML = '<div class="card"><div class="row"><h1 class="heading-5 grow">' + esc(t('users.title')) + '</h1><button type="button" class="btn primary" id="uNew">' + btnLabel('user-plus', t('users.add')) + '</button></div>' +
      '<div class="sp-16"></div><div class="tabs" role="tablist">' +
      '<button type="button" role="tab" class="tab" id="tabPending" data-tab="pending"></button>' +
      '<button type="button" role="tab" class="tab" id="tabAll" data-tab="all"></button>' +
      '</div></div>' +
      '<div class="card"><div id="uList" role="tabpanel">' + skeleton(4) + '</div></div>';
    $('uNew').onclick = function () { userForm(null); };
    each($('view'), '[data-tab]', function (b) {
      b.onclick = function () {
        state.usersTab = b.getAttribute('data-tab');
        renderUsersBody();
      };
    });
    if (state.usersLoaded) {
      renderUsersBody();
    } else {
      updateTabs();
    }
    api('listUsers').then(function (users) {
      state.users = users;
      state.usersLoaded = true;
      state.pendingCount = users.filter(function (u) { return u.status === 'pending'; }).length;
      renderNav();
      renderUsersBody();
    }).catch(fail);
  }

  function updateTabs() {
    var tp = $('tabPending');
    var ta = $('tabAll');
    if (!tp || !ta) {
      return;
    }
    tp.innerHTML = btnLabel('hourglass-medium', t('users.tabPending', { n: state.pendingCount }));
    ta.innerHTML = btnLabel('users', t('users.tabAll'));
    tp.classList.toggle('active', state.usersTab === 'pending');
    ta.classList.toggle('active', state.usersTab === 'all');
    tp.setAttribute('aria-selected', state.usersTab === 'pending' ? 'true' : 'false');
    ta.setAttribute('aria-selected', state.usersTab === 'all' ? 'true' : 'false');
  }

  function renderUsersBody() {
    var el = $('uList');
    if (!el) {
      return;
    }
    updateTabs();
    if (!state.usersLoaded) {
      el.innerHTML = skeleton(4);
      return;
    }
    if (state.usersTab === 'pending') {
      var pending = state.users.filter(function (u) { return u.status === 'pending'; });
      if (!pending.length) {
        el.innerHTML = emptyState('check-circle', t('users.pendingEmptyTitle'), t('users.pendingEmptyText'));
        return;
      }
      el.innerHTML = '<table class="list"><thead><tr><th>' + esc(t('users.colUsername')) + '</th><th>' + esc(t('users.colName')) + '</th><th>' + esc(t('users.colRequested')) + '</th><th><span class="sr-only">' + esc(t('common.actions')) + '</span></th></tr></thead><tbody>' +
        pending.map(function (u) {
          return '<tr><td class="cell-main"><span class="title-4">' + esc(u.username) + '</span></td><td data-label="' + esc(t('users.colName')) + '">' + esc(u.displayName) + '</td>' +
            '<td data-label="' + esc(t('users.colRequested')) + '">' + esc(shortDate(u.createdAt)) + '</td>' +
            '<td class="cell-actions"><button type="button" class="btn sm primary" data-approve="' + esc(u.username) + '">' + btnLabel('check', t('users.approve')) + '</button>' +
            '<button type="button" class="btn sm danger" data-reject="' + esc(u.username) + '">' + btnLabel('x', t('users.reject')) + '</button></td></tr>';
        }).join('') + '</tbody></table>';
    } else {
      el.innerHTML = '<table class="list"><thead><tr><th>' + esc(t('users.colUsername')) + '</th><th>' + esc(t('users.colName')) + '</th><th>' + esc(t('users.colAccess')) + '</th><th>' + esc(t('users.colStatus')) + '</th><th><span class="sr-only">' + esc(t('common.actions')) + '</span></th></tr></thead><tbody>' +
        state.users.map(function (u, i) {
          var action = '';
          if (u.status === 'pending') {
            action = '<button type="button" class="btn sm" data-goto-pending="1">' + btnLabel('hourglass-medium', t('users.review')) + '</button>';
          } else if (u.status === 'rejected') {
            action = '<button type="button" class="btn sm" data-approve="' + esc(u.username) + '">' + btnLabel('check', t('users.approve')) + '</button>';
          } else {
            action = '<button type="button" class="btn sm" data-u="' + i + '">' + btnLabel('sliders-horizontal', t('users.manage')) + '</button>';
          }
          var p = userPerms(u);
          return '<tr><td class="cell-main"><span class="title-4">' + esc(u.username) + '</span></td><td data-label="' + esc(t('users.colName')) + '">' + esc(u.displayName) + '</td>' +
            '<td data-label="' + esc(t('users.colAccess')) + '"><div class="access-cell"><span class="title-4">' + esc(accessLabel(u)) + '</span><span class="caption-5 muted">' + esc(t('users.permCount', { n: p.length, total: PERMS.length })) + '</span></div></td>' +
            '<td data-label="' + esc(t('users.colStatus')) + '">' + statusPill(u) + '</td>' +
            '<td class="cell-actions">' + action + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    each(el, '[data-u]', function (b) {
      b.onclick = function () { userForm(state.users[Number(b.getAttribute('data-u'))]); };
    });
    each(el, '[data-goto-pending]', function (b) {
      b.onclick = function () { state.usersTab = 'pending'; renderUsersBody(); };
    });
    each(el, '[data-approve]', function (b) {
      b.onclick = function () {
        var uname = b.getAttribute('data-approve');
        var u = state.users.filter(function (x) { return x.username === uname; })[0] || { username: uname, displayName: uname };
        approveDialog(u);
      };
    });
    each(el, '[data-reject]', function (b) {
      b.onclick = function () {
        var uname = b.getAttribute('data-reject');
        confirmBox(t('users.rejectConfirm', { name: uname }), t('users.reject'), true).then(function (ok) {
          if (!ok) {
            return;
          }
          api('reviewUser', uname, 'reject', '').then(function () {
            toast(t('users.rejected', { name: uname }));
            refreshPending();
          }).catch(fail);
        });
      };
    });
  }

  function permSwitches(selected, locked) {
    var on = {};
    (selected || []).forEach(function (p) { on[p] = true; });
    var adminOn = !!on['users.manage'];
    return '<div class="perm-list" role="group" aria-label="' + esc(t('users.permsTitle')) + '">' + PERMS.map(function (p) {
      var checked = adminOn || on[p];
      var disabled = locked || (adminOn && p !== 'users.manage');
      return '<label class="perm-row' + (disabled ? ' is-disabled' : '') + '"><span class="perm-text"><span class="perm-name">' + esc(t('perm.' + p)) + '</span><span class="perm-desc">' + esc(t('perm.' + p + '.d')) + '</span></span>' +
        '<span class="switch"><input type="checkbox" role="switch" data-perm="' + p + '" aria-label="' + esc(t('perm.' + p)) + '"' + (checked ? ' checked' : '') + (disabled ? ' disabled' : '') + '><span class="track"><span class="thumb"></span></span></span></label>';
    }).join('') + '</div>';
  }

  function bindPermSwitches(root) {
    var boxes = {};
    each(root, '[data-perm]', function (box) { boxes[box.getAttribute('data-perm')] = box; });
    var sync = function () {
      var adminOn = boxes['users.manage'] && boxes['users.manage'].checked;
      PERMS.forEach(function (p) {
        if (p === 'users.manage' || !boxes[p]) {
          return;
        }
        if (adminOn) {
          boxes[p].checked = true;
        }
        boxes[p].disabled = adminOn;
        boxes[p].closest('.perm-row').classList.toggle('is-disabled', adminOn);
      });
    };
    Object.keys(boxes).forEach(function (p) {
      boxes[p].onchange = function () {
        if (boxes[p].checked) {
          (PERM_NEEDS[p] || []).forEach(function (need) {
            if (boxes[need]) {
              boxes[need].checked = true;
            }
          });
        } else {
          Object.keys(PERM_NEEDS).forEach(function (dep) {
            if (PERM_NEEDS[dep].indexOf(p) >= 0 && boxes[dep]) {
              boxes[dep].checked = false;
            }
          });
        }
        sync();
      };
    });
  }

  function readPerms(root) {
    var out = [];
    each(root, '[data-perm]', function (box) {
      if (box.checked) {
        out.push(box.getAttribute('data-perm'));
      }
    });
    return out;
  }

  function approveDialog(u) {
    modal('<h3 class="heading-6" id="modalTitle">' + esc(t('users.approveTitle', { name: u.displayName || u.username })) + '</h3>' +
      '<p class="caption-2 muted">' + esc(u.username) + '</p><div class="sp-12"></div>' +
      '<p class="body-6">' + esc(t('users.permsHint')) + '</p><div class="sp-12"></div>' +
      permSwitches([], false) +
      '<div class="modal-actions"><button type="button" class="btn" id="apC">' + esc(t('common.cancel')) + '</button><button type="button" class="btn primary" id="apS">' + btnLabel('check', t('users.approve')) + '</button></div>', function () {
      bindPermSwitches($('modalRoot'));
      $('apC').onclick = closeModal;
      $('apS').onclick = function () {
        var perms = readPerms($('modalRoot'));
        $('apS').disabled = true;
        api('reviewUser', u.username, 'approve', perms).then(function () {
          closeModal();
          toast(t('users.approved', { name: u.username }));
          refreshPending();
          api('listLeaderNames').then(function (names) { state.leaders = names; }).catch(function () {});
        }).catch(function (err) {
          if ($('apS')) {
            $('apS').disabled = false;
          }
          fail(err);
        });
      };
    });
  }

  function userForm(u) {
    var isNew = !u;
    u = u || { username: '', displayName: '', perms: [], active: true };
    var self = !isNew && state.user && u.username === state.user.username;
    modal('<h3 class="heading-6" id="modalTitle">' + esc(isNew ? t('users.addTitle') : t('users.editTitle')) + '</h3>' +
      '<form id="uForm" class="form" novalidate>' +
      field('fU', t('users.colUsername'), '<input type="text" id="fU" value="' + esc(u.username) + '" autocapitalize="none" spellcheck="false"' + (isNew ? '' : ' disabled') + '>') +
      field('fN', t('users.fName'), '<input type="text" id="fN" value="' + esc(u.displayName) + '">') +
      field('fP', isNew ? t('users.fPassword') : t('users.fNewPassword'), '<input type="text" id="fP" autocomplete="off">') +
      (isNew || self ? '' : '<label class="check"><input type="checkbox" id="fA"' + (u.active ? ' checked' : '') + '><span>' + esc(t('users.fActive')) + '</span></label><div class="sp-12"></div>') +
      '<h4 class="title-3">' + esc(t('users.permsTitle')) + '</h4>' +
      '<p class="caption-2 muted">' + esc(self ? t('users.permsSelf') : t('users.permsHint')) + '</p><div class="sp-8"></div>' +
      permSwitches(isNew ? [] : userPerms(u), self) +
      '<div class="form-error" id="fErr" role="alert" hidden></div>' +
      '<div class="modal-actions"><button type="button" class="btn" id="fC">' + esc(t('common.cancel')) + '</button><button type="submit" class="btn primary" id="fS">' + esc(t('common.save')) + '</button></div>' +
      '</form>', function () {
      bindPermSwitches($('uForm'));
      $('fC').onclick = closeModal;
      $('uForm').onsubmit = function (e) {
        e.preventDefault();
        clearErrors($('uForm'));
        var data = {
          username: $('fU').value,
          displayName: $('fN').value,
          password: $('fP').value,
          active: isNew || self ? true : $('fA').checked
        };
        if (self) {
          data.role = u.role || 'admin';
        } else {
          data.perms = readPerms($('uForm'));
          data.role = roleForPerms(data.perms);
        }
        if (isNew && !USERNAME_RE.test(String(data.username).trim().toLowerCase())) {
          setFieldError('fU', t('err.INVALID_USERNAME'));
          $('fU').focus();
          return;
        }
        if ((isNew || data.password) && data.password.length < 6) {
          setFieldError('fP', t('err.INVALID_PASSWORD'));
          $('fP').focus();
          return;
        }
        $('fS').disabled = true;
        api('saveUser', data).then(function () {
          closeModal();
          toast(t('users.saved'));
          renderUsers();
          api('listLeaderNames').then(function (names) { state.leaders = names; }).catch(function () {});
        }).catch(function (err) {
          if ($('fS')) {
            $('fS').disabled = false;
          }
          showFormError('fErr', errMsg(err));
        });
      };
    });
  }

  function renderAccount() {
    $('view').innerHTML = '<div class="card narrow"><h1 class="heading-5">' + esc(t('account.title')) + '</h1>' +
      '<p class="body-6 muted">' + esc(state.user.displayName) + ' (' + esc(state.user.username) + ') · ' + esc(accessLabel(state.user)) + '</p>' +
      '<p class="caption-2 muted">' + ic(state.remember ? 'lock-key' : 'info') + ' ' + esc(state.remember ? t('account.remembered') : t('account.notRemembered')) + '</p>' +
      (userPerms(state.user).length ? '' : '<div class="sp-12"></div><p class="note-line caption-2">' + ic('info') + '<span>' + esc(t('account.noAccess')) + '</span></p>') +
      '<div class="sp-16"></div><h2 class="heading-6">' + esc(t('account.changePw')) + '</h2><div class="sp-8"></div>' +
      '<form id="aForm" class="form" novalidate>' +
      field('aOld', t('account.oldPw'), passwordInput('aOld', 'current-password')) +
      field('aNew', t('account.newPw'), passwordInput('aNew', 'new-password'), t('register.passwordHint')) +
      field('aNew2', t('account.newPw2'), passwordInput('aNew2', 'new-password')) +
      '<div class="form-error" id="aErr" role="alert" hidden></div>' +
      '<button type="submit" class="btn primary" id="aSave">' + btnLabel('lock-key', t('account.changePw')) + '</button></form></div>';
    bindPasswordToggles($('view'));
    $('aForm').onsubmit = function (e) {
      e.preventDefault();
      clearErrors($('aForm'));
      if ($('aNew').value.length < 6) {
        setFieldError('aNew', t('err.INVALID_PASSWORD'));
        $('aNew').focus();
        return;
      }
      if ($('aNew').value !== $('aNew2').value) {
        setFieldError('aNew2', t('account.mismatch'));
        $('aNew2').focus();
        return;
      }
      $('aSave').disabled = true;
      api('changeMyPassword', $('aOld').value, $('aNew').value).then(function () {
        toast(t('account.done'));
        $('aSave').disabled = false;
        $('aOld').value = '';
        $('aNew').value = '';
        $('aNew2').value = '';
      }).catch(function (err) {
        if ($('aSave')) {
          $('aSave').disabled = false;
        }
        if (err.message === 'WRONG_OLD_PASSWORD') {
          setFieldError('aOld', errMsg(err));
          $('aOld').focus();
        } else {
          showFormError('aErr', errMsg(err));
        }
      });
    };
  }

  function boot() {
    applyTheme();
    applyStaticText();
    if (!API_URL) {
      renderNotConfigured();
      return;
    }
    var saved = loadToken();
    if (!saved) {
      renderLogin();
      return;
    }
    state.token = saved.token;
    state.remember = saved.remember;
    var cache = loadCache();
    if (saved.user && cache) {
      state.user = saved.user;
      state.songs = cache.songs;
      state.songsLoaded = true;
      state.leaders = cache.leaders || [];
      afterLogin();
      fetchBoot().then(function (data) {
        applyBoot(data);
        afterDataChange();
      }).catch(function (e) {
        if (e.message !== 'SESSION_EXPIRED') {
          toast(errMsg(e), true);
        }
      });
      return;
    }
    hideChrome();
    $('view').innerHTML = '<div class="card boot-card">' + skeleton(3) + '</div>';
    fetchBoot().then(function (data) {
      applyBoot(data);
      afterLogin();
    }).catch(function (e) {
      if (state.user || e.message === 'SESSION_EXPIRED') {
        return;
      }
      renderBootError(errMsg(e));
    });
  }

  function fetchBoot() {
    return api('bootstrap').catch(function (e) {
      if (e.message !== 'UNKNOWN_ACTION') {
        throw e;
      }
      return Promise.all([api('getMe'), api('listSongs'), api('listLeaderNames')]).then(function (r) {
        if (r[0] && userPerms(r[0]).indexOf('users.manage') >= 0) {
          setTimeout(refreshPending, 0);
        }
        return { user: r[0], songs: r[1], leaders: r[2], pendingCount: state.pendingCount };
      });
    });
  }

  $('menuToggle').onclick = function () { setSidebar(!state.sidebarOpen, isNarrow() ? 'nav' : 'close'); };
  $('sbClose').onclick = function () { setSidebar(false, 'toggle'); };
  $('sbBackdrop').onclick = function () { setSidebar(false); };
  if (narrowMq) {
    var onNarrow = function () {
      if (isNarrow()) {
        setSidebar(false);
      } else {
        setSidebar(load('cs_sidebar') !== false);
      }
    };
    if (narrowMq.addEventListener) {
      narrowMq.addEventListener('change', onNarrow);
    } else if (narrowMq.addListener) {
      narrowMq.addListener(onNarrow);
    }
  }
  setSidebar(state.sidebarOpen);
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      if (modalDismiss) {
        modalDismiss();
      } else if (isNarrow() && state.sidebarOpen) {
        setSidebar(false, 'toggle');
      }
    }
  });
  if (window.matchMedia) {
    var mq = window.matchMedia('(prefers-color-scheme: dark)');
    var onScheme = function () {
      if (!storedTheme()) {
        applyTheme();
        if (state.user) {
          renderNav();
        } else {
          renderAuthTools();
        }
      }
    };
    if (mq.addEventListener) {
      mq.addEventListener('change', onScheme);
    } else if (mq.addListener) {
      mq.addListener(onScheme);
    }
  }

  boot();
})();
