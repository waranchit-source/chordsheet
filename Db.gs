function getProps_() {
  return PropertiesService.getScriptProperties();
}

function getSpreadsheet_() {
  var id = getProps_().getProperty(PROP_KEYS.SPREADSHEET_ID);
  if (id) {
    return SpreadsheetApp.openById(id);
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    return active;
  }
  throw new Error('SETUP_REQUIRED');
}

function getSheet_(name) {
  var sheet = getSpreadsheet_().getSheetByName(name);
  if (!sheet) {
    throw new Error('SHEET_NOT_FOUND:' + name);
  }
  return sheet;
}

function readTable_(name) {
  var sheet = getSheet_(name);
  var lastRow = sheet.getLastRow();
  var headers = HEADERS[name];
  if (lastRow < 2) {
    return [];
  }
  var values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var rows = [];
  for (var i = 0; i < values.length; i++) {
    var obj = { _row: i + 2 };
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = values[i][j];
    }
    rows.push(obj);
  }
  return rows;
}

function rowFromObject_(name, obj) {
  var headers = HEADERS[name];
  var row = [];
  for (var j = 0; j < headers.length; j++) {
    var v = obj[headers[j]];
    row.push(v === undefined || v === null ? '' : v);
  }
  return row;
}

function appendRow_(name, obj) {
  var sheet = getSheet_(name);
  sheet.appendRow(rowFromObject_(name, obj));
}

function appendRows_(name, objs) {
  if (!objs.length) {
    return;
  }
  var sheet = getSheet_(name);
  var rows = objs.map(function (o) { return rowFromObject_(name, o); });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADERS[name].length).setValues(rows);
}

function updateRow_(name, rowNumber, obj) {
  var sheet = getSheet_(name);
  sheet.getRange(rowNumber, 1, 1, HEADERS[name].length).setValues([rowFromObject_(name, obj)]);
}

function rewriteRows_(name, objs) {
  var sheet = getSheet_(name);
  var cols = HEADERS[name].length;
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    sheet.getRange(2, 1, lastRow - 1, cols).clearContent();
  }
  if (objs.length) {
    sheet.getRange(2, 1, objs.length, cols).setValues(objs.map(function (o) { return rowFromObject_(name, o); }));
  }
}

function findBy_(name, field, value) {
  var rows = readTable_(name);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][field]) === String(value)) {
      return rows[i];
    }
  }
  return null;
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return fn();
  } finally {
    lock.releaseLock();
  }
}

function newId_(prefix) {
  var stamp = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyMMddHHmmss');
  var rand = Utilities.getUuid().replace(/-/g, '').substring(0, 6).toUpperCase();
  return prefix + stamp + rand;
}

function toIso_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Bangkok', "yyyy-MM-dd'T'HH:mm:ss");
  }
  return v === undefined || v === null ? '' : String(v);
}

function toDateOnly_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Bangkok', 'yyyy-MM-dd');
  }
  return v === undefined || v === null ? '' : String(v).substring(0, 10);
}

function getFolder_(propKey) {
  var id = getProps_().getProperty(propKey);
  if (!id) {
    throw new Error('SETUP_REQUIRED');
  }
  return DriveApp.getFolderById(id);
}
