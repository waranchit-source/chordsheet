function setup() {
  var props = getProps_();
  var ss = null;
  var savedId = props.getProperty(PROP_KEYS.SPREADSHEET_ID);
  if (savedId) {
    ss = SpreadsheetApp.openById(savedId);
  } else {
    ss = SpreadsheetApp.getActiveSpreadsheet();
    if (!ss) {
      ss = SpreadsheetApp.create(APP_NAME + ' - Database');
    }
    props.setProperty(PROP_KEYS.SPREADSHEET_ID, ss.getId());
  }

  Object.keys(HEADERS).forEach(function (name) {
    var sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
    }
    var headers = HEADERS[name];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold').setBackground('#e8eefc');
    sheet.setFrozenRows(1);
  });

  ss.getSheetByName(SHEETS.SONGS).getRange('A:H').setNumberFormat('@');
  ss.getSheetByName(SHEETS.SONGS).getRange('J:J').setNumberFormat('@');
  ss.getSheetByName(SHEETS.SONGS).getRange('E:E').setWrap(false);
  ss.getSheetByName(SHEETS.SETLISTS).getRange('A:J').setNumberFormat('@');
  ss.getSheetByName(SHEETS.USAGE).getRange('B:G').setNumberFormat('@');
  ss.getSheetByName(SHEETS.USERS).getRange('A:E').setNumberFormat('@');

  var defaultSheet = ss.getSheetByName('Sheet1') || ss.getSheetByName('ชีต1');
  if (defaultSheet && ss.getSheets().length > 1 && defaultSheet.getLastRow() === 0) {
    ss.deleteSheet(defaultSheet);
  }

  var root = ensureFolder_(PROP_KEYS.ROOT_FOLDER_ID, DriveApp.getRootFolder(), DRIVE_FOLDER_NAMES.ROOT);
  var docs = ensureFolder_(PROP_KEYS.DOCS_FOLDER_ID, root, DRIVE_FOLDER_NAMES.DOCS);
  var pdf = ensureFolder_(PROP_KEYS.PDF_FOLDER_ID, root, DRIVE_FOLDER_NAMES.PDF);

  var users = readTable_(SHEETS.USERS);
  var message = [];
  if (users.length === 0) {
    var password = generatePassword_();
    createUserRecord_('admin', 'ผู้ดูแลระบบ', password, 'admin');
    message.push('สร้างผู้ใช้ admin แล้ว');
    message.push('Username: admin');
    message.push('Password: ' + password);
    message.push('กรุณาเข้าสู่ระบบแล้วเปลี่ยนรหัสผ่านทันที');
  } else {
    message.push('มีผู้ใช้ในระบบแล้ว ไม่ได้สร้าง admin ใหม่');
  }

  message.push('Spreadsheet: ' + ss.getUrl());
  message.push('โฟลเดอร์หลัก: ' + root.getUrl());
  message.push('โฟลเดอร์ Docs: ' + docs.getUrl());
  message.push('โฟลเดอร์ PDF: ' + pdf.getUrl());
  Logger.log(message.join('\n'));
  return message.join('\n');
}

function ensureFolder_(propKey, parent, name) {
  var props = getProps_();
  var id = props.getProperty(propKey);
  if (id) {
    try {
      var existing = DriveApp.getFolderById(id);
      if (!existing.isTrashed()) {
        return existing;
      }
    } catch (e) {
    }
  }
  var found = parent.getFoldersByName(name);
  var folder = found.hasNext() ? found.next() : parent.createFolder(name);
  props.setProperty(propKey, folder.getId());
  return folder;
}

function resetAdminPassword() {
  var password = generatePassword_();
  withLock_(function () {
    var user = findBy_(SHEETS.USERS, 'Username', 'admin');
    if (!user) {
      createUserRecord_('admin', 'ผู้ดูแลระบบ', password, 'admin');
      return;
    }
    var salt = generateSalt_();
    user.Salt = salt;
    user.PasswordHash = hashPassword_(password, salt);
    user.Active = true;
    user.Role = 'admin';
    updateRow_(SHEETS.USERS, user._row, user);
  });
  Logger.log('รหัสผ่านใหม่ของ admin: ' + password);
  return password;
}

function generatePassword_() {
  var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  var out = '';
  for (var i = 0; i < 10; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
