# CLAUDE.md

Project notes for Claude Code. Read this before changing anything.

## What this is

Worship team "Lyrics & Chords" system (Thai church). Song library with chord transposing, setlist builder that produces A4 PDF / Google Doc files (2 songs per page), setlist history and usage stats.

- **Frontend**: static site in `docs/`, served by GitHub Pages from branch `main`, folder `/docs`.
  Live URL: https://waranchit-source.github.io/chordsheet/ (repo `waranchit-source/chordsheet`).
- **Backend**: Google Apps Script bound to the Google Sheet "Worship song" in the owner's personal Google account (not the paperplanebkk.com work account). All `.gs` files plus `appsscript.json` at the repo root are pasted into the Apps Script editor by hand and deployed as a Web app (Execute as: Me, Access: Anyone). The `/exec` URL goes into `docs/config.js` (`API_URL`).
- **Data**: stays in the Google Sheet. Sheets: `Users`, `Songs`, `Setlists`, `UsageLog`, `Sessions`. Column order is defined by `HEADERS` in `Config.gs`; rows are read and written by position.

## Owner's working rules (strict)

The owner communicates in Thai. Reply in Thai unless asked otherwise.

1. Change only what the request asks for. If a requested change forces changes elsewhere, make them and list every one of them in the reply.
2. Test and look for bugs before handing code over. Report bugs found in parts that were not requested instead of fixing them silently.
3. Send complete files, never shortened or elided code. No comments in code.
4. Explain every manual step the owner has to do (Apps Script paste, deploy, setup, config).
5. Ask before accessing sensitive data.
6. Keep `README.md` (Thai, user facing) and this file up to date.

## Architecture

```
Browser (docs/*.js)  --fetch POST text/plain JSON-->  Apps Script doPost (Code.gs)  -->  Google Sheet / Drive / Docs
```

- Request body: `{ "action": "<name>", "token": "<session token>", "args": [ ... ] }`.
  Response: `{ "ok": true, "data": ... }` or `{ "ok": false, "error": "<CODE>" }`.
- `Content-Type: text/plain;charset=utf-8` on purpose: it avoids a CORS preflight, which Apps Script cannot answer. Do not change it to `application/json`.
- Action whitelist lives in `apiRoutes_()` in `Code.gs`. `auth: true` actions receive the token as the first argument. `login` and `register` are the only public actions.
- `doGet` returns a small "this app has moved" page linking to `FRONTEND_URL`; `?action=ping` returns JSON.
- `ensureSchema_()` (Setup.gs) runs at the start of every `doPost`, cached for 6 hours under `SCHEMA_VERSION`. It creates missing sheets and rewrites header rows to match `HEADERS`. Bump `SCHEMA_VERSION` in `Config.gs` whenever `HEADERS` changes.

### Errors and i18n

- Server throws error **codes** (e.g. `SONG_NOT_FOUND`, `ACCOUNT_PENDING`, `SHEET_NOT_FOUND:<name>`), never user text.
- The client maps codes to text through `err.<CODE>` keys in `docs/i18n.js`. Every new server code needs an `err.` entry in both `en` and `th`.
- `Render.gs` layout reasons are codes too (`half`, `full`, `full_wide`, `full_split`) translated via `reason.*`.
- Default UI language is English. `cs_lang` in localStorage stores the choice. Every key must exist in both `en` and `th` (English only keys allowed: `*.one` plural forms).

### Auth

- Passwords: salted SHA-256, 200 rounds (`hashPassword_`).
- Session token: random; cached in CacheService for 6 hours (sliding) as `sess_<token>`.
- Remember me: `login(username, password, true)` also stores `sha256('session:' + token)` in sheet `Sessions` with a 30 day sliding expiry. On a cache miss `requireSession_` restores the session from that sheet and re-checks the user is approved and active. Client keeps the token in localStorage (remember) or sessionStorage (not remembered).
- Registration: `register()` creates `Status = pending`, `Active = false`, role viewer. Admin approves or rejects in Users > Requests (`reviewUser`). Rejected usernames can register again. Blank `Status` means approved (legacy rows).
- Never nest `withLock_` calls. `deleteSessionsWhere_` does not lock; callers lock.

### Chords (docs/chords.js)

- Storage format is unchanged: ChordPro style brackets, `[C]ร้อง[G/B]เพลง`. Transposing, rendering and `Render.gs` all rely on it.
- The editor never requires brackets:
  - `fromEditable(text, memo)` turns editor text into bracket content: Thai lines take inline chords typed before a syllable (`Cร้อง G/Bเพลง`, one space after a chord is consumed); a chord only line followed by a lyric line is merged by visual column; labelled music lines (`Intro: C G`) are bracketed; existing brackets are kept.
  - `toEditable(content)` turns stored content into the no bracket view (Thai inline, English chord line above lyric). A line is only shown without brackets if it round trips exactly; `memo` keeps unchanged lines byte identical on save.
  - `tidy()` = `toEditable(fromEditable())`, used by the Tidy up button and on paste into an empty editor.
- Editor textarea uses Geist Mono so chord above lyric alignment by character count matches what the user sees.

## Design system (from github.com/elayadesign/ai-design-skills, landing-page-design Part B + figma-designer tokens)

- Fonts: Geist (Latin) with Sarabun fallback for Thai; Geist Mono for the chord editor. Chord sheets keep Sarabun to match the PDF. No italics, max weight 700.
- Type: Tailwind scale only, named classes in `styles.css` (`heading-5`, `heading-6`, `title-*`, `body-*`, `caption-*`). Inputs are 16px.
- Spacing tokens only: 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96 (`--s-*`). Main buttons 8px by 12px padding.
- Radius: Tailwind values; nested radius = outer minus gap when the gap is under 32px.
- Flat surfaces, no background gradients, borders on all sides. Dark mode backgrounds only `#181818`, `#1f1f1f`, `#272727`, `#313131` (plus `#000000`, `#131209`).
- Colors via semantic CSS variables, redefined for dark under `prefers-color-scheme` (unless `data-theme="light"`) and `[data-theme="dark"]`.
- Icons: Phosphor web font 2.1.1 (`<span class="ph ph-name">`). Never Material icons.
- Motion: `cubic-bezier(0.22, 1, 0.36, 1)`, 500ms layout, 300ms color; animate transform and opacity only; honour `prefers-reduced-motion`.
- Floating translucent nav bar; full height mobile menu below 1200px with staggered links (60ms).
- Every data view has loading skeleton, empty state and inline errors. No `alert()`. Copy: sentence case, no hyphens in English copy, no exclamation marks.
- The landing page strategy part (Part A) and the tagline reveal section do not apply: this is an app, not a landing page.

## Deploying

- Frontend: commit and push `docs/` to `main`; Pages rebuilds in about a minute. Bump the `?v=` query on the CSS and JS links in `docs/index.html` on every frontend change (cache busting).
- Backend: owner pastes changed `.gs` files into Apps Script, then Deploy > Manage deployments > Edit > New version. The `/exec` URL stays the same.
- `gh` CLI on this machine is logged in as `waranchit-source`. Its token has no `workflow` scope, so do not add GitHub Actions workflows; Pages deploys from the `/docs` folder instead.

## Testing

No test suite lives in the repo. To test end to end, run the `.gs` files in Node with mocked Apps Script services (SpreadsheetApp, CacheService, LockService, Utilities, ContentService, HtmlService, DriveApp, DocumentApp, PropertiesService) inside a `vm` context, serve `docs/` over HTTP with `/config.js` overridden to `API_URL: '/api'`, and route `POST /api` to `doPost`. Then drive the UI in a browser. Also unit test `docs/chords.js` round trips (`toEditable` then `fromEditable` must return the stored content unchanged).

## Known issue (not fixed, reported to owner)

- `appendRows_` in `Db.gs` writes with `getRange(lastRow + 1, ...)`. Real Sheets throws when that range goes past the sheet's last row, so `UsageLog` can fail once it reaches the bottom of its grid (1000 rows by default). Fix would be to insert rows before writing.

## Branches

- `main`: current GitHub Pages version.
- `original-gas`: the untouched Google Apps Script only version before the migration.
