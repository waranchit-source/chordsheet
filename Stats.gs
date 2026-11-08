function getStats(token, filter) {
  requireSession_(token, 'stats.view');
  filter = filter || {};
  var from = String(filter.from || '');
  var to = String(filter.to || '');
  var leaderFilter = String(filter.leader || '');

  var songTitles = {};
  readTable_(SHEETS.SONGS).forEach(function (s) {
    if (!isDeleted_(s.Deleted)) {
      songTitles[String(s.SongId)] = String(s.Title);
    }
  });

  var rows = readTable_(SHEETS.USAGE).filter(function (u) {
    var d = toDateOnly_(u.ServiceDate);
    if (from && d < from) {
      return false;
    }
    if (to && d > to) {
      return false;
    }
    if (leaderFilter && String(u.Leader) !== leaderFilter) {
      return false;
    }
    return true;
  });

  var songMap = {};
  var leaderMap = {};
  var setlistIds = {};
  rows.forEach(function (u) {
    var id = String(u.SongId);
    var title = songTitles[id] || String(u.SongTitle);
    var d = toDateOnly_(u.ServiceDate);
    var leader = String(u.Leader || '-');
    var key = String(u.Key || '');
    setlistIds[String(u.SetlistId)] = true;

    if (!songMap[id]) {
      songMap[id] = { songId: id, title: title, count: 0, last: '', keys: {}, leaders: {} };
    }
    var sm = songMap[id];
    sm.count++;
    if (d > sm.last) {
      sm.last = d;
    }
    if (key) {
      sm.keys[key] = (sm.keys[key] || 0) + 1;
    }
    sm.leaders[leader] = (sm.leaders[leader] || 0) + 1;

    if (!leaderMap[leader]) {
      leaderMap[leader] = { leader: leader, total: 0, setlists: {}, songs: {} };
    }
    var lm = leaderMap[leader];
    lm.total++;
    lm.setlists[String(u.SetlistId)] = true;
    if (!lm.songs[id]) {
      lm.songs[id] = { songId: id, title: title, count: 0, last: '', keys: {} };
    }
    lm.songs[id].count++;
    if (d > lm.songs[id].last) {
      lm.songs[id].last = d;
    }
    if (key) {
      lm.songs[id].keys[key] = (lm.songs[id].keys[key] || 0) + 1;
    }
  });

  function topKey(keys) {
    var best = '';
    var n = 0;
    Object.keys(keys).forEach(function (k) {
      if (keys[k] > n) {
        n = keys[k];
        best = k;
      }
    });
    return best;
  }

  function byCount(a, b) {
    return b.count - a.count || b.last.localeCompare(a.last) || a.title.localeCompare(b.title, 'th');
  }

  var topSongs = Object.keys(songMap).map(function (id) {
    var s = songMap[id];
    var topLeader = '';
    var n = 0;
    Object.keys(s.leaders).forEach(function (l) {
      if (s.leaders[l] > n) {
        n = s.leaders[l];
        topLeader = l;
      }
    });
    return { songId: id, title: s.title, count: s.count, last: s.last, topKey: topKey(s.keys), topLeader: topLeader };
  }).sort(byCount);

  var leaders = Object.keys(leaderMap).map(function (l) {
    var lm = leaderMap[l];
    var songs = Object.keys(lm.songs).map(function (id) {
      var s = lm.songs[id];
      return { songId: id, title: s.title, count: s.count, last: s.last, topKey: topKey(s.keys) };
    }).sort(byCount);
    return { leader: l, total: lm.total, setlistCount: Object.keys(lm.setlists).length, songs: songs };
  }).sort(function (a, b) { return b.setlistCount - a.setlistCount || a.leader.localeCompare(b.leader, 'th'); });

  var usedIds = {};
  Object.keys(songMap).forEach(function (id) { usedIds[id] = true; });
  var neverUsed = Object.keys(songTitles).filter(function (id) { return !usedIds[id]; }).map(function (id) {
    return { songId: id, title: songTitles[id] };
  }).sort(function (a, b) { return a.title.localeCompare(b.title, 'th'); });

  return {
    totalUses: rows.length,
    totalSetlists: Object.keys(setlistIds).length,
    topSongs: topSongs,
    leaders: leaders,
    neverUsed: leaderFilter ? [] : neverUsed
  };
}
