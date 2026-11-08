function generateSalt_() {
  return Utilities.getUuid().replace(/-/g, '');
}

function bytesToHex_(bytes) {
  return bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function hashPassword_(password, salt) {
  var value = salt + ':' + password;
  for (var i = 0; i < HASH_ROUNDS; i++) {
    value = bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value + ':' + salt, Utilities.Charset.UTF_8));
  }
  return value;
}

function normalizeUsername_(username) {
  return String(username || '').trim().toLowerCase();
}

function validateUsername_(username) {
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw new Error('Username ต้องเป็น a-z, 0-9, . _ - ยาว 3-30 ตัวอักษร');
  }
}

function validatePassword_(password) {
  if (String(password || '').length < 6) {
    throw new Error('รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร');
  }
}

function createUserRecord_(username, displayName, password, role) {
  var salt = generateSalt_();
  appendRow_(SHEETS.USERS, {
    Username: username,
    DisplayName: displayName,
    PasswordHash: hashPassword_(password, salt),
    Salt: salt,
    Role: role,
    Active: true,
    CreatedAt: new Date()
  });
}

function isActive_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function login(username, password) {
  var uname = normalizeUsername_(username);
  var cache = CacheService.getScriptCache();
  var failKey = 'fail_' + uname;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= LOGIN_MAX_FAILS) {
    throw new Error('เข้าสู่ระบบผิดหลายครั้ง กรุณารอ 10 นาทีแล้วลองใหม่');
  }
  var user = findBy_(SHEETS.USERS, 'Username', uname);
  if (!user || !isActive_(user.Active) || hashPassword_(String(password || ''), String(user.Salt)) !== String(user.PasswordHash)) {
    cache.put(failKey, String(fails + 1), LOGIN_LOCK_SECONDS);
    throw new Error('Username หรือรหัสผ่านไม่ถูกต้อง');
  }
  cache.remove(failKey);
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  var session = { username: uname, displayName: String(user.DisplayName || uname), role: String(user.Role || 'viewer') };
  cache.put('sess_' + token, JSON.stringify(session), SESSION_TTL_SECONDS);
  return { token: token, user: session };
}

function logout(token) {
  CacheService.getScriptCache().remove('sess_' + token);
  return true;
}

function requireSession_(token, minRole) {
  if (!token) {
    throw new Error('SESSION_EXPIRED');
  }
  var cache = CacheService.getScriptCache();
  var raw = cache.get('sess_' + token);
  if (!raw) {
    throw new Error('SESSION_EXPIRED');
  }
  var session = JSON.parse(raw);
  if (minRole && (ROLES[session.role] || 0) < ROLES[minRole]) {
    throw new Error('คุณไม่มีสิทธิ์ใช้งานส่วนนี้');
  }
  cache.put('sess_' + token, raw, SESSION_TTL_SECONDS);
  return session;
}

function getMe(token) {
  return requireSession_(token);
}

function changeMyPassword(token, oldPassword, newPassword) {
  var session = requireSession_(token);
  validatePassword_(newPassword);
  return withLock_(function () {
    var user = findBy_(SHEETS.USERS, 'Username', session.username);
    if (!user || hashPassword_(String(oldPassword || ''), String(user.Salt)) !== String(user.PasswordHash)) {
      throw new Error('รหัสผ่านเดิมไม่ถูกต้อง');
    }
    var salt = generateSalt_();
    user.Salt = salt;
    user.PasswordHash = hashPassword_(newPassword, salt);
    updateRow_(SHEETS.USERS, user._row, user);
    return true;
  });
}

function listUsers(token) {
  requireSession_(token, 'admin');
  return readTable_(SHEETS.USERS).map(function (u) {
    return {
      username: String(u.Username),
      displayName: String(u.DisplayName),
      role: String(u.Role),
      active: isActive_(u.Active),
      createdAt: toIso_(u.CreatedAt)
    };
  });
}

function listLeaderNames(token) {
  requireSession_(token);
  var names = {};
  readTable_(SHEETS.USERS).forEach(function (u) {
    if (isActive_(u.Active) && (String(u.Role) === 'leader' || String(u.Role) === 'admin')) {
      names[String(u.DisplayName || u.Username)] = true;
    }
  });
  readTable_(SHEETS.SETLISTS).forEach(function (s) {
    if (s.Leader) {
      names[String(s.Leader)] = true;
    }
  });
  return Object.keys(names).sort();
}

function saveUser(token, data) {
  requireSession_(token, 'admin');
  var uname = normalizeUsername_(data.username);
  validateUsername_(uname);
  var role = ROLES[data.role] ? data.role : 'viewer';
  var displayName = String(data.displayName || '').trim() || uname;
  return withLock_(function () {
    var user = findBy_(SHEETS.USERS, 'Username', uname);
    if (!user) {
      validatePassword_(data.password);
      createUserRecord_(uname, displayName, data.password, role);
      return true;
    }
    user.DisplayName = displayName;
    user.Role = role;
    user.Active = data.active !== false;
    if (data.password) {
      validatePassword_(data.password);
      var salt = generateSalt_();
      user.Salt = salt;
      user.PasswordHash = hashPassword_(data.password, salt);
    }
    updateRow_(SHEETS.USERS, user._row, user);
    return true;
  });
}
