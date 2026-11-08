# CLAUDE.md

Project notes for Claude Code. Read this before changing anything.

## What this is

Worship team "Lyrics & Chords" system (Thai church). Song library with chord transposing, setlist builder that produces A4 PDF / Google Doc files (2 songs per page), setlist history and usage stats.

- **Frontend**: static site in `docs/`, served by GitHub Pages from branch `main`, folder `/docs`.
  Live URL: https://waranchit-source.github.io/chordsheet/ (repo `waranchit-source/chordsheet`, public because the account plan only serves Pages from public repos; the owner approved this on 2026-11-08).
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
- Login lock: 5 failed attempts set `fail_<username>` in the script cache and block that username for 10 minutes, even with the right password. `resetAdminPassword()` (run from the Apps Script editor, no deploy needed) also removes `fail_admin`, so the admin can sign in right away.

### Chords (docs/chords.js)

- Storage format is unchanged: ChordPro style brackets, `[C]ร้อง[G/B]เพลง`. Transposing, rendering and `Render.gs` all rely on it.
- The editor never requires brackets:
  - `fromEditable(text, memo)` turns editor text into bracket content: Thai lines take inline chords typed before a syllable (`Cร้อง G/Bเพลง`, one space after a chord is consumed); a chord only line followed by a lyric line is merged by visual column; labelled music lines (`Intro: C G`) are bracketed; existing brackets are kept.
  - `toEditable(content)` turns stored content into the no bracket view (Thai inline, English chord line above lyric). A line is only shown without brackets if it round trips exactly; `memo` keeps unchanged lines byte identical on save.
  - `tidy()` = `toEditable(fromEditable())`, used by the Tidy up button and on paste into an empty editor.
- Editor textarea uses Geist Mono so chord above lyric alignment by character count matches what the user sees.
- Transpose spelling (owner's rule): `#/b auto` always uses `AUTO = C C# D Eb E F F# G G# A Bb B` for chords and the key label. At shift 0 in auto mode the content and key are shown exactly as written. `Use #` / `Use b` force `SHARP` / `FLAT`. The PDF uses the same `prepareForOutput` result, so screen and print match.

### Google Docs rendering (Render.gs)

- Google Docs throws "Cannot insert an empty text element" for empty strings in `appendParagraph`, `appendTable` cells and similar calls. Never pass `''`: use `docText_()` (turns `''` into `' '`) and `' '` for table cells. Blank lines, empty note lines and empty right columns all hit this (fixed 2026-11-08; the original version failed on every song with a blank line).

### PDF chord alignment (Render.gs, Setlists.gs)

- Google's Docs to PDF converter (both `getAs(PDF)` and Drive export) draws U+0020 and U+00A0 about 1.3 to 1.4 times wider than the Docs editor, while real glyphs keep their exact widths. Verified 2026-11-08 with test documents exported through Drive. Runs of spaces therefore push chords to the right in PDFs only.
- PDF output: `buildDocument_(name, plan, true)` builds chord lines with `pdfChordText_`: invisible white `.` glyphs (regular weight) as filler before each chord, computed from the exact chord x positions that `buildChordLine_` now returns in `chords`. Spaces inside the paired lyric line become white dots too (`pdfLyricText_`). Word/Doc output keeps real spaces so the owner can edit it.
- "Create PDF from Doc" (`exportSetlistPdf`) exports a temporary copy after `hideSpacesForPdf_` converts every space run in it to white dots, then trashes the copy.

### Speed

- `login` returns `boot` and the `bootstrap` action returns `{ user, songs, leaders, pendingCount }` in one call. `listSongs` includes full `content` plus `searchText`, so opening a song or adding it to a setlist needs no request.
- The client caches songs and leaders in localStorage (`cs_cache`) and the user next to the token (`cs_user`). A returning visit renders from cache immediately and refreshes with one background `bootstrap` call. History and stats render the last loaded data first, then refresh.
- `fetchBoot()` falls back to `getMe` + `listSongs` + `listLeaderNames` when the server answers `UNKNOWN_ACTION`, so a newer frontend keeps working against an older Apps Script deployment. Keep this kind of fallback whenever a new action is added, because the frontend deploys on push but the backend only after the owner pastes and redeploys.

### Navigation

- All navigation lives in a floating left sidebar (`#sidebar`). The toggle (`#menuToggle`) sits in the sticky top strip next to the page title. `html.sb-open` controls it. At 1024px and wider it pushes the content (state saved in `cs_sidebar`); below that it is an off canvas drawer with backdrop, Escape, close button and staggered links, and it closes after choosing a page.

### Mobile

- Breakpoints: tables turn into stacked cards at 720px, phone layout at 640px, sidebar becomes a drawer below 1024px.
- Song page on phones: the key, reset and zoom controls live in `.song-dock`. On desktop it is `display: contents` and CSS `order` keeps the original row order; at 640px and below it becomes a fixed bottom bar, `body.has-dock` lifts the toasts above it and `.dock-spacer` keeps the last lines readable. The card holding the dock gets `reveal-fade` (no transform), because a transformed ancestor would make `position: fixed` relative to the card.
- Safe area insets (`env(safe-area-inset-*)`) are applied to the nav, page padding, menu, toasts and dock (`viewport-fit=cover`).
- `touch-action: manipulation` stops double tap zoom on rapid +½ taps; inputs and textareas are 16px on touch devices so iOS does not zoom.
- Home screen install: `docs/manifest.webmanifest` plus PNG icons in `docs/icons/` (192, 512, maskable 512, apple touch 180). The PNGs were drawn from the favicon shapes with a small Node script (zlib PNG encoder); regenerate the same way if the logo changes. No service worker on purpose, so updates are never stuck in a cache.

## Design system (from github.com/elayadesign/ai-design-skills, landing-page-design Part B + figma-designer tokens)

- Fonts: Geist (Latin) with Sarabun fallback for Thai; Geist Mono for the chord editor. Chord sheets keep Sarabun to match the PDF. No italics, max weight 700.
- Type: Tailwind scale only, named classes in `styles.css` (`heading-5`, `heading-6`, `title-*`, `body-*`, `caption-*`). Inputs are 16px.
- Spacing tokens only: 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96 (`--s-*`). Main buttons 8px by 12px padding.
- Radius: Tailwind values; nested radius = outer minus gap when the gap is under 32px.
- Flat surfaces, no background gradients, borders on all sides. Dark mode backgrounds only `#181818`, `#1f1f1f`, `#272727`, `#313131` (plus `#000000`, `#131209`).
- Colors via semantic CSS variables, redefined for dark under `prefers-color-scheme` (unless `data-theme="light"`) and `[data-theme="dark"]`.
- Icons: Phosphor web font 2.1.1 (`<span class="ph ph-name">`). Never Material icons.
- Motion: `cubic-bezier(0.22, 1, 0.36, 1)`, 500ms layout, 300ms color; animate transform and opacity only; honour `prefers-reduced-motion`.
- Floating translucent left sidebar and top strip (blurred surface, border on all sides); the drawer version below 1024px staggers its links by 60ms.
- Every data view has loading skeleton, empty state and inline errors. No `alert()`. Copy: sentence case, no hyphens in English copy, no exclamation marks.
- The landing page strategy part (Part A) and the tagline reveal section do not apply: this is an app, not a landing page.

## Deploying

- Frontend: commit and push `docs/` to `main`; Pages rebuilds in about a minute. Bump the `?v=` query on the CSS and JS links in `docs/index.html` on every frontend change (cache busting).
- Backend: owner pastes changed `.gs` files into Apps Script, then Deploy > Manage deployments > Edit > New version. The `/exec` URL stays the same.
- `gh` CLI on this machine is logged in as `waranchit-source`. Its token has no `workflow` scope, so do not add GitHub Actions workflows; Pages deploys from the `/docs` folder instead.

## Testing

No test suite lives in the repo. Make the mock strict like real Google: `getRange` past the last row must throw, and Docs calls with empty text must throw "Cannot insert an empty text element" (both bugs reached production because an early mock was lenient). To test end to end, run the `.gs` files in Node with mocked Apps Script services (SpreadsheetApp, CacheService, LockService, Utilities, ContentService, HtmlService, DriveApp, DocumentApp, PropertiesService) inside a `vm` context, serve `docs/` over HTTP with `/config.js` overridden to `API_URL: '/api'`, and route `POST /api` to `doPost`. Then drive the UI in a browser. Also unit test `docs/chords.js` round trips (`toEditable` then `fromEditable` must return the stored content unchanged).

## Sheet grid limits

- Real Sheets throws "The coordinates of the range are outside the dimensions of the sheet" when `getRange` goes past `getMaxRows()`. `appendRow` grows the sheet by itself, but a multi row `setValues` does not, so `appendRows_` in `Db.gs` calls `insertRowsAfter` first when the batch would pass the last row (fixed 2026-11-08; before that `generateSetlist` failed once `UsageLog` reached 1000 rows). Any new bulk write must do the same.

## Branches

- `main`: current GitHub Pages version.
- `original-gas`: the untouched Google Apps Script only version before the migration.
