(function (global) {
  var SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
  var AUTO = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'G#', 'A', 'Bb', 'B'];
  var NOTE_INDEX = { 'C': 0, 'B#': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'Fb': 4, 'E#': 5, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11, 'Cb': 11 };
  var MAJOR_KEY_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
  var MINOR_KEY_NAMES = ['Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm'];
  var CHORD_RE = /^([A-G])([#b]?)([^\/\s]*)(?:\/([A-G])([#b]?))?$/;
  var QUALITY_RE = /^(m|min|maj|M|dim|aug|sus|add|\+|-|°|ø|[0-9]|\(|\)|b|#|alt|no)*$/;
  var SECTION_LABEL_RE = /^\s*(intro|verse|chorus|pre[\s-]?chorus|bridge|solo|outro|outtro|midtro|interlude|instrumental|tag|ending|coda|last\s*line|refrain|hook|ท่อน|ฮุค|สร้อย|ดนตรี|จบ)/i;
  var LABEL_PREFIX_RE = /^(\s*(?:intro|verse|chorus|pre[\s-]?chorus|bridge|solo|outro|outtro|midtro|interlude|instrumental|tag|ending|coda|last\s*line|refrain|hook|ท่อน|ฮุค|สร้อย|ดนตรี|จบ)[^\s:\[\]\u0E00-\u0E7F]*(?:\s*(?:[0-9]{1,2}|[A-Z])(?=\s*(?::|$)))?\s*:?)/i;
  var THAI_RE = /[฀-๿]/;
  var THAI_COMBINING_RE = /[ัิ-ฺ็-๎]/;
  var INLINE_RUN_RE = /([^\s\u0E00-\u0E7F\[\]]+)( ?)/g;

  function mod12(n) {
    return ((n % 12) + 12) % 12;
  }

  function parseChord(token) {
    var m = CHORD_RE.exec(token);
    if (!m) {
      return null;
    }
    if (!QUALITY_RE.test(m[3])) {
      return null;
    }
    return {
      root: NOTE_INDEX[m[1] + m[2]],
      quality: m[3],
      bass: m[4] ? NOTE_INDEX[m[4] + m[5]] : null
    };
  }

  function isChordToken(token) {
    return !!parseChord(token);
  }

  function parseKey(key) {
    var m = /^\s*([A-G])([#b]?)(m|min|minor)?\s*$/i.exec(String(key || ''));
    if (!m) {
      return null;
    }
    var name = m[1].toUpperCase() + (m[2] || '');
    if (NOTE_INDEX[name] === undefined) {
      return null;
    }
    return { pc: NOTE_INDEX[name], minor: !!m[3] };
  }

  function noteNames(accidental) {
    if (accidental === 'sharp') {
      return SHARP;
    }
    if (accidental === 'flat') {
      return FLAT;
    }
    return AUTO;
  }

  function noteName(pc, names) {
    return (names || AUTO)[mod12(pc)];
  }

  function formatKey(key) {
    var m = /^\s*([A-G])([#b]?)(m|min|minor)?\s*$/i.exec(String(key || ''));
    if (!m || !parseKey(key)) {
      return '';
    }
    return m[1].toUpperCase() + (m[2] || '') + (m[3] ? 'm' : '');
  }

  function transposeKey(key, shift, names) {
    var k = parseKey(key);
    if (!k) {
      return '';
    }
    return noteName(k.pc + shift, names) + (k.minor ? 'm' : '');
  }

  function transposeChord(token, shift, names) {
    var c = parseChord(token);
    if (!c) {
      return token;
    }
    var out = noteName(c.root + shift, names) + c.quality;
    if (c.bass !== null) {
      out += '/' + noteName(c.bass + shift, names);
    }
    return out;
  }

  function transposeBracket(inner, shift, names) {
    return inner.replace(/[^\s]+/g, function (t) {
      return transposeChord(t, shift, names);
    });
  }

  function transposeContent(content, shift, names) {
    return String(content || '').replace(/\[([^\]]*)\]/g, function (all, inner) {
      return '[' + transposeBracket(inner, shift, names) + ']';
    });
  }

  function prepareForOutput(song, shift, accidental) {
    var names = noteNames(accidental);
    var asWritten = mod12(shift) === 0 && accidental === 'auto';
    var content = asWritten ? song.content : transposeContent(song.content, shift, names);
    var key = asWritten ? formatKey(song.originalKey) : transposeKey(song.originalKey, shift, names);
    return { content: content, key: key };
  }

  function parseLine(line) {
    var raw = String(line || '').replace(/\t/g, '    ').replace(/\s+$/, '');
    if (!raw.trim()) {
      return { type: 'empty' };
    }
    var segments = [];
    var re = /\[([^\]]*)\]/g;
    var last = 0;
    var m;
    var current = { chord: '', text: '' };
    while ((m = re.exec(raw)) !== null) {
      current.text += raw.substring(last, m.index);
      segments.push(current);
      current = { chord: m[1].trim(), text: '' };
      last = re.lastIndex;
    }
    current.text += raw.substring(last);
    segments.push(current);
    if (segments.length && !segments[0].chord && !segments[0].text) {
      segments.shift();
    }
    var hasChord = segments.some(function (s) { return !!s.chord; });
    var plain = segments.map(function (s) { return s.text; }).join('');
    if (!hasChord) {
      if (SECTION_LABEL_RE.test(plain) && plain.trim().length <= 30 && (/:\s*$/.test(plain) || !THAI_RE.test(plain))) {
        return { type: 'section', text: plain.trim() };
      }
      return { type: 'text', text: plain };
    }
    var stripped = plain.replace(/[\s:|\-\/.,*()x×0-9]/gi, '');
    if (!THAI_RE.test(plain) && (stripped.length === 0 || /:/.test(plain) || SECTION_LABEL_RE.test(plain))) {
      return { type: 'inline', segments: segments };
    }
    return { type: 'chordlyric', segments: segments };
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function renderHtml(content) {
    var lines = String(content || '').replace(/\r\n/g, '\n').split('\n');
    var html = [];
    lines.forEach(function (line) {
      var p = parseLine(line);
      if (p.type === 'empty') {
        html.push('<div class="cl-blank"></div>');
      } else if (p.type === 'section') {
        html.push('<div class="cl-section">' + esc(p.text) + '</div>');
      } else if (p.type === 'text') {
        html.push('<div class="cl-text">' + esc(p.text) + '</div>');
      } else if (p.type === 'inline') {
        var parts = p.segments.map(function (s) {
          return (s.chord ? '<b class="cl-chord-inline">' + esc(s.chord) + '</b>' : '') + (s.text ? esc(s.text) : '');
        });
        html.push('<div class="cl-inline">' + parts.join(' ') + '</div>');
      } else {
        var segs = p.segments.map(function (s) {
          var text = s.text === '' ? ' ' : s.text;
          return '<span class="cl-seg' + (s.chord ? ' has-chord' : '') + '"><span class="cl-c">' + (s.chord ? esc(s.chord) : ' ') + '</span><span class="cl-l">' + esc(text) + '</span></span>';
        });
        html.push('<div class="cl-line">' + segs.join('') + '</div>');
      }
    });
    return html.join('');
  }

  function visualColumns(text) {
    var cols = [];
    var col = 0;
    for (var i = 0; i < text.length; i++) {
      var ch = text.charAt(i);
      cols.push(col);
      if (!THAI_COMBINING_RE.test(ch)) {
        col++;
      }
    }
    cols.push(col);
    return cols;
  }

  function isChordOnlyLine(line) {
    if (THAI_RE.test(line)) {
      return false;
    }
    var tokens = line.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) {
      return false;
    }
    var chordCount = 0;
    for (var i = 0; i < tokens.length; i++) {
      if (isChordToken(tokens[i])) {
        chordCount++;
      } else if (!/^[|\-\/.*x×0-9()]+$/i.test(tokens[i])) {
        return false;
      }
    }
    return chordCount > 0;
  }

  function bracketChordsInLine(line) {
    return line.replace(/(^|\s)([^\s]+)/g, function (all, sp, tok) {
      if (isChordToken(tok)) {
        return sp + '[' + tok + ']';
      }
      return all;
    });
  }

  function mergeChordLine(chordLine, lyricLine) {
    var chords = [];
    var re = /[^\s]+/g;
    var m;
    var chordVisual = visualColumns(chordLine);
    while ((m = re.exec(chordLine)) !== null) {
      if (isChordToken(m[0])) {
        chords.push({ col: chordVisual[m.index], chord: m[0] });
      }
    }
    var cols = visualColumns(lyricLine);
    var maxCol = cols[cols.length - 1];
    var inserts = [];
    var tail = [];
    chords.forEach(function (c) {
      if (c.col >= maxCol) {
        tail.push(c);
        return;
      }
      var idx = 0;
      for (var i = 0; i < lyricLine.length; i++) {
        if (cols[i] >= c.col && !THAI_COMBINING_RE.test(lyricLine.charAt(i))) {
          idx = i;
          break;
        }
        idx = i + 1;
      }
      while (idx < lyricLine.length && /\s/.test(lyricLine.charAt(idx))) {
        idx++;
      }
      if (idx >= lyricLine.length) {
        tail.push(c);
        return;
      }
      inserts.push({ idx: idx, chord: c.chord });
    });
    var out = '';
    var pos = 0;
    inserts.sort(function (a, b) { return a.idx - b.idx; }).forEach(function (ins) {
      out += lyricLine.substring(pos, ins.idx) + '[' + ins.chord + ']';
      pos = ins.idx;
    });
    out += lyricLine.substring(pos);
    tail.forEach(function (c) {
      out += ' [' + c.chord + ']';
    });
    return out;
  }

  function hasBracket(line) {
    return /\[[^\]]*\]/.test(line);
  }

  function hasOwn(obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key);
  }

  function labelPrefix(line) {
    var m = LABEL_PREFIX_RE.exec(line);
    return m ? m[1] : '';
  }

  function bracketThaiText(text) {
    return text.replace(INLINE_RUN_RE, function (all, run) {
      return isChordToken(run) ? '[' + run + ']' : all;
    });
  }

  function bracketThaiLine(line) {
    var prefix = labelPrefix(line);
    var rest = line.substring(prefix.length);
    if (!THAI_RE.test(rest)) {
      return prefix + bracketChordsInLine(rest);
    }
    var out = '';
    var re = /\[[^\]]*\]/g;
    var last = 0;
    var m;
    while ((m = re.exec(rest)) !== null) {
      out += bracketThaiText(rest.substring(last, m.index)) + m[0];
      last = re.lastIndex;
    }
    out += bracketThaiText(rest.substring(last));
    return prefix + out;
  }

  function isMusicLine(line) {
    var tokens = line.trim().split(/\s+/).filter(Boolean);
    return tokens.some(isChordToken) && (/:/.test(line) || SECTION_LABEL_RE.test(line));
  }

  function bracketMusicLine(line) {
    var prefix = labelPrefix(line);
    return prefix + bracketChordsInLine(line.substring(prefix.length));
  }

  function isLyricLine(line) {
    if (line === null || line === undefined) {
      return false;
    }
    var t = String(line).replace(/\s+$/, '');
    if (!t.trim() || hasBracket(t) || isChordOnlyLine(t)) {
      return false;
    }
    return parseLine(t).type === 'text';
  }

  function normalizeLines(text) {
    return String(text || '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  }

  function fromEditable(text, memo) {
    var mp = memo && memo.p ? memo.p : {};
    var ms = memo && memo.s ? memo.s : {};
    var lines = normalizeLines(text);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].replace(/\s+$/, '');
      var next = i + 1 < lines.length ? lines[i + 1].replace(/\s+$/, '') : null;
      if (next !== null && hasOwn(mp, line + '\n' + next)) {
        out.push(mp[line + '\n' + next]);
        i++;
        continue;
      }
      if (hasOwn(ms, line)) {
        out.push(ms[line]);
        continue;
      }
      if (!line.trim()) {
        out.push('');
        continue;
      }
      if (THAI_RE.test(line)) {
        out.push(bracketThaiLine(line));
        continue;
      }
      if (hasBracket(line)) {
        out.push(line);
        continue;
      }
      if (isChordOnlyLine(line)) {
        if (isLyricLine(next)) {
          var merged = mergeChordLine(line, next);
          out.push(THAI_RE.test(merged) ? bracketThaiLine(merged) : merged);
          i++;
        } else {
          out.push(bracketChordsInLine(line));
        }
        continue;
      }
      if (isMusicLine(line)) {
        out.push(bracketMusicLine(line));
        continue;
      }
      out.push(line);
    }
    return out.join('\n');
  }

  function autoBracket(text) {
    return fromEditable(text, null);
  }

  function unbracketInner(inner) {
    var tokens = String(inner).trim().split(/\s+/).filter(Boolean);
    if (!tokens.length || !tokens.every(isChordToken)) {
      return null;
    }
    return tokens.join(' ');
  }

  function unbracketThai(line) {
    var prefix = labelPrefix(line);
    var rest = line.substring(prefix.length);
    if (!THAI_RE.test(rest)) {
      var mu = unbracketMusic(rest);
      return prefix + (mu === null ? rest : mu);
    }
    var out = '';
    var re = /\[([^\]]*)\]/g;
    var last = 0;
    var m;
    while ((m = re.exec(rest)) !== null) {
      out += rest.substring(last, m.index);
      var chord = unbracketInner(m[1]);
      if (chord === null) {
        out += m[0];
      } else {
        var prev = out.length ? out.charAt(out.length - 1) : (prefix.length ? prefix.charAt(prefix.length - 1) : '');
        if (prev && !/\s/.test(prev) && !THAI_RE.test(prev)) {
          out += ' ';
        }
        out += chord;
        if (re.lastIndex < rest.length) {
          out += ' ';
        }
      }
      last = re.lastIndex;
    }
    out += rest.substring(last);
    return prefix + out;
  }

  function chordAbovePair(line) {
    var p = parseLine(line);
    if (p.type !== 'chordlyric') {
      return null;
    }
    var chordLine = '';
    var lyric = '';
    for (var i = 0; i < p.segments.length; i++) {
      var seg = p.segments[i];
      if (seg.chord) {
        var c = unbracketInner(seg.chord);
        if (c === null || /\s/.test(c)) {
          return null;
        }
        var cols = visualColumns(lyric);
        var col = cols[cols.length - 1];
        if (chordLine.length && col < chordLine.length + 1) {
          col = chordLine.length + 1;
        }
        while (chordLine.length < col) {
          chordLine += ' ';
        }
        chordLine += c;
      }
      lyric += seg.text;
    }
    if (!isChordOnlyLine(chordLine) || !isLyricLine(lyric)) {
      return null;
    }
    return [chordLine, lyric];
  }

  function unbracketMusic(line) {
    var out = '';
    var re = /\[([^\]]*)\]/g;
    var last = 0;
    var m;
    while ((m = re.exec(line)) !== null) {
      out += line.substring(last, m.index);
      var c = unbracketInner(m[1]);
      if (c === null) {
        return null;
      }
      if (out.length && !/\s$/.test(out)) {
        out += ' ';
      }
      out += c;
      var nextCh = line.charAt(re.lastIndex);
      if (nextCh && !/\s/.test(nextCh)) {
        out += ' ';
      }
      last = re.lastIndex;
    }
    out += line.substring(last);
    return out;
  }

  function toEditable(content) {
    var memo = { p: {}, s: {} };
    var entries = String(content || '').replace(/\r\n?/g, '\n').split('\n').map(function (orig) {
      var line = orig.replace(/\t/g, '    ').replace(/\s+$/, '');
      var disp = [line];
      if (hasBracket(line)) {
        if (THAI_RE.test(line)) {
          var t = unbracketThai(line);
          if (t !== line && fromEditable(t, null) === line) {
            disp = [t];
          }
        } else {
          var pair = chordAbovePair(line);
          if (pair && fromEditable(pair.join('\n'), null) === line) {
            disp = pair;
          } else {
            var mu = unbracketMusic(line);
            if (mu !== null && mu !== line && fromEditable(mu, null) === line) {
              disp = [mu];
            }
          }
        }
      }
      return { orig: orig, line: line, disp: disp };
    });
    entries.forEach(function (e, i) {
      if (e.disp.length === 2) {
        if (e.orig !== e.line) {
          memo.p[e.disp[0] + '\n' + e.disp[1]] = e.orig;
        }
        return;
      }
      var d = e.disp[0];
      var nextEntry = entries[i + 1];
      var nextFirst = nextEntry ? nextEntry.disp[0] : null;
      var needs = e.orig !== e.line || fromEditable(d, null) !== e.line;
      if (!needs && d.trim() && !THAI_RE.test(d) && !hasBracket(d) && isChordOnlyLine(d) && isLyricLine(nextFirst)) {
        needs = true;
      }
      if (needs) {
        memo.s[d] = e.orig;
      }
    });
    var text = [];
    entries.forEach(function (e) {
      e.disp.forEach(function (d) { text.push(d); });
    });
    return { text: text.join('\n'), memo: memo };
  }

  function tidy(text, memo) {
    return toEditable(fromEditable(text, memo));
  }

  function shiftLabel(shift) {
    if (!shift) {
      return '0';
    }
    return (shift > 0 ? '+' : '') + shift;
  }

  global.Chords = {
    SHARP: SHARP,
    FLAT: FLAT,
    AUTO: AUTO,
    MAJOR_KEY_NAMES: MAJOR_KEY_NAMES,
    MINOR_KEY_NAMES: MINOR_KEY_NAMES,
    parseChord: parseChord,
    isChordToken: isChordToken,
    parseKey: parseKey,
    transposeKey: transposeKey,
    transposeChord: transposeChord,
    transposeContent: transposeContent,
    prepareForOutput: prepareForOutput,
    parseLine: parseLine,
    renderHtml: renderHtml,
    autoBracket: autoBracket,
    fromEditable: fromEditable,
    toEditable: toEditable,
    tidy: tidy,
    shiftLabel: shiftLabel,
    esc: esc
  };
})(typeof window !== 'undefined' ? window : globalThis);
