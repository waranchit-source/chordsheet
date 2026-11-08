function fileLinks_(docId, pdfId) {
  return {
    docId: docId || '',
    pdfId: pdfId || '',
    docUrl: docId ? 'https://docs.google.com/document/d/' + docId + '/edit' : '',
    docxUrl: docId ? 'https://docs.google.com/document/d/' + docId + '/export?format=docx' : '',
    pdfUrl: pdfId ? 'https://drive.google.com/file/d/' + pdfId + '/view' : '',
    pdfDownloadUrl: pdfId ? 'https://drive.google.com/uc?export=download&id=' + pdfId : ''
  };
}

function shareFile_(file, editable) {
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, editable ? DriveApp.Permission.EDIT : DriveApp.Permission.VIEW);
  } catch (e) {
  }
}

function safeFileName_(s) {
  return String(s || '').replace(/[\\\/:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim().substring(0, 120);
}

function exportPdf_(docId, name) {
  var blob = DriveApp.getFileById(docId).getAs(MimeType.PDF).setName(safeFileName_(name) + '.pdf');
  var pdfFile = getFolder_(PROP_KEYS.PDF_FOLDER_ID).createFile(blob);
  shareFile_(pdfFile, false);
  return pdfFile.getId();
}

function sanitizeItems_(items) {
  if (!items || !items.length) {
    throw new Error('กรุณาเลือกเพลงอย่างน้อย 1 เพลง');
  }
  if (items.length > 40) {
    throw new Error('เลือกเพลงได้สูงสุด 40 เพลงต่อชุด');
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
  var session = requireSession_(token, 'leader');
  var items = sanitizeItems_(payload.items);
  var title = String(payload.title || '').trim() || 'ชุดเพลง';
  var serviceDate = String(payload.serviceDate || '').substring(0, 10) || Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
  var leader = String(payload.leader || '').trim() || session.displayName;
  var description = String(payload.description || '').substring(0, 5000);
  var hasNotes = description.trim() !== '' || items.some(function (it) { return it.note.trim() !== ''; });
  var outputType = payload.outputType === 'doc' || hasNotes ? 'doc' : 'pdf';

  var plan = planLayout_(title, description, items);
  var docName = safeFileName_(serviceDate + ' ' + title);
  var docId = buildDocument_(docName, plan);
  var docFile = DriveApp.getFileById(docId);
  docFile.moveTo(getFolder_(PROP_KEYS.DOCS_FOLDER_ID));

  var pdfId = '';
  if (outputType === 'pdf') {
    pdfId = exportPdf_(docId, docName);
    docFile.setTrashed(true);
    docId = '';
  } else {
    shareFile_(docFile, true);
  }

  var setlistId = newId_('L');
  var storedItems = items.map(function (it) {
    return { songId: it.songId, title: it.title, key: it.key, shift: it.shift, accidental: it.accidental, layout: it.layout, note: it.note };
  });
  var now = new Date();
  withLock_(function () {
    appendRow_(SHEETS.SETLISTS, {
      SetlistId: setlistId,
      Title: title,
      ServiceDate: serviceDate,
      Leader: leader,
      Description: description,
      OutputType: outputType,
      DocId: docId,
      PdfId: pdfId,
      ItemsJson: JSON.stringify(storedItems),
      CreatedBy: session.displayName,
      CreatedAt: now
    });
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

  var summary = plan.pages.map(function (page, i) {
    return {
      page: i + 1,
      songs: page.items.map(function (p) { return p.item.title + ' — ' + p.reason; })
    };
  });
  var result = fileLinks_(docId, pdfId);
  result.setlistId = setlistId;
  result.outputType = outputType;
  result.pages = summary;
  return result;
}

function exportSetlistPdf(token, setlistId) {
  requireSession_(token, 'leader');
  var s = findBy_(SHEETS.SETLISTS, 'SetlistId', setlistId);
  if (!s) {
    throw new Error('ไม่พบชุดเพลงนี้');
  }
  if (!s.DocId) {
    throw new Error('ชุดเพลงนี้ไม่มีไฟล์ Doc');
  }
  var name = safeFileName_(toDateOnly_(s.ServiceDate) + ' ' + s.Title);
  var pdfId = exportPdf_(String(s.DocId), name);
  if (s.PdfId) {
    try {
      DriveApp.getFileById(String(s.PdfId)).setTrashed(true);
    } catch (e) {
    }
  }
  withLock_(function () {
    var fresh = findBy_(SHEETS.SETLISTS, 'SetlistId', setlistId);
    fresh.PdfId = pdfId;
    updateRow_(SHEETS.SETLISTS, fresh._row, fresh);
  });
  return fileLinks_(String(s.DocId), pdfId);
}

function setlistToClient_(s, withItems) {
  var items = [];
  try {
    items = JSON.parse(String(s.ItemsJson || '[]'));
  } catch (e) {
    items = [];
  }
  var out = fileLinks_(String(s.DocId || ''), String(s.PdfId || ''));
  out.id = String(s.SetlistId);
  out.title = String(s.Title);
  out.serviceDate = toDateOnly_(s.ServiceDate);
  out.leader = String(s.Leader || '');
  out.description = String(s.Description || '');
  out.outputType = String(s.OutputType || '');
  out.createdBy = String(s.CreatedBy || '');
  out.createdAt = toIso_(s.CreatedAt);
  out.songTitles = items.map(function (it) { return it.title; });
  if (withItems) {
    out.items = items;
  }
  return out;
}

function listSetlists(token) {
  requireSession_(token);
  return readTable_(SHEETS.SETLISTS).filter(function (s) { return s.SetlistId; }).map(function (s) {
    return setlistToClient_(s, false);
  }).sort(function (a, b) {
    return (b.serviceDate + b.createdAt).localeCompare(a.serviceDate + a.createdAt);
  });
}

function getSetlist(token, setlistId) {
  requireSession_(token);
  var s = findBy_(SHEETS.SETLISTS, 'SetlistId', setlistId);
  if (!s) {
    throw new Error('ไม่พบชุดเพลงนี้');
  }
  return setlistToClient_(s, true);
}

function deleteSetlist(token, setlistId) {
  requireSession_(token, 'admin');
  return withLock_(function () {
    var s = findBy_(SHEETS.SETLISTS, 'SetlistId', setlistId);
    if (!s) {
      throw new Error('ไม่พบชุดเพลงนี้');
    }
    [s.DocId, s.PdfId].forEach(function (id) {
      if (id) {
        try {
          DriveApp.getFileById(String(id)).setTrashed(true);
        } catch (e) {
        }
      }
    });
    getSheet_(SHEETS.SETLISTS).deleteRow(s._row);
    var usageSheet = getSheet_(SHEETS.USAGE);
    var rows = readTable_(SHEETS.USAGE).filter(function (u) { return String(u.SetlistId) === String(setlistId); });
    rows.sort(function (a, b) { return b._row - a._row; }).forEach(function (u) {
      usageSheet.deleteRow(u._row);
    });
    return true;
  });
}
