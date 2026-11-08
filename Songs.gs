function isDeleted_(v) {
  return v === true || String(v).toUpperCase() === 'TRUE';
}

function songToClient_(s, withContent) {
  var out = {
    id: String(s.SongId),
    title: String(s.Title),
    artist: String(s.Artist || ''),
    originalKey: String(s.OriginalKey || ''),
    defaultLayout: String(s.DefaultLayout || 'auto'),
    tags: String(s.Tags || ''),
    createdBy: String(s.CreatedBy || ''),
    createdAt: toIso_(s.CreatedAt),
    updatedBy: String(s.UpdatedBy || ''),
    updatedAt: toIso_(s.UpdatedAt)
  };
  var content = String(s.Content || '');
  if (withContent) {
    out.content = content;
  } else {
    out.searchText = content.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').substring(0, 400);
  }
  return out;
}

function listSongs(token) {
  requireSession_(token);
  var usage = songUsageSummary_();
  return readTable_(SHEETS.SONGS).filter(function (s) {
    return !isDeleted_(s.Deleted) && s.SongId;
  }).map(function (s) {
    var item = songToClient_(s, false);
    var u = usage[item.id];
    item.useCount = u ? u.count : 0;
    item.lastUsed = u ? u.last : '';
    return item;
  }).sort(function (a, b) {
    return a.title.localeCompare(b.title, 'th');
  });
}

function getSong(token, songId) {
  requireSession_(token);
  var s = findBy_(SHEETS.SONGS, 'SongId', songId);
  if (!s || isDeleted_(s.Deleted)) {
    throw new Error('ไม่พบเพลงนี้');
  }
  return songToClient_(s, true);
}

function getSongs(token, songIds) {
  requireSession_(token);
  var wanted = {};
  (songIds || []).forEach(function (id) { wanted[String(id)] = true; });
  var out = {};
  readTable_(SHEETS.SONGS).forEach(function (s) {
    if (wanted[String(s.SongId)] && !isDeleted_(s.Deleted)) {
      out[String(s.SongId)] = songToClient_(s, true);
    }
  });
  return out;
}

function saveSong(token, data) {
  var session = requireSession_(token, 'leader');
  var title = String(data.title || '').trim();
  var content = String(data.content || '').replace(/\r\n/g, '\n');
  if (!title) {
    throw new Error('กรุณาใส่ชื่อเพลง');
  }
  if (!content.trim()) {
    throw new Error('กรุณาใส่เนื้อเพลง');
  }
  if (content.length > 45000) {
    throw new Error('เนื้อเพลงยาวเกินไป');
  }
  var layout = ['auto', 'half', 'full'].indexOf(data.defaultLayout) >= 0 ? data.defaultLayout : 'auto';
  return withLock_(function () {
    var now = new Date();
    if (data.id) {
      var s = findBy_(SHEETS.SONGS, 'SongId', data.id);
      if (!s || isDeleted_(s.Deleted)) {
        throw new Error('ไม่พบเพลงนี้');
      }
      s.Title = title;
      s.Artist = String(data.artist || '').trim();
      s.OriginalKey = String(data.originalKey || '').trim();
      s.Content = content;
      s.DefaultLayout = layout;
      s.Tags = String(data.tags || '').trim();
      s.UpdatedBy = session.displayName;
      s.UpdatedAt = now;
      updateRow_(SHEETS.SONGS, s._row, s);
      return songToClient_(s, true);
    }
    var duplicate = readTable_(SHEETS.SONGS).filter(function (r) {
      return !isDeleted_(r.Deleted) && String(r.Title).trim() === title;
    });
    if (duplicate.length && !data.allowDuplicate) {
      throw new Error('DUPLICATE_TITLE');
    }
    var record = {
      SongId: newId_('S'),
      Title: title,
      Artist: String(data.artist || '').trim(),
      OriginalKey: String(data.originalKey || '').trim(),
      Content: content,
      DefaultLayout: layout,
      Tags: String(data.tags || '').trim(),
      CreatedBy: session.displayName,
      CreatedAt: now,
      UpdatedBy: session.displayName,
      UpdatedAt: now,
      Deleted: false
    };
    appendRow_(SHEETS.SONGS, record);
    return songToClient_(record, true);
  });
}

function deleteSong(token, songId) {
  var session = requireSession_(token, 'admin');
  return withLock_(function () {
    var s = findBy_(SHEETS.SONGS, 'SongId', songId);
    if (!s) {
      throw new Error('ไม่พบเพลงนี้');
    }
    s.Deleted = true;
    s.UpdatedBy = session.displayName;
    s.UpdatedAt = new Date();
    updateRow_(SHEETS.SONGS, s._row, s);
    return true;
  });
}

function songUsageSummary_() {
  var map = {};
  readTable_(SHEETS.USAGE).forEach(function (u) {
    var id = String(u.SongId);
    var d = toDateOnly_(u.ServiceDate);
    if (!map[id]) {
      map[id] = { count: 0, last: '' };
    }
    map[id].count++;
    if (d > map[id].last) {
      map[id].last = d;
    }
  });
  return map;
}
