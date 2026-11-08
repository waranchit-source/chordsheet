function safeFileName_(s) {
  return String(s || '').replace(/[\\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 120);
}

function authHeaders_() {
  return { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() };
}

function exportDocBlob_(docId, format) {
  var url = 'https://docs.google.com/document/d/' + docId + '/export?format=' + format;
  var options = { headers: authHeaders_(), muteHttpExceptions: true };
  for (var attempt = 0; attempt < 3; attempt++) {
    var res = UrlFetchApp.fetch(url, options);
    var code = res.getResponseCode();
    if (code === 200) {
      return res.getBlob();
    }
    if (code !== 429 && code < 500) {
      break;
    }
    Utilities.sleep(800 * (attempt + 1));
  }
  return null;
}

function fallbackPdfBlob_(docId) {
  var doc = DocumentApp.openById(docId);
  hideSpacesForPdf_(doc.getBody());
  doc.saveAndClose();
  return DriveApp.getFileById(docId).getAs(MimeType.PDF);
}

function deleteDocPermanently_(docId) {
  try {
    var res = UrlFetchApp.fetch('https://www.googleapis.com/drive/v3/files/' + docId, { method: 'delete', headers: authHeaders_(), muteHttpExceptions: true });
    var code = res.getResponseCode();
    if (code === 204 || code === 200 || code === 404) {
      return;
    }
  } catch (e) {
  }
  try {
    DriveApp.getFileById(docId).setTrashed(true);
  } catch (e2) {
  }
}

function trashFiles_(ids) {
  ids.forEach(function (id) {
    if (id) {
      try {
        DriveApp.getFileById(String(id)).setTrashed(true);
      } catch (e) {
      }
    }
  });
}

function deleteUsageRows_(setlistId) {
  var usageSheet = getSheet_(SHEETS.USAGE);
  var rows = readTable_(SHEETS.USAGE).filter(function (u) { return String(u.SetlistId) === String(setlistId); });
  rows.sort(function (a, b) { return b._row - a._row; }).forEach(function (u) {
    usageSheet.deleteRow(u._row);
  });
}

function sanitizeItems_(items) {
  if (!items || !items.length) {
    throw new Error('SETLIST_EMPTY');
  }
  if (items.length > 40) {
    throw new Error('SETLIST_TOO_MANY');
  }
  return items.map(function (it) {
    var shift = Math.round(Number(it.shift) || 0);
    return {
      songId: String(it.songId || ''),
      title: String(it.title || '').trim() || 'ไม่มีชื่อ',
      key: String(it.key || '').trim(),
      shift: Math.max(-11, Math.min(11, shift)),
      accidental: ['auto', 'sharp', 'flat'].indexOf(it.accidental) >= 0 ? it.accidental : 'auto',
      layout: ['auto', 'half', 'full'].indexOf(it.layout) >= 0 ? it.layout : 'auto',
      note: String(it.note || '').substring(0, 2000),
      content: String(it.content || '').replace(/\r\n/g, '\n')
    };
  });
}

function generateSetlist(token, payload) {
  var session = requireSession_(token, 'setlist.create');
  var items = sanitizeItems_(payload.items);
  var title = String(payload.title || '').trim() || 'ชุดเพลง';
  var serviceDate = String(payload.serviceDate || '').substring(0, 10) || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  var leader = String(payload.leader || '').trim() || session.displayName;
  var description = String(payload.description || '').substring(0, 5000);
  var hasNotes = description.trim() !== '' || items.some(function (it) { return it.note.trim() !== ''; });
  var outputType = payload.outputType === 'doc' || hasNotes ? 'doc' : 'pdf';

  var existing = payload.setlistId ? findBy_(SHEETS.SETLISTS, 'SetlistId', String(payload.setlistId)) : null;
  if (existing && String(existing.CreatedBy) !== session.displayName && !hasPerm_(session, 'users.manage')) {
    existing = null;
  }

  var plan = planLayout_(title, description, items);
  var docName = safeFileName_(serviceDate + ' ' + title);
  var docId = buildDocument_(docName, plan);
  var blob = null;
  try {
    blob = exportDocBlob_(docId, outputType === 'pdf' ? 'pdf' : 'docx');
    if (!blob && outputType === 'pdf') {
      blob = fallbackPdfBlob_(docId);
    }
  } finally {
    deleteDocPermanently_(docId);
  }
  if (!blob) {
    throw new Error('EXPORT_FAILED');
  }

  var setlistId = existing ? String(existing.SetlistId) : newId_('L');
  var storedItems = items.map(function (it) {
    return { songId: it.songId, title: it.title, key: it.key, shift: it.shift, accidental: it.accidental, layout: it.layout, note: it.note };
  });
  var now = new Date();
  var oldFiles = [];
  withLock_(function () {
    var fresh = existing ? findBy_(SHEETS.SETLISTS, 'SetlistId', setlistId) : null;
    if (fresh) {
      oldFiles = [fresh.DocId, fresh.PdfId];
      fresh.Title = title;
      fresh.ServiceDate = serviceDate;
      fresh.Leader = leader;
      fresh.Description = description;
      fresh.OutputType = outputType;
      fresh.DocId = '';
      fresh.PdfId = '';
      fresh.ItemsJson = JSON.stringify(storedItems);
      updateRow_(SHEETS.SETLISTS, fresh._row, fresh);
      deleteUsageRows_(setlistId);
    } else {
      appendRow_(SHEETS.SETLISTS, {
        SetlistId: setlistId,
        Title: title,
        ServiceDate: serviceDate,
        Leader: leader,
        Description: description,
        OutputType: outputType,
        DocId: '',
        PdfId: '',
        ItemsJson: JSON.stringify(storedItems),
        CreatedBy: session.displayName,
        CreatedAt: now
      });
    }
    appendRows_(SHEETS.USAGE, items.map(function (it) {
      return {
        Timestamp: now,
        SetlistId: setlistId,
        ServiceDate: serviceDate,
        Leader: leader,
        SongId: it.songId,
        SongTitle: it.title,
        Key: it.key,
        Shift: it.shift
      };
    }));
  });
  trashFiles_(oldFiles);

  var summary = plan.pages.map(function (page, i) {
    return {
      page: i + 1,
      songs: page.items.map(function (p) { return { title: p.item.title, reason: p.reason }; })
    };
  });
  return {
    setlistId: setlistId,
    updated: !!existing,
    outputType: outputType,
    pages: summary,
    file: {
      name: docName + (outputType === 'pdf' ? '.pdf' : '.docx'),
      mimeType: outputType === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      base64: Utilities.base64Encode(blob.getBytes())
    }
  };
}

function setlistToClient_(s, withItems) {
  var items = [];
  try {
    items = JSON.parse(String(s.ItemsJson || '[]'));
  } catch (e) {
    items = [];
  }
  var out = {};
  out.id = String(s.SetlistId);
  out.title = String(s.Title);
  out.serviceDate = toDateOnly_(s.ServiceDate);
  out.leader = String(s.Leader || '');
  out.description = String(s.Description || '');
  out.outputType = String(s.OutputType || '');
  out.createdBy = String(s.CreatedBy || '');
  out.createdAt = toIso_(s.CreatedAt);
  out.songTitles = items.map(function (it) { return it.title; });
  out.songs = items.map(function (it) { return { title: String(it.title || ''), key: String(it.key || '') }; });
  if (withItems) {
    out.items = items;
  }
  return out;
}

function listSetlists(token) {
  requireSession_(token, 'history.view');
  return readTable_(SHEETS.SETLISTS).filter(function (s) { return s.SetlistId; }).map(function (s) {
    return setlistToClient_(s, false);
  }).sort(function (a, b) {
    return (b.serviceDate + b.createdAt).localeCompare(a.serviceDate + a.createdAt);
  });
}

function getSetlist(token, setlistId) {
  requireSession_(token, 'history.view');
  var s = findBy_(SHEETS.SETLISTS, 'SetlistId', setlistId);
  if (!s) {
    throw new Error('SETLIST_NOT_FOUND');
  }
  return setlistToClient_(s, true);
}

function deleteSetlist(token, setlistId) {
  requireSession_(token, 'setlist.delete');
  return withLock_(function () {
    var s = findBy_(SHEETS.SETLISTS, 'SetlistId', setlistId);
    if (!s) {
      throw new Error('SETLIST_NOT_FOUND');
    }
    trashFiles_([s.DocId, s.PdfId]);
    getSheet_(SHEETS.SETLISTS).deleteRow(s._row);
    deleteUsageRows_(setlistId);
    return true;
  });
}
