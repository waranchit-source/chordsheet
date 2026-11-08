function doGet(e) {
  var params = (e && e.parameter) || {};
  if (params.action === 'ping') {
    return jsonOutput_({ ok: true, data: { app: APP_NAME, time: toIso_(new Date()) } });
  }
  var url = String(FRONTEND_URL || '');
  var html = '<!DOCTYPE html><html><head><meta charset="utf-8"><base target="_top">' +
    '<style>body{margin:0;font-family:Sarabun,Tahoma,sans-serif;background:#f7f7f8;color:#16181d;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px;box-sizing:border-box}' +
    '.c{background:#fff;border:1px solid #e3e5e9;border-radius:16px;padding:32px;max-width:420px;text-align:center}' +
    'h1{font-size:20px;line-height:28px;font-weight:600;margin:0 0 8px}p{font-size:14px;line-height:20px;color:#4a505c;margin:0 0 24px}' +
    'a{display:inline-block;background:#2f4fb5;color:#fff;text-decoration:none;font-weight:600;padding:8px 12px;border-radius:8px}</style></head><body><div class="c">' +
    '<h1>' + escapeHtml_(APP_NAME) + '</h1>' +
    '<p>This app has moved to a new address.<br>ระบบย้ายไปที่ลิงก์ใหม่แล้ว</p>' +
    (url ? '<a href="' + escapeHtml_(url) + '">Open the app · เปิดระบบ</a>' : '') +
    '</div></body></html>';
  return HtmlService.createHtmlOutput(html)
    .setTitle(APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  var out;
  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw new Error('BAD_REQUEST');
    }
    var req;
    try {
      req = JSON.parse(e.postData.contents);
    } catch (parseError) {
      throw new Error('BAD_REQUEST');
    }
    var action = String(req.action || '');
    var routes = apiRoutes_();
    if (!Object.prototype.hasOwnProperty.call(routes, action)) {
      throw new Error('UNKNOWN_ACTION');
    }
    ensureSchema_();
    var route = routes[action];
    var args = Array.isArray(req.args) ? req.args : [];
    var result = route.auth ? route.fn.apply(null, [String(req.token || '')].concat(args)) : route.fn.apply(null, args);
    out = { ok: true, data: result === undefined ? null : result };
  } catch (err) {
    var msg = err && err.message ? err.message : String(err);
    out = { ok: false, error: msg.replace(/^Error:\s*/, '').replace(/^Exception:\s*/, '') };
  }
  return jsonOutput_(out);
}

function apiRoutes_() {
  return {
    login: { fn: login, auth: false },
    register: { fn: register, auth: false },
    logout: { fn: logout, auth: true },
    getMe: { fn: getMe, auth: true },
    bootstrap: { fn: bootstrap, auth: true },
    changeMyPassword: { fn: changeMyPassword, auth: true },
    listUsers: { fn: listUsers, auth: true },
    listLeaderNames: { fn: listLeaderNames, auth: true },
    saveUser: { fn: saveUser, auth: true },
    reviewUser: { fn: reviewUser, auth: true },
    listSongs: { fn: listSongs, auth: true },
    getSong: { fn: getSong, auth: true },
    getSongs: { fn: getSongs, auth: true },
    saveSong: { fn: saveSong, auth: true },
    saveSongs: { fn: saveSongs, auth: true },
    deleteSong: { fn: deleteSong, auth: true },
    generateSetlist: { fn: generateSetlist, auth: true },
    listSetlists: { fn: listSetlists, auth: true },
    getSetlist: { fn: getSetlist, auth: true },
    deleteSetlist: { fn: deleteSetlist, auth: true },
    getStats: { fn: getStats, auth: true }
  };
}

function jsonOutput_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function escapeHtml_(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
