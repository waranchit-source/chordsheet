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

function hashToken_(token) {
  return bytesToHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, 'session:' + token, Utilities.Charset.UTF_8));
}

function isValidTokenFormat_(token) {
  return /^[A-Za-z0-9-]{20,100}$/.test(String(token || ''));
}

function normalizeUsername_(username) {
  return String(username || '').trim().toLowerCase();
}

function validateUsername_(username) {
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) {
    throw new Error('INVALID_USERNAME');
  }
}

function validatePassword_(password) {
  if (String(password || '').length < 6) {
    throw new Error('INVALID_PASSWORD');
  }
}

function createUserRecord_(username, displayName, password, role, status) {
  var salt = generateSalt_();
  var st = status || USER_STATUS.APPROVED;
  appendRow_(SHEETS.USERS, {
    Username: username,
    DisplayName: displayName,
    PasswordHash: hashPassword_(password, salt),
    Salt: salt,
    Role: role,
    Active: st === USER_STATUS.APPROVED,
    CreatedAt: new Date(),
    Status: st,
    ReviewedBy: '',
    ReviewedAt: ''
  });
}

function isActive_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function userStatus_(user) {
  var s = String(user.Status || '').trim().toLowerCase();
  if (s === USER_STATUS.PENDING || s === USER_STATUS.REJECTED) {
    return s;
  }
  return USER_STATUS.APPROVED;
}

function sessionExpiry_(row) {
  var v = row.ExpiresAt;
  var d = v instanceof Date ? v : new Date(String(v));
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function deleteSessionsWhere_(predicate) {
  var rows = readTable_(SHEETS.SESSIONS);
  var keep = rows.filter(function (r) { return r.TokenHash && !predicate(r); });
  if (keep.length !== rows.length) {
    rewriteRows_(SHEETS.SESSIONS, keep);
  }
}

function storeRememberedSession_(token, uname) {
  var now = new Date();
  withLock_(function () {
    deleteSessionsWhere_(function (r) { return sessionExpiry_(r) <= now.getTime(); });
    appendRow_(SHEETS.SESSIONS, {
      TokenHash: hashToken_(token),
      Username: uname,
      CreatedAt: now,
      ExpiresAt: new Date(now.getTime() + REMEMBER_DAYS * 86400000)
    });
  });
}

function restoreRememberedSession_(token) {
  var hash = hashToken_(token);
  var row = findBy_(SHEETS.SESSIONS, 'TokenHash', hash);
  if (!row) {
    return null;
  }
  var now = Date.now();
  var user = findBy_(SHEETS.USERS, 'Username', String(row.Username));
  if (sessionExpiry_(row) <= now || !user || userStatus_(user) !== USER_STATUS.APPROVED || !isActive_(user.Active)) {
    withLock_(function () {
      deleteSessionsWhere_(function (r) { return String(r.TokenHash) === hash; });
    });
    return null;
  }
  withLock_(function () {
    var fresh = findBy_(SHEETS.SESSIONS, 'TokenHash', hash);
    if (fresh) {
      fresh.ExpiresAt = new Date(now + REMEMBER_DAYS * 86400000);
      updateRow_(SHEETS.SESSIONS, fresh._row, fresh);
    }
  });
  var uname = String(row.Username);
  return { username: uname, displayName: String(user.DisplayName || uname), role: String(user.Role || 'viewer') };
}

function login(username, password, remember) {
  var uname = normalizeUsername_(username);
  var cache = CacheService.getScriptCache();
  var failKey = 'fail_' + uname;
  var fails = Number(cache.get(failKey) || 0);
  if (fails >= LOGIN_MAX_FAILS) {
    throw new Error('LOGIN_LOCKED');
  }
  var user = findBy_(SHEETS.USERS, 'Username', uname);
  if (!user || hashPassword_(String(password || ''), String(user.Salt)) !== String(user.PasswordHash)) {
    cache.put(failKey, String(fails + 1), LOGIN_LOCK_SECONDS);
    throw new Error('LOGIN_FAILED');
  }
  var status = userStatus_(user);
  if (status === USER_STATUS.PENDING) {
    throw new Error('ACCOUNT_PENDING');
  }
  if (status === USER_STATUS.REJECTED) {
    throw new Error('ACCOUNT_REJECTED');
  }
  if (!isActive_(user.Active)) {
    cache.put(failKey, String(fails + 1), LOGIN_LOCK_SECONDS);
    throw new Error('LOGIN_FAILED');
  }
  cache.remove(failKey);
  var token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g, '');
  var session = { username: uname, displayName: String(user.DisplayName || uname), role: String(user.Role || 'viewer') };
  cache.put('sess_' + token, JSON.stringify(session), SESSION_TTL_SECONDS);
  var keep = remember === true;
  if (keep) {
    storeRememberedSession_(token, uname);
  }
  return { token: token, user: session, remember: keep, boot: bootData_(session) };
}

function bootData_(session) {
  var users = readTable_(SHEETS.USERS);
  var data = { songs: songList_(), leaders: leaderNames_(users), pendingCount: 0 };
  if ((ROLES[session.role] || 0) >= ROLES.admin) {
    data.pendingCount = users.filter(function (u) { return userStatus_(u) === USER_STATUS.PENDING; }).length;
  }
  return data;
}

function bootstrap(token) {
  var session = requireSession_(token);
  var data = bootData_(session);
  data.user = session;
  return data;
}

function register(username, displayName, password) {
  var uname = normalizeUsername_(username);
  validateUsername_(uname);
  validatePassword_(password);
  var name = String(displayName || '').trim().substring(0, 60) || uname;
  var cache = CacheService.getScriptCache();
  var count = Number(cache.get('reg_count') || 0);
  if (count >= REGISTER_MAX_PER_WINDOW) {
    throw new Error('REGISTER_LIMIT');
  }
  cache.put('reg_count', String(count + 1), REGISTER_WINDOW_SECONDS);
  return withLock_(function () {
    var existing = findBy_(SHEETS.USERS, 'Username', uname);
    if (existing) {
      if (userStatus_(existing) !== USER_STATUS.REJECTED) {
        throw new Error('USERNAME_TAKEN');
      }
      var salt = generateSalt_();
      existing.DisplayName = name;
      existing.Salt = salt;
      existing.PasswordHash = hashPassword_(String(password), salt);
      existing.Role = 'viewer';
      existing.Active = false;
      existing.CreatedAt = new Date();
      existing.Status = USER_STATUS.PENDING;
      existing.ReviewedBy = '';
      existing.ReviewedAt = '';
      updateRow_(SHEETS.USERS, existing._row, existing);
    } else {
      createUserRecord_(uname, name, String(password), 'viewer', USER_STATUS.PENDING);
    }
    return { username: uname, status: USER_STATUS.PENDING };
  });
}

function logout(token) {
  if (!isValidTokenFormat_(token)) {
    return true;
  }
  CacheService.getScriptCache().remove('sess_' + token);
  var hash = hashToken_(token);
  withLock_(function () {
    deleteSessionsWhere_(function (r) { return String(r.TokenHash) === hash; });
  });
  return true;
}

function requireSession_(token, minRole) {
  if (!token || !isValidTokenFormat_(token)) {
    throw new Error('SESSION_EXPIRED');
  }
  var cache = CacheService.getScriptCache();
  var raw = cache.get('sess_' + token);
  if (!raw) {
    var restored = restoreRememberedSession_(token);
    if (!restored) {
      throw new Error('SESSION_EXPIRED');
    }
    raw = JSON.stringify(restored);
  }
  var session = JSON.parse(raw);
  if (minRole && (ROLES[session.role] || 0) < ROLES[minRole]) {
    throw new Error('FORBIDDEN');
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
      throw new Error('WRONG_OLD_PASSWORD');
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
      status: userStatus_(u),
      createdAt: toIso_(u.CreatedAt),
      reviewedBy: String(u.ReviewedBy || ''),
      reviewedAt: toIso_(u.ReviewedAt)
    };
  });
}

function listLeaderNames(token) {
  requireSession_(token);
  return leaderNames_();
}

function leaderNames_(users) {
  var names = {};
  (users || readTable_(SHEETS.USERS)).forEach(function (u) {
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
      createUserRecord_(uname, displayName, data.password, role, USER_STATUS.APPROVED);
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
    if (!user.Active || data.password) {
      deleteSessionsWhere_(function (r) { return String(r.Username) === uname; });
    }
    return true;
  });
}

function reviewUser(token, username, decision, role) {
  var session = requireSession_(token, 'admin');
  var uname = normalizeUsername_(username);
  if (decision !== 'approve' && decision !== 'reject') {
    throw new Error('BAD_REQUEST');
  }
  if (uname === session.username) {
    throw new Error('CANNOT_REVIEW_SELF');
  }
  return withLock_(function () {
    var user = findBy_(SHEETS.USERS, 'Username', uname);
    if (!user) {
      throw new Error('USER_NOT_FOUND');
    }
    user.ReviewedBy = session.displayName;
    user.ReviewedAt = new Date();
    if (decision === 'approve') {
      user.Status = USER_STATUS.APPROVED;
      user.Active = true;
      user.Role = ROLES[role] ? role : (ROLES[String(user.Role)] ? String(user.Role) : 'viewer');
    } else {
      user.Status = USER_STATUS.REJECTED;
      user.Active = false;
    }
    updateRow_(SHEETS.USERS, user._row, user);
    if (decision === 'reject') {
      deleteSessionsWhere_(function (r) { return String(r.Username) === uname; });
    }
    return true;
  });
}
