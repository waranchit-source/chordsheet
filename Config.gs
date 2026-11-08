var APP_NAME = 'ระบบเนื้อเพลงและคอร์ด';

var SHEETS = {
  USERS: 'Users',
  SONGS: 'Songs',
  SETLISTS: 'Setlists',
  USAGE: 'UsageLog'
};

var HEADERS = {
  Users: ['Username', 'DisplayName', 'PasswordHash', 'Salt', 'Role', 'Active', 'CreatedAt'],
  Songs: ['SongId', 'Title', 'Artist', 'OriginalKey', 'Content', 'DefaultLayout', 'Tags', 'CreatedBy', 'CreatedAt', 'UpdatedBy', 'UpdatedAt', 'Deleted'],
  Setlists: ['SetlistId', 'Title', 'ServiceDate', 'Leader', 'Description', 'OutputType', 'DocId', 'PdfId', 'ItemsJson', 'CreatedBy', 'CreatedAt'],
  UsageLog: ['Timestamp', 'SetlistId', 'ServiceDate', 'Leader', 'SongId', 'SongTitle', 'Key', 'Shift']
};

var ROLES = {
  admin: 3,
  leader: 2,
  viewer: 1
};

var DRIVE_FOLDER_NAMES = {
  ROOT: 'Chord Sheet Files',
  DOCS: 'Docs',
  PDF: 'PDF'
};

var PROP_KEYS = {
  SPREADSHEET_ID: 'SPREADSHEET_ID',
  ROOT_FOLDER_ID: 'ROOT_FOLDER_ID',
  DOCS_FOLDER_ID: 'DOCS_FOLDER_ID',
  PDF_FOLDER_ID: 'PDF_FOLDER_ID'
};

var SESSION_TTL_SECONDS = 21600;
var LOGIN_MAX_FAILS = 5;
var LOGIN_LOCK_SECONDS = 600;
var HASH_ROUNDS = 200;

var LAYOUT = {
  PAGE_WIDTH: 595.28,
  PAGE_HEIGHT: 841.89,
  MARGIN_TOP: 30,
  MARGIN_BOTTOM: 30,
  MARGIN_LEFT: 30,
  MARGIN_RIGHT: 30,
  CELL_PADDING: 4,
  FONT_FAMILY: 'Sarabun',
  LYRIC_SIZE: 10,
  CHORD_SIZE: 10,
  TITLE_SIZE: 12,
  HEADER_SIZE: 12,
  NOTE_SIZE: 9,
  LINE_HEIGHT_EM: 1.6,
  SAFETY_RATIO: 0.95,
  CHORD_COLOR: '#1f3f9a'
};
