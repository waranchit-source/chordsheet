var APP_NAME = 'ระบบเนื้อเพลงและคอร์ด';

var FRONTEND_URL = 'https://waranchit-source.github.io/chordsheet/';

var SHEETS = {
  USERS: 'Users',
  SONGS: 'Songs',
  SETLISTS: 'Setlists',
  USAGE: 'UsageLog',
  SESSIONS: 'Sessions'
};

var HEADERS = {
  Users: ['Username', 'DisplayName', 'PasswordHash', 'Salt', 'Role', 'Active', 'CreatedAt', 'Status', 'ReviewedBy', 'ReviewedAt', 'Permissions'],
  Songs: ['SongId', 'Title', 'Artist', 'OriginalKey', 'Content', 'DefaultLayout', 'Tags', 'CreatedBy', 'CreatedAt', 'UpdatedBy', 'UpdatedAt', 'Deleted'],
  Setlists: ['SetlistId', 'Title', 'ServiceDate', 'Leader', 'Description', 'OutputType', 'DocId', 'PdfId', 'ItemsJson', 'CreatedBy', 'CreatedAt'],
  UsageLog: ['Timestamp', 'SetlistId', 'ServiceDate', 'Leader', 'SongId', 'SongTitle', 'Key', 'Shift'],
  Sessions: ['TokenHash', 'Username', 'CreatedAt', 'ExpiresAt']
};

var ROLES = {
  admin: 3,
  leader: 2,
  viewer: 1
};

var PERMISSIONS = ['songs.view', 'songs.edit', 'songs.delete', 'setlist.create', 'history.view', 'setlist.delete', 'stats.view', 'users.manage'];

var PERMISSION_NEEDS = {
  'songs.edit': ['songs.view'],
  'songs.delete': ['songs.view'],
  'setlist.create': ['songs.view'],
  'setlist.delete': ['history.view']
};

var ROLE_PERMISSIONS = {
  viewer: ['songs.view', 'history.view', 'stats.view'],
  leader: ['songs.view', 'songs.edit', 'setlist.create', 'history.view', 'stats.view'],
  admin: PERMISSIONS
};

var USER_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved',
  REJECTED: 'rejected'
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
var REMEMBER_DAYS = 30;
var LOGIN_MAX_FAILS = 5;
var LOGIN_LOCK_SECONDS = 600;
var REGISTER_MAX_PER_WINDOW = 20;
var REGISTER_WINDOW_SECONDS = 600;
var SCHEMA_VERSION = 'schema_v3';
var PERM_VERSION_KEY = 'perm_version';
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
