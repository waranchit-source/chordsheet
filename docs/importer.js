(function (global) {
  var C = global.Chords;
  var PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
  var PDFJS_SRI = 'sha384-/1qUCSGwTur9vjf/z9lmu/eCUYbpOTgSjmpbMQZ1/CtX2v/WcAIKqRv+U1DUCG6e';
  var PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  var MAX_BYTES = 25 * 1024 * 1024;
  var MAX_PAGES = 80;
  var W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  var MC_NS = 'http://schemas.openxmlformats.org/markup-compatibility/2006';
  var THAI_RE = /[\u0E00-\u0E7F]/;
  var COMBINING_RE = /[\u0E31\u0E34-\u0E3A\u0E47-\u0E4E]/;
  var LEADING_VOWEL_RE = /[\u0E40-\u0E44]/;
  var LETTER_RE = /[A-Za-z\u00C0-\u024F\u0E01-\u0E2E]/;
  var LETTERS_G = /[A-Za-z\u00C0-\u024F\u0E01-\u0E2E]/g;
  var DECOR_RE = /^(?:[|\-\/.*:~>\u2013\u2014%]+|[x\u00d7]?\d{1,2}[x\u00d7]?|\(?[x\u00d7]\d{1,2}\)?|N\.?C\.?|\(|\))$/i;
  var LABEL_RE = /^\s*(?:intro|verse|chorus|pre[\s-]?chorus|bridge|solo|outro|interlude|instrumental|tag|ending|coda|refrain|hook|turnaround|\u0E17\u0E48\u0E2D\u0E19|\u0E2E\u0E38\u0E04|\u0E2A\u0E23\u0E49\u0E2D\u0E22|\u0E14\u0E19\u0E15\u0E23\u0E35|\u0E08\u0E1A|\u0E2D\u0E34\u0E19\u0E42\u0E17\u0E23|\u0E42\u0E0B\u0E42\u0E25\u0E48)/i;
  var KEY_WORD = '(?:original\\s+key|key|\\u0E04\\u0E35\\u0E22\\u0E4C)';
  var KEY_NOTE = '([A-Ga-g](?:#|b)?(?:min|m(?!aj))?)(?![A-Za-z0-9#])';
  var KEY_IN_TITLE_RE = new RegExp('[\\(\\[]?\\s*' + KEY_WORD + '\\s*(?:of\\s+|[:=\\uFF1A\\-]\\s*)?' + KEY_NOTE + '\\s*[\\)\\]]?', 'i');
  var KEY_LINE_RE = new RegExp('^\\s*[\\(\\[]?\\s*' + KEY_WORD + '\\s*(?:of\\s+|[:=\\uFF1A\\-]\\s*)?' + KEY_NOTE + '\\s*[\\)\\]]?\\s*[,;|\\-\\u2013]?\\s*(.*)$', 'i');
  var PAGE_NO_RE = /^(?:[-\u2013]\s*)?(?:page|p\.|\u0E2B\u0E19\u0E49\u0E32(?:\u0E17\u0E35\u0E48)?)?\s*\d{1,3}(?:\s*(?:\/|of|\u0E08\u0E32\u0E01)\s*\d{1,3})?(?:\s*[-\u2013])?$/i;
  var NUMBER_PREFIX_RE = /^\s*(?:\d{1,3}|[\u0E50-\u0E59]{1,3})\s*(?:[.)\]]\s*|[:\-]\s+)(?=\S)/;
  var PUA_TABLE = [
    [0x0E48, 0xF70A, 0xF88B], [0x0E49, 0xF70B, 0xF88E], [0x0E4A, 0xF70C, 0xF891], [0x0E4B, 0xF70D, 0xF894], [0x0E4C, 0xF70E, 0xF897],
    [0x0E38, 0xF718, 0xF89B], [0x0E39, 0xF719, 0xF89C], [0x0E3A, 0xF71A, 0xF89D],
    [0x0E48, 0xF705, 0xF88C], [0x0E49, 0xF706, 0xF88F], [0x0E4A, 0xF707, 0xF892], [0x0E4B, 0xF708, 0xF895], [0x0E4C, 0xF709, 0xF898],
    [0x0E48, 0xF713, 0xF88A], [0x0E49, 0xF714, 0xF88D], [0x0E4A, 0xF715, 0xF890], [0x0E4B, 0xF716, 0xF893], [0x0E4C, 0xF717, 0xF896],
    [0x0E31, 0xF710, 0xF884], [0x0E34, 0xF701, 0xF885], [0x0E35, 0xF702, 0xF886], [0x0E36, 0xF703, 0xF887], [0x0E37, 0xF704, 0xF888],
    [0x0E47, 0xF712, 0xF889], [0x0E4D, 0xF711, 0xF899], [0x0E0D, 0xF70F, 0xF89A], [0x0E10, 0xF700, 0xF89E]
  ];
  var PUA = {};
  PUA_TABLE.forEach(function (r) {
    PUA[r[1]] = String.fromCharCode(r[0]);
    PUA[r[2]] = String.fromCharCode(r[0]);
  });
  var pdfLibPromise = null;

  function fail(code) {
    var e = new Error(code);
    e.code = code;
    return e;
  }

  function cleanText(s) {
    var out = '';
    var str = String(s || '');
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      out += PUA[code] || str.charAt(i);
    }
    return out
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFD]/g, '')
      .replace(/[\u200B-\u200D\u2060\uFEFF\u00AD]/g, '')
      .replace(/[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g, ' ')
      .replace(/\u0E4D([\u0E48-\u0E4B]?)\u0E32/g, '$1\u0E33')
      .replace(/\u266F/g, '#')
      .replace(/\u266D/g, 'b')
      .replace(/[\u2018\u2019]/g, '\'')
      .replace(/[\u201C\u201D]/g, '"');
  }

  function clusters(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var ch = str.charAt(i);
      var code = str.charCodeAt(i);
      if (out.length && COMBINING_RE.test(ch)) {
        out[out.length - 1] += ch;
        continue;
      }
      if (code >= 0xD800 && code <= 0xDBFF && i + 1 < str.length) {
        ch += str.charAt(i + 1);
        i++;
      }
      out.push(ch);
    }
    return out;
  }

  function newLine() {
    return { text: '', xs: [], xe: [], sizes: {}, n: 0, boldN: 0, italicN: 0, start: null };
  }

  function pushRun(line, str, x0, size, bold, italic, family, measure, targetWidth) {
    var cl = clusters(str);
    var widths = cl.map(function (c) { return measure(c, size, bold, family); });
    var total = 0;
    widths.forEach(function (w) { total += w; });
    var scale = targetWidth !== undefined && targetWidth > 0 && total > 0 ? targetWidth / total : 1;
    var x = x0;
    if (line.start === null) {
      line.start = x0;
    }
    for (var k = 0; k < cl.length; k++) {
      var w = widths[k] * scale;
      for (var j = 0; j < cl[k].length; j++) {
        line.text += cl[k].charAt(j);
        line.xs.push(x);
        line.xe.push(x + w);
      }
      if (/\S/.test(cl[k])) {
        var key = String(Math.round(size * 2) / 2);
        line.sizes[key] = (line.sizes[key] || 0) + 1;
        line.n++;
        if (bold) {
          line.boldN++;
        }
        if (italic) {
          line.italicN++;
        }
      }
      x += w;
    }
    return x;
  }

  function finishLine(line, align) {
    var t = line.text;
    var a = 0;
    var b = t.length;
    while (a < b && /\s/.test(t.charAt(a))) {
      a++;
    }
    while (b > a && /\s/.test(t.charAt(b - 1))) {
      b--;
    }
    var xs = line.xs.slice(a, b);
    var xe = line.xe.slice(a, b);
    var size = 0;
    var best = -1;
    Object.keys(line.sizes).forEach(function (k) {
      if (line.sizes[k] > best) {
        best = line.sizes[k];
        size = Number(k);
      }
    });
    var out = {
      text: t.substring(a, b),
      xs: xs,
      xe: xe,
      x0: xs.length ? xs[0] : 0,
      end: xe.length ? xe[xe.length - 1] : 0,
      size: size || 11,
      bold: line.n > 0 && line.boldN * 2 > line.n,
      italic: line.n > 0 && line.italicN * 2 > line.n,
      align: align || 'left',
      blankBefore: false,
      bigGapBefore: false
    };
    if (align === 'center' || align === 'right') {
      var origin = line.start === null ? out.x0 : line.start;
      var shift = align === 'center' ? -(origin + out.end) / 2 : -out.end;
      out.xs = out.xs.map(function (v) { return v + shift; });
      out.xe = out.xe.map(function (v) { return v + shift; });
      out.x0 += shift;
      out.end += shift;
    }
    return out;
  }

  function normToken(raw) {
    var tok = raw;
    if (/^\(.*\)$/.test(tok)) {
      tok = tok.substring(1, tok.length - 1);
    }
    tok = tok.replace(/^[|\[]+/, '').replace(/[|,\]]+$/, '');
    return tok;
  }

  function chordTokens(text) {
    if (!text || THAI_RE.test(text)) {
      return null;
    }
    var re = /\S+/g;
    var m;
    var out = [];
    while ((m = re.exec(text)) !== null) {
      var raw = m[0];
      var tok = normToken(raw);
      if (tok && C.isChordToken(tok)) {
        out.push({ index: m.index + Math.max(0, raw.indexOf(tok)), chord: tok });
      } else if (!DECOR_RE.test(raw)) {
        return null;
      }
    }
    return out.length ? out : null;
  }

  function bracketTokens(text) {
    return text.replace(/\S+/g, function (raw) {
      var tok = normToken(raw);
      if (tok && C.isChordToken(tok)) {
        var at = raw.indexOf(tok);
        return raw.substring(0, at) + '[' + tok + ']' + raw.substring(at + tok.length);
      }
      return raw;
    });
  }

  function musicLine(text) {
    var m = /^(\s*[^:\[\]]{1,30}:)(.*)$/.exec(text);
    if (m && m[2].trim() && chordTokens(m[2]) && !chordTokens(m[1].replace(/:$/, ''))) {
      return m[1] + bracketTokens(m[2]);
    }
    var mm = /^(\s*\S+(?:\s+\d{1,2})?)(\s+.*)$/.exec(text);
    if (mm && LABEL_RE.test(mm[1]) && chordTokens(mm[2])) {
      return mm[1] + bracketTokens(mm[2]);
    }
    return null;
  }

  function fixBrackets(text) {
    var whole = /^\s*\[([^\]]+)\]\s*:?\s*$/.exec(text);
    if (whole && !chordTokens(whole[1])) {
      return { text: whole[1].trim() + ':', changed: true };
    }
    var changed = false;
    var out = text.replace(/\[([^\]]*)\]/g, function (all, inner) {
      if (inner.trim() && inner.trim().split(/\s+/).every(function (t) { return C.isChordToken(t); })) {
        return all;
      }
      changed = true;
      return '(' + inner + ')';
    });
    return { text: out, changed: changed };
  }

  function classify(line) {
    var fixed = fixBrackets(line.text);
    if (fixed.changed) {
      if (fixed.text.length !== line.text.length) {
        line.xs = null;
        line.xe = null;
      }
      line.text = fixed.text;
    }
    var t = line.text;
    if (!t.trim()) {
      return 'blank';
    }
    if (/^\s*\{[^{}]*\}\s*$/.test(t)) {
      return 'directive';
    }
    var ct = chordTokens(t);
    if (ct) {
      line.chords = ct;
      return 'chords';
    }
    if (KEY_LINE_RE.test(t)) {
      return 'key';
    }
    var mu = musicLine(t);
    if (mu !== null) {
      line.music = mu;
      return 'music';
    }
    if (/\[[^\]]+\]/.test(t)) {
      return 'bracket';
    }
    if (C.parseLine(t).type === 'section') {
      return 'section';
    }
    return 'text';
  }

  function mergeByX(chordLine, lyric) {
    var t = lyric.text;
    var xs = lyric.xs;
    var cands = [];
    for (var i = 0; i < t.length; i++) {
      var ch = t.charAt(i);
      if (!/\s/.test(ch) && !COMBINING_RE.test(ch)) {
        cands.push(i);
      }
    }
    var chords = chordLine.chords.map(function (c) {
      return { chord: c.chord, x: chordLine.xs ? chordLine.xs[c.index] : 0 };
    }).sort(function (a, b) { return a.x - b.x; });
    if (!cands.length || !xs) {
      return null;
    }
    var size = lyric.size || chordLine.size || 11;
    var inserts = [];
    var tail = [];
    var prev = -1;
    chords.forEach(function (c) {
      if (c.x > lyric.end - size * 0.15) {
        tail.push(c.chord);
        return;
      }
      var best = -1;
      var bestD = Infinity;
      cands.forEach(function (idx) {
        var d = Math.abs(xs[idx] - c.x);
        if (d < bestD) {
          bestD = d;
          best = idx;
        }
      });
      if (best > 0 && LEADING_VOWEL_RE.test(t.charAt(best - 1)) && !LEADING_VOWEL_RE.test(t.charAt(best))) {
        best--;
      }
      if (best <= prev) {
        var nextIdx = -1;
        for (var k = 0; k < cands.length; k++) {
          if (cands[k] > prev) {
            nextIdx = cands[k];
            break;
          }
        }
        if (nextIdx < 0) {
          tail.push(c.chord);
          return;
        }
        best = nextIdx;
      }
      inserts.push({ idx: best, chord: c.chord });
      prev = best;
    });
    var out = '';
    var pos = 0;
    inserts.forEach(function (ins) {
      out += t.substring(pos, ins.idx) + '[' + ins.chord + ']';
      pos = ins.idx;
    });
    out += t.substring(pos);
    tail.forEach(function (c) {
      out += ' [' + c + ']';
    });
    return out;
  }

  function formatKey(k) {
    var m = /^([A-Ga-g])([#b]?)(min|m)?$/.exec(String(k || '').trim());
    if (!m) {
      return '';
    }
    var key = m[1].toUpperCase() + m[2] + (m[3] ? 'm' : '');
    return C.parseKey(key) ? key : '';
  }

  function guessKey(content) {
    var re = /\[([^\]]+)\]/g;
    var m;
    while ((m = re.exec(String(content || ''))) !== null) {
      var tokens = m[1].trim().split(/\s+/);
      for (var i = 0; i < tokens.length; i++) {
        var mm = /^([A-G][#b]?)(.*)$/.exec(tokens[i]);
        if (mm && C.isChordToken(tokens[i])) {
          var q = mm[2].replace(/\/.*$/, '');
          return mm[1] + (/^(m(?!aj)|min)/.test(q) ? 'm' : '');
        }
      }
    }
    return '';
  }

  function hasChords(content) {
    var re = /\[([^\]]+)\]/g;
    var m;
    while ((m = re.exec(String(content || ''))) !== null) {
      if (m[1].trim().split(/\s+/).every(function (t) { return C.isChordToken(t); })) {
        return true;
      }
    }
    return false;
  }

  function parseTitle(text) {
    var t = String(text || '');
    var key = '';
    var km = KEY_IN_TITLE_RE.exec(t);
    if (km) {
      key = formatKey(km[1]);
      if (key) {
        t = t.substring(0, km.index) + ' ' + t.substring(km.index + km[0].length);
      }
    }
    t = t.replace(NUMBER_PREFIX_RE, '')
      .replace(/\(\s*\)/g, ' ')
      .replace(/\s+/g, ' ')
      .replace(/^[\s"'*\-\u2013\u2014|:]+|[\s"'*\-\u2013\u2014|:,]+$/g, '')
      .trim();
    return { title: t.substring(0, 120), key: key };
  }

  function directive(text) {
    var m = /^\s*\{\s*([A-Za-z_]+)\s*(?::\s*([\s\S]*?))?\s*\}\s*$/.exec(text);
    if (!m) {
      return null;
    }
    return { name: m[1].toLowerCase(), value: (m[2] || '').trim() };
  }

  function nextContentLine(lines, i) {
    for (var j = i + 1; j < lines.length; j++) {
      if (lines[j].kind !== 'blank' && !lines[j].drop) {
        return lines[j];
      }
    }
    return null;
  }

  function isTitle(lines, i, ctx) {
    var L = lines[i];
    if (L.kind !== 'text') {
      return false;
    }
    var t = L.text.trim();
    if (t.length > 90 || !LETTER_RE.test(t)) {
      return false;
    }
    var next = nextContentLine(lines, i);
    var big = L.size >= ctx.bodySize * 1.12 && L.size - ctx.bodySize >= 0.9;
    if (big) {
      if (next && next.kind === 'text' && !next.blankBefore && next.size >= L.size - 0.3 && next.text.length > 3) {
        return false;
      }
      return t.length <= 80;
    }
    if (next && next.kind === 'key') {
      return t.length <= 60;
    }
    var cue = (L.bold && !ctx.mostBold) || (L.align === 'center' && !ctx.mostCenter);
    if (!cue) {
      return false;
    }
    if (!(i === 0 || L.blankBefore || lines[i - 1].drop)) {
      return false;
    }
    if (!next || ['chords', 'text', 'music', 'section', 'bracket', 'key'].indexOf(next.kind) < 0) {
      return false;
    }
    if (next.kind === 'text' && !next.blankBefore) {
      if (L.bold && !ctx.mostBold && next.bold) {
        return false;
      }
      if (L.align === 'center' && !ctx.mostCenter && next.align === 'center' && !L.bold) {
        return false;
      }
    }
    return t.length <= 60 && t.split(/\s+/).length <= 10;
  }

  function context(regions) {
    var sizes = {};
    var n = 0;
    var boldN = 0;
    var centerN = 0;
    var all = [];
    regions.forEach(function (r) {
      r.lines.forEach(function (L) {
        if (L.drop) {
          return;
        }
        all.push(L.size);
        if (L.kind !== 'text' || L.text.trim().length < 4) {
          return;
        }
        var w = L.text.length;
        var k = String(Math.round(L.size * 2) / 2);
        sizes[k] = (sizes[k] || 0) + w;
        n += w;
        if (L.bold) {
          boldN += w;
        }
        if (L.align === 'center') {
          centerN += w;
        }
      });
    });
    var bodySize = 0;
    var best = -1;
    Object.keys(sizes).forEach(function (k) {
      if (sizes[k] > best) {
        best = sizes[k];
        bodySize = Number(k);
      }
    });
    if (!bodySize && all.length) {
      all.sort(function (a, b) { return a - b; });
      bodySize = all[Math.floor(all.length / 2)];
    }
    return { bodySize: bodySize || 11, mostBold: n > 0 && boldN * 2 > n, mostCenter: n > 0 && centerN * 2 > n };
  }

  function dropPageFurniture(regions) {
    var pages = {};
    regions.forEach(function (r) {
      var live = r.lines.filter(function (L) { return L.kind !== 'blank'; });
      if (!live.length) {
        return;
      }
      if (!pages[r.page]) {
        pages[r.page] = { first: live[0], last: live[live.length - 1] };
      } else {
        pages[r.page].last = live[live.length - 1];
      }
    });
    var keys = Object.keys(pages);
    var firstCount = {};
    var lastCount = {};
    keys.forEach(function (p) {
      var f = pages[p].first.text.trim();
      var l = pages[p].last.text.trim();
      firstCount[f] = (firstCount[f] || 0) + 1;
      lastCount[l] = (lastCount[l] || 0) + 1;
    });
    keys.forEach(function (p) {
      var pg = pages[p];
      [pg.first, pg.last].forEach(function (L) {
        var t = L.text.trim();
        if (PAGE_NO_RE.test(t)) {
          L.drop = true;
        }
      });
      if (keys.length > 1 && firstCount[pg.first.text.trim()] > 1) {
        pg.first.drop = true;
      }
      if (keys.length > 1 && lastCount[pg.last.text.trim()] > 1) {
        pg.last.drop = true;
      }
    });
  }

  function songContent(lines) {
    var out = [];
    var pushBlank = function () {
      if (out.length && out[out.length - 1] !== '') {
        out.push('');
      }
    };
    for (var i = 0; i < lines.length; i++) {
      var L = lines[i];
      if (L.blankBefore) {
        pushBlank();
      }
      if (L.kind === 'chords') {
        var next = lines[i + 1];
        if (next && next.kind === 'text' && !next.blankBefore && next.xs) {
          var merged = mergeByX(L, next);
          if (merged !== null) {
            out.push(merged);
            i++;
            continue;
          }
        }
        out.push(bracketTokens(L.text));
      } else if (L.kind === 'music') {
        out.push(L.music);
      } else {
        out.push(L.text);
      }
    }
    while (out.length && !out[0].trim()) {
      out.shift();
    }
    while (out.length && !out[out.length - 1].trim()) {
      out.pop();
    }
    return out.join('\n');
  }

  function buildSongs(regions, meta) {
    meta = meta || {};
    regions = regions.filter(function (r) { return r.lines && r.lines.length; });
    regions.forEach(function (r) {
      r.lines.forEach(function (L) {
        L.kind = classify(L);
      });
    });
    if (meta.pdf) {
      dropPageFurniture(regions);
    }
    var ctx = context(regions);
    var titled = false;
    regions.forEach(function (r) {
      r.lines.forEach(function (L, i) {
        if (L.drop) {
          return;
        }
        var d = L.kind === 'directive' ? directive(L.text) : null;
        if (d && (d.name === 'title' || d.name === 't') && d.value) {
          L.isTitle = true;
          L.titleText = d.value;
        } else if (isTitle(r.lines, i, ctx)) {
          L.isTitle = true;
          L.titleText = L.text;
        }
        if (L.isTitle) {
          titled = true;
        }
      });
    });
    var songs = [];
    var cur = null;
    var start = function (r, title, key, lost) {
      cur = { title: title || '', key: key || '', artist: '', lines: [], page: r.page, lost: lost || 0 };
      songs.push(cur);
    };
    var contentCount = function () {
      return cur ? cur.lines.filter(function (x) { return x.kind !== 'blank'; }).length : 0;
    };
    regions.forEach(function (r) {
      if (!titled && cur && contentCount()) {
        cur = null;
      }
      r.lines.forEach(function (L) {
        if (L.drop || L.kind === 'blank') {
          return;
        }
        if (L.isTitle) {
          var pt = parseTitle(L.titleText);
          start(r, pt.title, pt.key, L.lost);
          return;
        }
        if (L.kind === 'directive') {
          var d = directive(L.text);
          if (!d) {
            return;
          }
          if (!cur) {
            start(r, '', '');
          }
          if ((d.name === 'key' || d.name === 'k') && formatKey(d.value)) {
            cur.key = formatKey(d.value);
          } else if ((d.name === 'subtitle' || d.name === 'st' || d.name === 'artist') && d.value) {
            cur.artist = d.value;
          } else if (/^(comment|c|ci|cb|comment_italic|comment_box)$/.test(d.name) && d.value) {
            cur.lines.push({ text: d.value, kind: 'text', xs: null, blankBefore: L.blankBefore });
          } else if (d.name === 'soc' || d.name === 'start_of_chorus') {
            cur.lines.push({ text: 'Chorus:', kind: 'section', xs: null, blankBefore: true });
          }
          return;
        }
        if (!titled && L.bigGapBefore && cur && contentCount() >= 2) {
          cur = null;
        }
        if (!cur) {
          start(r, '', '');
        }
        if (L.kind === 'key') {
          var km = KEY_LINE_RE.exec(L.text);
          if (km && contentCount() < 3) {
            if (!cur.key) {
              cur.key = formatKey(km[1]);
            }
            if (km[2] && km[2].trim()) {
              cur.lines.push({ text: km[2].trim(), kind: 'text', xs: null, blankBefore: L.blankBefore });
            }
            return;
          }
          L.kind = 'text';
        }
        cur.lost += L.lost || 0;
        cur.lines.push(L);
      });
    });
    return songs.map(function (s) {
      var content = songContent(s.lines);
      return {
        title: s.title,
        key: s.key || guessKey(content),
        artist: s.artist,
        content: content,
        page: s.page || 0,
        hasChords: hasChords(content),
        lost: s.lost
      };
    }).filter(function (s) { return s.content.trim(); });
  }

  function median(list) {
    if (!list.length) {
      return 0;
    }
    var s = list.slice().sort(function (a, b) { return a - b; });
    return s[Math.floor(s.length / 2)];
  }

  function markGaps(lines) {
    var diffs = [];
    for (var k = 1; k < lines.length; k++) {
      var d = lines[k - 1].y - lines[k].y;
      if (d > 0 && d < lines[k].size * 4) {
        diffs.push(d);
      }
    }
    var step = median(diffs);
    if (!step) {
      return;
    }
    for (var j = 1; j < lines.length; j++) {
      var gap = lines[j - 1].y - lines[j].y;
      if (gap > step * 1.35 && gap > lines[j].size * 1.2) {
        lines[j].blankBefore = true;
      }
      if (gap > step * 2.6) {
        lines[j].bigGapBefore = true;
      }
    }
  }

  function markCenter(lines) {
    if (lines.length < 2) {
      return;
    }
    var minX = Infinity;
    var maxX = -Infinity;
    lines.forEach(function (L) {
      minX = Math.min(minX, L.x0);
      maxX = Math.max(maxX, L.end);
    });
    var width = maxX - minX;
    if (width <= 0) {
      return;
    }
    var mid = (minX + maxX) / 2;
    lines.forEach(function (L) {
      var lw = L.end - L.x0;
      if (lw < width * 0.8 && L.x0 > minX + width * 0.06 && Math.abs((L.x0 + L.end) / 2 - mid) < width * 0.05 + 2) {
        L.align = 'center';
      }
    });
  }

  function pdfLine(items, measure) {
    items.sort(function (a, b) { return a.x - b.x; });
    var line = newLine();
    var lastEnd = null;
    var last = null;
    var ys = [];
    var lost = 0;
    var chordish = function (s) {
      var t = s.trim();
      return !!t && !/\s/.test(t) && C.isChordToken(normToken(t));
    };
    items.forEach(function (it) {
      if (last && it.str === last.str && Math.abs(it.x - last.x) < 1 && Math.abs(it.y - last.y) < 1) {
        last.bold = true;
        return;
      }
      lost += it.lost || 0;
      if (!it.str) {
        return;
      }
      var gap = lastEnd === null ? 0 : it.x - lastEnd;
      var split = gap > it.size * 0.22 || (gap > -it.size * 0.05 && last && chordish(last.str) && chordish(it.str));
      if (lastEnd !== null && split && !/\s$/.test(line.text) && !/^\s/.test(it.str)) {
        line.text += ' ';
        line.xs.push(lastEnd);
        line.xe.push(Math.max(it.x, lastEnd));
      }
      lastEnd = pushRun(line, it.str, it.x, it.size, it.bold, it.italic, null, measure, it.w > 0 ? it.w : undefined);
      last = it;
      ys.push(it.y);
    });
    var out = finishLine(line, 'left');
    out.y = median(ys);
    out.lost = lost;
    return out;
  }

  function groupLines(items, measure) {
    var sorted = items.slice().sort(function (a, b) { return b.y - a.y || a.x - b.x; });
    var groups = [];
    sorted.forEach(function (it) {
      var g = groups.length ? groups[groups.length - 1] : null;
      if (g && Math.abs(g.y - it.y) <= 0.4 * Math.min(g.size, it.size)) {
        g.items.push(it);
      } else {
        groups.push({ y: it.y, size: it.size, items: [it] });
      }
    });
    return groups.map(function (g) { return pdfLine(g.items, measure); }).filter(function (L) { return L.text.trim(); });
  }

  function findGutter(items, measure) {
    if (items.length < 8) {
      return null;
    }
    var minX = Infinity;
    var maxX = -Infinity;
    var sizeSum = 0;
    items.forEach(function (it) {
      minX = Math.min(minX, it.x);
      maxX = Math.max(maxX, it.x + it.w);
      sizeSum += it.size;
    });
    var width = maxX - minX;
    var avgSize = sizeSum / items.length;
    if (width < avgSize * 20) {
      return null;
    }
    var center = minX + width / 2;
    var best = null;
    var bestCross = Infinity;
    var bestDist = Infinity;
    for (var g = minX + width * 0.3; g <= minX + width * 0.7; g += 2) {
      var cross = 0;
      for (var i = 0; i < items.length; i++) {
        if (items[i].x < g - 1 && items[i].x + items[i].w > g + 1) {
          cross++;
        }
      }
      var dist = Math.abs(g - center);
      if (cross < bestCross || (cross === bestCross && dist < bestDist)) {
        best = g;
        bestCross = cross;
        bestDist = dist;
      }
    }
    if (best === null || bestCross > Math.max(2, items.length * 0.06)) {
      return null;
    }
    var lyricLines = function (list) {
      return groupLines(list, measure).filter(function (L) {
        return !chordTokens(L.text) && (L.text.match(LETTERS_G) || []).length >= 3;
      });
    };
    var left = lyricLines(items.filter(function (it) { return it.x + it.w <= best + 1; }));
    var right = lyricLines(items.filter(function (it) { return it.x >= best - 1; }));
    if (left.length < 3 || right.length < 3) {
      return null;
    }
    var starts = right.map(function (L) { return L.x0; }).sort(function (a, b) { return a - b; });
    var near = starts.filter(function (x) { return x - starts[0] < avgSize * 3; }).length;
    if (near < right.length * 0.4) {
      return null;
    }
    return best;
  }

  function pageRegions(items, pageNo, measure) {
    var regions = [];
    var make = function (list) {
      if (!list.length) {
        return;
      }
      var lines = groupLines(list, measure);
      markGaps(lines);
      markCenter(lines);
      if (lines.length) {
        regions.push({ page: pageNo, lines: lines });
      }
    };
    var gutter = findGutter(items, measure);
    if (gutter === null) {
      make(items);
      return regions;
    }
    var left = [];
    var right = [];
    var wide = [];
    items.forEach(function (it) {
      if (it.x + it.w <= gutter + 1) {
        left.push(it);
      } else if (it.x >= gutter - 1) {
        right.push(it);
      } else {
        wide.push(it);
      }
    });
    var topOf = function (list) {
      var top = -Infinity;
      list.forEach(function (it) { top = Math.max(top, it.y); });
      return top;
    };
    var colTop = Math.min(topOf(left), topOf(right));
    var above = function (it) { return it.y > colTop + it.size * 0.5; };
    make(wide.concat(left, right).filter(above));
    make(left.filter(function (it) { return !above(it); }));
    make(right.filter(function (it) { return !above(it); }));
    make(wide.filter(function (it) { return !above(it); }));
    return regions;
  }

  function loadPdfLib() {
    if (global.pdfjsLib) {
      return Promise.resolve(global.pdfjsLib);
    }
    if (pdfLibPromise) {
      return pdfLibPromise;
    }
    pdfLibPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = PDFJS_URL;
      s.integrity = PDFJS_SRI;
      s.crossOrigin = 'anonymous';
      s.referrerPolicy = 'no-referrer';
      s.async = true;
      s.onload = function () {
        var lib = global.pdfjsLib || global['pdfjs-dist/build/pdf'];
        if (!lib) {
          pdfLibPromise = null;
          reject(fail('IMPORT_LIB'));
          return;
        }
        lib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
        resolve(lib);
      };
      s.onerror = function () {
        pdfLibPromise = null;
        if (s.parentNode) {
          s.parentNode.removeChild(s);
        }
        reject(fail('IMPORT_LIB'));
      };
      document.head.appendChild(s);
    });
    return pdfLibPromise;
  }

  function fontInfo(page, name, cache) {
    if (cache[name]) {
      return cache[name];
    }
    var info = { bold: false, italic: false };
    try {
      if (page.commonObjs && page.commonObjs.has(name)) {
        var f = page.commonObjs.get(name);
        var n = String((f && (f.name || f.fallbackName)) || '');
        info.bold = !!(f && (f.bold || f.black)) || /bold|black|heavy|semibold|demibold/i.test(n);
        info.italic = !!(f && f.italic) || /italic|oblique/i.test(n);
      }
    } catch (e) {
    }
    cache[name] = info;
    return info;
  }

  function readPdf(buf, env) {
    return loadPdfLib().then(function (lib) {
      return lib.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 }).promise.catch(function (e) {
        var name = e && e.name ? e.name : '';
        throw fail(name === 'PasswordException' ? 'IMPORT_PASSWORD' : 'IMPORT_READ');
      });
    }).then(function (pdf) {
      if (pdf.numPages > MAX_PAGES) {
        pdf.destroy();
        throw fail('IMPORT_TOO_MANY_PAGES');
      }
      var regions = [];
      var hasText = false;
      var chain = Promise.resolve();
      var addPage = function (p) {
        chain = chain.then(function () {
          return pdf.getPage(p);
        }).then(function (page) {
          return page.getOperatorList().catch(function () { return null; }).then(function () {
            return page.getTextContent();
          }).then(function (tc) {
            var cache = {};
            var items = [];
            tc.items.forEach(function (it) {
              if (typeof it.str !== 'string' || !it.transform) {
                return;
              }
              var tr = it.transform;
              if (Math.abs(tr[1]) > Math.abs(tr[0]) * 0.1) {
                return;
              }
              var size = Math.abs(tr[3]) || Math.sqrt(tr[2] * tr[2] + tr[3] * tr[3]) || it.height;
              var lostChars = (it.str.match(/[\u0000�]/g) || []).length;
              var str = cleanText(it.str);
              if (!size || (!str.trim() && !lostChars)) {
                return;
              }
              var fi = fontInfo(page, it.fontName, cache);
              items.push({ x: tr[4], y: tr[5], w: it.width, size: size, str: str, bold: fi.bold, italic: fi.italic, lost: lostChars });
              if (LETTER_RE.test(str)) {
                hasText = true;
              }
            });
            pageRegions(items, p, env.measure).forEach(function (r) { regions.push(r); });
            page.cleanup();
          });
        });
      };
      for (var p = 1; p <= pdf.numPages; p++) {
        addPage(p);
      }
      return chain.then(function () {
        pdf.destroy();
        return { kind: 'pdf', regions: regions, hasText: hasText };
      }, function (e) {
        pdf.destroy();
        throw e.code ? e : fail('IMPORT_READ');
      });
    });
  }

  function readU16(b, o) {
    return b[o] | (b[o + 1] << 8);
  }

  function readU32(b, o) {
    return (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0;
  }

  function unzip(buf) {
    var b = new Uint8Array(buf);
    var eocd = -1;
    for (var i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
      if (readU32(b, i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) {
      throw fail('IMPORT_READ');
    }
    var count = readU16(b, eocd + 10);
    var off = readU32(b, eocd + 16);
    var entries = {};
    var dec = new TextDecoder('utf-8');
    for (var n = 0; n < count; n++) {
      if (off + 46 > b.length || readU32(b, off) !== 0x02014b50) {
        throw fail('IMPORT_READ');
      }
      var method = readU16(b, off + 10);
      var csize = readU32(b, off + 20);
      var nameLen = readU16(b, off + 28);
      var extraLen = readU16(b, off + 30);
      var commentLen = readU16(b, off + 32);
      var local = readU32(b, off + 42);
      var name = dec.decode(b.subarray(off + 46, off + 46 + nameLen));
      entries[name] = { method: method, csize: csize, local: local };
      off += 46 + nameLen + extraLen + commentLen;
    }
    return {
      has: function (name) { return Object.prototype.hasOwnProperty.call(entries, name); },
      text: function (name) {
        var e = entries[name];
        if (!e) {
          return Promise.resolve(null);
        }
        if (e.csize === 0xFFFFFFFF || e.local + 30 > b.length || readU32(b, e.local) !== 0x04034b50) {
          return Promise.reject(fail('IMPORT_READ'));
        }
        var start = e.local + 30 + readU16(b, e.local + 26) + readU16(b, e.local + 28);
        var data = b.subarray(start, start + e.csize);
        if (e.method === 0) {
          return Promise.resolve(dec.decode(data));
        }
        if (e.method !== 8) {
          return Promise.reject(fail('IMPORT_READ'));
        }
        if (typeof DecompressionStream === 'undefined') {
          return Promise.reject(fail('IMPORT_BROWSER'));
        }
        var stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
        return new Response(stream).arrayBuffer().then(function (out) {
          return dec.decode(new Uint8Array(out));
        }, function () {
          throw fail('IMPORT_READ');
        });
      }
    };
  }

  function parseXml(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) {
      throw fail('IMPORT_READ');
    }
    return doc;
  }

  function isW(el, local) {
    return el && el.nodeType === 1 && el.namespaceURI === W_NS && (!local || el.localName === local);
  }

  function wKid(el, local) {
    if (!el) {
      return null;
    }
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (isW(c, local)) {
        return c;
      }
    }
    return null;
  }

  function wKids(el, local) {
    var out = [];
    if (!el) {
      return out;
    }
    for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
      if (isW(c, local)) {
        out.push(c);
      }
    }
    return out;
  }

  function wAttr(el, name) {
    if (!el) {
      return null;
    }
    var v = el.getAttributeNS(W_NS, name);
    if (v === null || v === '') {
      v = el.getAttribute('w:' + name);
    }
    return v === '' ? null : v;
  }

  function onOff(el) {
    var v = wAttr(el, 'val');
    return !(v === '0' || v === 'false' || v === 'off' || v === 'none');
  }

  function num(v) {
    var n = Number(v);
    return isFinite(n) ? n : null;
  }

  function parseRPr(rPr) {
    var p = {};
    if (!rPr) {
      return p;
    }
    var e;
    if ((e = wKid(rPr, 'sz')) && num(wAttr(e, 'val')) !== null) {
      p.sz = num(wAttr(e, 'val')) / 2;
    }
    if ((e = wKid(rPr, 'szCs')) && num(wAttr(e, 'val')) !== null) {
      p.szCs = num(wAttr(e, 'val')) / 2;
    }
    if ((e = wKid(rPr, 'b'))) {
      p.b = onOff(e);
    }
    if ((e = wKid(rPr, 'bCs'))) {
      p.bCs = onOff(e);
    }
    if ((e = wKid(rPr, 'i'))) {
      p.i = onOff(e);
    }
    if ((e = wKid(rPr, 'vanish'))) {
      p.vanish = onOff(e);
    }
    if ((e = wKid(rPr, 'caps'))) {
      p.caps = onOff(e);
    }
    if ((e = wKid(rPr, 'vertAlign'))) {
      p.vert = wAttr(e, 'val');
    }
    if ((e = wKid(rPr, 'rFonts'))) {
      var a = wAttr(e, 'ascii') || wAttr(e, 'hAnsi');
      var cs = wAttr(e, 'cs');
      if (a) {
        p.font = a;
      }
      if (cs) {
        p.fontCs = cs;
      }
    }
    if ((e = wKid(rPr, 'rStyle'))) {
      p.rStyle = wAttr(e, 'val');
    }
    return p;
  }

  function parsePPr(pPr) {
    var p = {};
    if (!pPr) {
      return p;
    }
    var e;
    if ((e = wKid(pPr, 'pStyle'))) {
      p.style = wAttr(e, 'val');
    }
    if ((e = wKid(pPr, 'jc'))) {
      p.jc = wAttr(e, 'val');
    }
    if ((e = wKid(pPr, 'ind'))) {
      var left = num(wAttr(e, 'left'));
      if (left === null) {
        left = num(wAttr(e, 'start'));
      }
      if (left !== null) {
        p.left = left / 20;
      }
      if (num(wAttr(e, 'firstLine')) !== null) {
        p.firstLine = num(wAttr(e, 'firstLine')) / 20;
      }
      if (num(wAttr(e, 'hanging')) !== null) {
        p.hanging = num(wAttr(e, 'hanging')) / 20;
      }
    }
    if ((e = wKid(pPr, 'tabs'))) {
      p.tabs = wKids(e, 'tab').map(function (t) {
        return { pos: (num(wAttr(t, 'pos')) || 0) / 20, val: wAttr(t, 'val') };
      });
    }
    if ((e = wKid(pPr, 'pageBreakBefore'))) {
      p.pageBreakBefore = onOff(e);
    }
    return p;
  }

  function merge() {
    var out = {};
    for (var i = 0; i < arguments.length; i++) {
      var o = arguments[i];
      if (!o) {
        continue;
      }
      Object.keys(o).forEach(function (k) {
        if (o[k] === undefined || o[k] === null) {
          return;
        }
        if (k === 'tabs' && out.tabs) {
          out.tabs = out.tabs.concat(o.tabs);
        } else {
          out[k] = o[k];
        }
      });
    }
    return out;
  }

  function readStyles(xml) {
    var st = { rPr: {}, pPr: {}, styles: {}, defaultPara: null };
    if (!xml) {
      return st;
    }
    var doc = parseXml(xml);
    var defs = doc.getElementsByTagNameNS(W_NS, 'docDefaults')[0];
    if (defs) {
      st.rPr = parseRPr(wKid(wKid(defs, 'rPrDefault'), 'rPr'));
      st.pPr = parsePPr(wKid(wKid(defs, 'pPrDefault'), 'pPr'));
    }
    Array.prototype.forEach.call(doc.getElementsByTagNameNS(W_NS, 'style'), function (s) {
      var id = wAttr(s, 'styleId');
      if (!id) {
        return;
      }
      var based = wKid(s, 'basedOn');
      st.styles[id] = {
        type: wAttr(s, 'type'),
        basedOn: based ? wAttr(based, 'val') : null,
        rPr: parseRPr(wKid(s, 'rPr')),
        pPr: parsePPr(wKid(s, 'pPr'))
      };
      var def = wAttr(s, 'default');
      if (st.styles[id].type === 'paragraph' && (def === '1' || def === 'true')) {
        st.defaultPara = id;
      }
    });
    return st;
  }

  function styleChain(st, id) {
    var chain = [];
    var guard = 0;
    while (id && st.styles[id] && guard < 12) {
      chain.unshift(st.styles[id]);
      id = st.styles[id].basedOn;
      guard++;
    }
    var rPr = {};
    var pPr = {};
    chain.forEach(function (s) {
      rPr = merge(rPr, s.rPr);
      pPr = merge(pPr, s.pPr);
    });
    return { rPr: rPr, pPr: pPr };
  }

  function nextTab(x, tabs, def) {
    var stops = (tabs || []).filter(function (t) { return t.val !== 'clear' && t.val !== 'bar'; }).map(function (t) { return t.pos; }).sort(function (a, b) { return a - b; });
    for (var i = 0; i < stops.length; i++) {
      if (stops[i] > x + 0.5) {
        return stops[i];
      }
    }
    return (Math.floor(x / def + 0.001) + 1) * def;
  }

  function floatsIn(el) {
    var out = [];
    var all = el.getElementsByTagNameNS(W_NS, 'txbxContent');
    Array.prototype.forEach.call(all, function (t) {
      for (var a = t.parentNode; a && a !== el; a = a.parentNode) {
        if (a.namespaceURI === MC_NS && a.localName === 'Fallback') {
          return;
        }
        if (a.namespaceURI === W_NS && a.localName === 'txbxContent') {
          return;
        }
      }
      out.push(t);
    });
    return out;
  }

  function docxParagraph(p, env) {
    var direct = parsePPr(wKid(p, 'pPr'));
    var sc = styleChain(env.st, direct.style || env.st.defaultPara);
    var pp = merge(env.st.pPr, sc.pPr, direct);
    var rpBase = merge(env.st.rPr, sc.rPr);
    var jc = pp.jc || 'left';
    var align = jc === 'center' ? 'center' : (jc === 'right' || jc === 'end') ? 'right' : 'left';
    var indent = pp.left || 0;
    var firstX = indent + (pp.firstLine || 0) - (pp.hanging || 0);
    var lines = [];
    var floats = [];
    var line = newLine();
    var x = firstX;
    var pageBreaks = 0;
    var renderedBreaks = 0;
    var breakLine = function () {
      lines.push(finishLine(line, align));
      line = newLine();
      x = indent;
    };
    var addText = function (str, rp) {
      var s = cleanText(str);
      if (rp.caps) {
        s = s.toUpperCase();
      }
      var chunks = s.match(/[\u0E00-\u0E7F]+(?:\s+[\u0E00-\u0E7F]+)*\s*|[^\u0E00-\u0E7F]+/g) || [];
      chunks.forEach(function (ch) {
        var thai = THAI_RE.test(ch);
        var size = thai ? (rp.szCs || rp.sz || 11) : (rp.sz || 11);
        if (rp.vert === 'superscript' || rp.vert === 'subscript') {
          size *= 0.65;
        }
        var bold = thai ? (rp.bCs !== undefined ? rp.bCs : !!rp.b) : !!rp.b;
        var fam = thai ? (rp.fontCs || rp.font) : rp.font;
        x = pushRun(line, ch, x, size, bold, !!rp.i, fam, env.measure);
      });
    };
    var run = function (r) {
      var direct2 = parseRPr(wKid(r, 'rPr'));
      var cs = direct2.rStyle ? styleChain(env.st, direct2.rStyle).rPr : null;
      var rp = merge(rpBase, cs, direct2);
      if (rp.vanish) {
        return;
      }
      for (var c = r.firstElementChild; c; c = c.nextElementSibling) {
        if (c.namespaceURI !== W_NS) {
          if (c.namespaceURI === MC_NS || c.localName === 'drawing' || c.localName === 'pict') {
            floatsIn(c).forEach(function (f) { floats.push(f); });
          }
          continue;
        }
        var n = c.localName;
        if (n === 't') {
          addText(c.textContent, rp);
        } else if (n === 'tab' || n === 'ptab') {
          var tx = nextTab(x, pp.tabs, env.defTab);
          if (line.start === null) {
            line.start = x;
          }
          line.text += ' ';
          line.xs.push(x);
          line.xe.push(tx);
          x = tx;
        } else if (n === 'br') {
          var type = wAttr(c, 'type');
          if (type === 'page') {
            pageBreaks++;
          }
          breakLine();
        } else if (n === 'cr') {
          breakLine();
        } else if (n === 'noBreakHyphen') {
          addText('-', rp);
        } else if (n === 'lastRenderedPageBreak') {
          renderedBreaks++;
        } else if (n === 'drawing' || n === 'pict' || n === 'object') {
          floatsIn(c).forEach(function (f) { floats.push(f); });
        }
      }
    };
    var walk = function (el) {
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
        if (c.namespaceURI === MC_NS && c.localName === 'AlternateContent') {
          var choice = null;
          for (var k = c.firstElementChild; k; k = k.nextElementSibling) {
            if (k.localName === 'Choice') {
              choice = k;
              break;
            }
          }
          if (choice) {
            walk(choice);
          }
          continue;
        }
        if (c.namespaceURI !== W_NS) {
          continue;
        }
        var n = c.localName;
        if (n === 'r') {
          run(c);
        } else if (n === 'hyperlink' || n === 'ins' || n === 'smartTag' || n === 'fldSimple' || n === 'customXml' || n === 'sdt' || n === 'sdtContent' || n === 'moveTo' || n === 'dir' || n === 'bdo') {
          walk(c);
        }
      }
    };
    walk(p);
    lines.push(finishLine(line, align));
    return {
      lines: lines,
      floats: floats,
      pageBreakBefore: !!pp.pageBreakBefore,
      pageBreaks: pageBreaks,
      renderedBreaks: renderedBreaks,
      empty: lines.every(function (L) { return !L.text.trim(); })
    };
  }

  function docxRegions(doc, env) {
    var regions = [];
    var body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
    if (!body) {
      throw fail('IMPORT_READ');
    }
    var state = { region: null, blank: 0 };
    var newRegion = function () {
      state.region = { page: env.page, lines: [] };
      state.blank = 0;
      regions.push(state.region);
      return state.region;
    };
    newRegion();
    var addPara = function (p, topLevel) {
      var res = docxParagraph(p, env);
      if (topLevel && res.pageBreakBefore) {
        env.page++;
        if (state.region.lines.length) {
          newRegion();
        }
      }
      if (res.empty) {
        state.blank++;
      } else {
        res.lines.forEach(function (L) {
          if (!L.text.trim()) {
            state.blank++;
            return;
          }
          L.blankBefore = state.blank > 0;
          L.bigGapBefore = state.blank > 1;
          state.blank = 0;
          state.region.lines.push(L);
        });
      }
      if (res.pageBreaks) {
        env.page += res.pageBreaks;
        if (topLevel && state.region.lines.length) {
          newRegion();
        }
      }
      if (res.renderedBreaks && !res.pageBreaks && !res.pageBreakBefore) {
        env.page += res.renderedBreaks;
      }
      res.floats.forEach(function (f) {
        var keep = state.region;
        var keepBlank = state.blank;
        newRegion();
        walkContainer(f, false);
        state.region = keep;
        state.blank = keepBlank;
      });
    };
    var table = function (tbl) {
      wKids(tbl, 'tr').forEach(function (tr) {
        wKids(tr, 'tc').forEach(function (tc) {
          newRegion();
          walkContainer(tc, false);
        });
      });
      newRegion();
    };
    var walkContainer = function (el, topLevel) {
      for (var c = el.firstElementChild; c; c = c.nextElementSibling) {
        if (c.namespaceURI === MC_NS && c.localName === 'AlternateContent') {
          for (var k = c.firstElementChild; k; k = k.nextElementSibling) {
            if (k.localName === 'Choice') {
              walkContainer(k, topLevel);
              break;
            }
          }
          continue;
        }
        if (c.namespaceURI !== W_NS) {
          continue;
        }
        var n = c.localName;
        if (n === 'p') {
          addPara(c, topLevel);
        } else if (n === 'tbl') {
          table(c);
        } else if (n === 'sdt') {
          var content = wKid(c, 'sdtContent');
          if (content) {
            walkContainer(content, topLevel);
          }
        } else if (n === 'customXml' || n === 'ins' || n === 'moveTo') {
          walkContainer(c, topLevel);
        }
      }
    };
    walkContainer(body, true);
    return regions.filter(function (r) { return r.lines.length; });
  }

  function readDocx(buf, env) {
    var zip = unzip(buf);
    if (!zip.has('word/document.xml')) {
      throw fail('IMPORT_TYPE');
    }
    return Promise.all([zip.text('word/document.xml'), zip.text('word/styles.xml'), zip.text('word/settings.xml')]).then(function (parts) {
      var defTab = 36;
      if (parts[2]) {
        var m = /defaultTabStop[^>]*w:val="(\d+)"/.exec(parts[2]);
        if (m && Number(m[1]) > 0) {
          defTab = Number(m[1]) / 20;
        }
      }
      var denv = { st: readStyles(parts[1]), defTab: defTab, measure: env.measure, page: 1 };
      var regions = docxRegions(parseXml(parts[0]), denv);
      var hasText = regions.some(function (r) { return r.lines.some(function (L) { return LETTER_RE.test(L.text); }); });
      return { kind: 'docx', regions: regions, hasText: hasText };
    });
  }

  function canvasMeasure() {
    var canvas = document.createElement('canvas');
    var ctx = canvas.getContext('2d');
    var cache = {};
    var current = '';
    return function (text, size, bold, family) {
      var fam = family ? '"' + String(family).replace(/["\\]/g, '') + '", ' : '';
      var font = (bold ? '700 ' : '400 ') + '100px ' + fam + 'Sarabun, sans-serif';
      var key = font + '\u0001' + text;
      var w = cache[key];
      if (w === undefined) {
        if (font !== current) {
          ctx.font = font;
          current = font;
        }
        w = ctx.measureText(text).width / 100;
        cache[key] = w;
      }
      return w * size;
    };
  }

  function fontsReady() {
    if (!document.fonts || !document.fonts.load) {
      return Promise.resolve();
    }
    return Promise.all(['400 16px Sarabun', '700 16px Sarabun'].map(function (f) {
      return document.fonts.load(f, '\u0E01A').catch(function () { return null; });
    })).then(function () { return null; });
  }

  function sniff(buf) {
    var b = new Uint8Array(buf, 0, Math.min(1024, buf.byteLength));
    if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4B && b[2] === 0x03 && b[3] === 0x04) {
      return 'zip';
    }
    if (b.length >= 4 && b[0] === 0xD0 && b[1] === 0xCF && b[2] === 0x11 && b[3] === 0xE0) {
      return 'doc';
    }
    for (var i = 0; i + 4 < b.length; i++) {
      if (b[i] === 0x25 && b[i + 1] === 0x50 && b[i + 2] === 0x44 && b[i + 3] === 0x46 && b[i + 4] === 0x2D) {
        return 'pdf';
      }
    }
    return '';
  }

  function readFile(file, env) {
    if (file.size > MAX_BYTES) {
      return Promise.reject(fail('IMPORT_TOO_BIG'));
    }
    var getBuf = file.arrayBuffer ? file.arrayBuffer() : new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = function () { reject(fail('IMPORT_READ')); };
      fr.readAsArrayBuffer(file);
    });
    return getBuf.then(function (buf) {
      var kind = sniff(buf);
      if (kind === 'pdf') {
        return readPdf(buf, env);
      }
      if (kind === 'zip') {
        return readDocx(buf, env);
      }
      if (kind === 'doc') {
        throw fail('IMPORT_DOC');
      }
      throw fail('IMPORT_TYPE');
    }).then(function (res) {
      if (!res.hasText) {
        throw fail('IMPORT_NO_TEXT');
      }
      return buildSongs(res.regions, { pdf: res.kind === 'pdf' }).map(function (s) {
        s.file = file.name;
        s.kind = res.kind;
        return s;
      });
    });
  }

  function readFiles(files, onProgress) {
    var env = { measure: canvasMeasure() };
    var songs = [];
    var errors = [];
    var list = Array.prototype.slice.call(files || []);
    var chain = fontsReady();
    list.forEach(function (file, i) {
      chain = chain.then(function () {
        if (onProgress) {
          onProgress(i, list.length, file.name);
        }
        return readFile(file, env).then(function (found) {
          if (!found.length) {
            errors.push({ file: file.name, code: 'IMPORT_NO_SONGS' });
          }
          found.forEach(function (s) { songs.push(s); });
        }, function (e) {
          errors.push({ file: file.name, code: e && e.code ? e.code : 'IMPORT_READ' });
        });
      });
    });
    return chain.then(function () {
      return { songs: songs, errors: errors };
    });
  }

  global.Importer = {
    readFiles: readFiles,
    buildSongs: buildSongs,
    guessKey: guessKey,
    hasChords: hasChords,
    parseTitle: parseTitle,
    _test: {
      cleanText: cleanText,
      chordTokens: chordTokens,
      musicLine: musicLine,
      mergeByX: mergeByX,
      classify: classify,
      newLine: newLine,
      pushRun: pushRun,
      finishLine: finishLine,
      pageRegions: pageRegions,
      groupLines: groupLines,
      findGutter: findGutter,
      fixBrackets: fixBrackets,
      unzip: unzip,
      readDocx: readDocx,
      readFile: readFile,
      sniff: sniff
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
