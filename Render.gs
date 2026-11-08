var SECTION_LABEL_RE = /^\s*(intro|verse|chorus|pre[\s-]?chorus|bridge|solo|outro|outtro|midtro|interlude|instrumental|tag|ending|coda|last\s*line|refrain|hook|ท่อน|ฮุค|สร้อย|ดนตรี|จบ)/i;
var THAI_RE = /[฀-๿]/;

function charWidthUnits_(code, bold) {
  var m = bold ? FONT_METRICS.bold : FONT_METRICS.regular;
  if (code >= m.asciiStart && code < m.asciiStart + m.ascii.length) {
    return m.ascii[code - m.asciiStart];
  }
  if (code >= m.thaiStart && code < m.thaiStart + m.thai.length) {
    return m.thai[code - m.thaiStart];
  }
  if (m.extra[code] !== undefined) {
    return m.extra[code];
  }
  if (code === 9) {
    return m.ascii[0] * 4;
  }
  return m.fallback;
}

function textWidthPt_(text, bold, size) {
  var total = 0;
  var s = String(text || '');
  for (var i = 0; i < s.length; i++) {
    total += charWidthUnits_(s.charCodeAt(i), bold);
  }
  return total / FONT_METRICS.unitsPerEm * size;
}

function parseChordProLine_(line) {
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

function buildChordLine_(segments) {
  var spaceW = textWidthPt_(' ', true, LAYOUT.CHORD_SIZE);
  var out = '';
  var cur = 0;
  var x = 0;
  var lyric = '';
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    if (seg.chord) {
      var n = Math.round((x - cur) / spaceW);
      if (out.length > 0 && n < 1) {
        n = 1;
      }
      if (n < 0) {
        n = 0;
      }
      out += new Array(n + 1).join(' ') + seg.chord;
      cur += n * spaceW + textWidthPt_(seg.chord, true, LAYOUT.CHORD_SIZE);
    }
    lyric += seg.text;
    x += textWidthPt_(seg.text, false, LAYOUT.LYRIC_SIZE);
  }
  return { chordLine: out, lyricLine: lyric };
}

function buildInlineLine_(segments) {
  var text = '';
  var ranges = [];
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i];
    if (seg.chord) {
      if (text.length && !/\s$/.test(text)) {
        text += ' ';
      }
      ranges.push([text.length, text.length + seg.chord.length - 1]);
      text += seg.chord;
    }
    if (seg.text) {
      if (seg.chord && !/^\s/.test(seg.text) && !/^[:,)]/.test(seg.text)) {
        text += ' ';
      }
      text += seg.text;
    }
  }
  return { text: text.replace(/\s+$/, ''), ranges: ranges };
}

function paraLines_(widthPt, availWidth) {
  if (widthPt <= availWidth || availWidth <= 0) {
    return 1;
  }
  return Math.ceil(widthPt / availWidth);
}

function songToParagraphs_(item, number) {
  var paras = [];
  var titleText = number + '. ' + item.title;
  var keyText = item.key ? '  (Key ' + item.key + ')' : '';
  paras.push({ kind: 'title', text: titleText + keyText, size: LAYOUT.TITLE_SIZE, bold: true, align: 'center', keyStart: keyText ? titleText.length : -1 });
  if (item.note && String(item.note).trim()) {
    String(item.note).trim().split('\n').forEach(function (n) {
      paras.push({ kind: 'note', text: n, size: LAYOUT.NOTE_SIZE, italic: true, align: 'center' });
    });
  }
  var lines = String(item.content || '').replace(/\r\n/g, '\n').split('\n');
  var groupId = 0;
  lines.forEach(function (line) {
    var p = parseChordProLine_(line);
    groupId++;
    if (p.type === 'empty') {
      paras.push({ kind: 'blank', text: '', size: Math.max(4, Math.round(LAYOUT.LYRIC_SIZE * 0.6)), group: groupId, breakable: true });
    } else if (p.type === 'section') {
      paras.push({ kind: 'section', text: p.text, size: LAYOUT.LYRIC_SIZE, bold: true, group: groupId });
    } else if (p.type === 'text') {
      paras.push({ kind: 'lyric', text: p.text, size: LAYOUT.LYRIC_SIZE, group: groupId });
    } else if (p.type === 'inline') {
      var inl = buildInlineLine_(p.segments);
      paras.push({ kind: 'inline', text: inl.text, size: LAYOUT.LYRIC_SIZE, chordRanges: inl.ranges, group: groupId });
    } else {
      var cl = buildChordLine_(p.segments);
      paras.push({ kind: 'chord', text: cl.chordLine, size: LAYOUT.CHORD_SIZE, bold: true, color: LAYOUT.CHORD_COLOR, group: groupId });
      paras.push({ kind: 'lyric', text: cl.lyricLine.trim() ? cl.lyricLine : ' ', size: LAYOUT.LYRIC_SIZE, group: groupId });
    }
  });
  while (paras.length && paras[paras.length - 1].kind === 'blank') {
    paras.pop();
  }
  return paras;
}

function measureParagraphs_(paras, availWidth) {
  var total = 0;
  var maxWidth = 0;
  paras.forEach(function (p) {
    var w = textWidthPt_(p.text, !!p.bold, p.size);
    p.widthPt = w;
    if (p.kind !== 'title' && p.kind !== 'note' && w > maxWidth) {
      maxWidth = w;
    }
    p.heightPt = paraLines_(w, availWidth) * p.size * LAYOUT.LINE_HEIGHT_EM;
    total += p.heightPt;
  });
  return { height: total, maxWidth: maxWidth };
}

function pageGeometry_() {
  var contentWidth = LAYOUT.PAGE_WIDTH - LAYOUT.MARGIN_LEFT - LAYOUT.MARGIN_RIGHT;
  return {
    contentWidth: contentWidth,
    halfCellWidth: contentWidth / 2,
    halfTextWidth: contentWidth / 2 - LAYOUT.CELL_PADDING * 2,
    fullTextWidth: contentWidth - LAYOUT.CELL_PADDING * 2,
    contentHeight: (LAYOUT.PAGE_HEIGHT - LAYOUT.MARGIN_TOP - LAYOUT.MARGIN_BOTTOM) * LAYOUT.SAFETY_RATIO
  };
}

function headerParagraphs_(title, description) {
  var paras = [];
  if (title) {
    paras.push({ kind: 'header', text: title, size: LAYOUT.HEADER_SIZE, bold: true, align: 'right' });
  }
  if (description && String(description).trim()) {
    String(description).trim().split('\n').forEach(function (d) {
      paras.push({ kind: 'description', text: d, size: LAYOUT.NOTE_SIZE + 1 });
    });
  }
  return paras;
}

function splitParagraphs_(paras, avail) {
  var total = paras.reduce(function (a, p) { return a + p.heightPt; }, 0);
  var target = total / 2;
  var best = -1;
  var bestScore = Infinity;
  var cum = 0;
  for (var i = 0; i < paras.length - 1; i++) {
    cum += paras[i].heightPt;
    var next = paras[i + 1];
    var boundary = !next.group || next.group !== paras[i].group;
    if (!boundary || cum > avail) {
      continue;
    }
    var score = Math.abs(cum - target) - (paras[i].kind === 'blank' || next.kind === 'section' ? total * 0.08 : 0);
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  }
  if (best < 0) {
    best = Math.max(0, Math.floor(paras.length / 2) - 1);
  }
  var left = paras.slice(0, best + 1);
  var right = paras.slice(best + 1);
  while (right.length && right[0].kind === 'blank') {
    right.shift();
  }
  while (left.length && left[left.length - 1].kind === 'blank') {
    left.pop();
  }
  return { left: left, right: right };
}

function planLayout_(title, description, items) {
  var g = pageGeometry_();
  var header = headerParagraphs_(title, description);
  var headerHeight = measureParagraphs_(header, g.contentWidth).height;
  var avail = g.contentHeight - headerHeight;
  var planned = items.map(function (item, idx) {
    var paras = songToParagraphs_(item, idx + 1);
    var halfMeasure = measureParagraphs_(paras, g.halfTextWidth);
    var fitsWidth = halfMeasure.maxWidth <= g.halfTextWidth;
    var fitsHeight = halfMeasure.height <= avail;
    var mode = item.layout === 'half' ? 'half' : item.layout === 'full' ? 'full' : (fitsWidth && fitsHeight ? 'half' : 'full');
    var fullMode = 'wide';
    if (mode === 'full' && fitsWidth && !fitsHeight) {
      fullMode = 'split';
    }
    if (fullMode === 'wide' && mode === 'full') {
      measureParagraphs_(paras, g.fullTextWidth);
    }
    return {
      item: item,
      paras: paras,
      mode: mode,
      fullMode: fullMode,
      reason: mode === 'half' ? 'ครึ่งหน้า' : (!fitsWidth ? 'เต็มหน้า (บรรทัดยาว)' : (!fitsHeight ? 'เต็มหน้า (เพลงยาว แบ่ง 2 คอลัมน์)' : 'เต็มหน้า'))
    };
  });
  var pages = [];
  var pending = null;
  planned.forEach(function (p) {
    if (p.mode === 'half') {
      if (pending) {
        pages.push({ type: 'pair', left: pending.paras, right: p.paras, items: [pending, p] });
        pending = null;
      } else {
        pending = p;
      }
      return;
    }
    if (pending) {
      pages.push({ type: 'pair', left: pending.paras, right: [], items: [pending] });
      pending = null;
    }
    if (p.fullMode === 'split') {
      var parts = splitParagraphs_(p.paras, avail);
      pages.push({ type: 'pair', left: parts.left, right: parts.right, items: [p] });
    } else {
      pages.push({ type: 'wide', left: p.paras, items: [p] });
    }
  });
  if (pending) {
    pages.push({ type: 'pair', left: pending.paras, right: [], items: [pending] });
  }
  return { header: header, pages: pages, geometry: g };
}

function styleParagraph_(para, p) {
  var A = DocumentApp.Attribute;
  var attrs = {};
  attrs[A.FONT_FAMILY] = LAYOUT.FONT_FAMILY;
  attrs[A.FONT_SIZE] = p.size;
  attrs[A.BOLD] = !!p.bold;
  attrs[A.ITALIC] = !!p.italic;
  attrs[A.FOREGROUND_COLOR] = p.color || '#000000';
  attrs[A.SPACING_BEFORE] = 0;
  attrs[A.SPACING_AFTER] = 0;
  attrs[A.LINE_SPACING] = 1;
  attrs[A.INDENT_START] = 0;
  attrs[A.INDENT_FIRST_LINE] = 0;
  attrs[A.INDENT_END] = 0;
  para.setAttributes(attrs);
  if (p.align === 'center') {
    para.setAlignment(DocumentApp.HorizontalAlignment.CENTER);
  } else if (p.align === 'right') {
    para.setAlignment(DocumentApp.HorizontalAlignment.RIGHT);
  } else {
    para.setAlignment(DocumentApp.HorizontalAlignment.LEFT);
  }
  var text = para.editAsText();
  if (p.kind === 'inline' && p.chordRanges && p.text.length) {
    p.chordRanges.forEach(function (r) {
      text.setBold(r[0], r[1], true);
      text.setForegroundColor(r[0], r[1], LAYOUT.CHORD_COLOR);
    });
  }
  if (p.kind === 'title' && p.keyStart >= 0 && p.keyStart < p.text.length) {
    text.setFontSize(p.keyStart, p.text.length - 1, LAYOUT.NOTE_SIZE);
    text.setBold(p.keyStart, p.text.length - 1, false);
    text.setForegroundColor(p.keyStart, p.text.length - 1, LAYOUT.CHORD_COLOR);
  }
}

function fillContainer_(container, paras, reuseFirst) {
  var first = reuseFirst && container.getNumChildren() > 0 && container.getChild(0).getType() === DocumentApp.ElementType.PARAGRAPH ? container.getChild(0).asParagraph() : null;
  if (!paras.length) {
    if (first) {
      first.setText('');
    }
    return;
  }
  paras.forEach(function (p, i) {
    var para;
    if (i === 0 && first) {
      para = first;
      para.setText(p.text);
    } else {
      para = container.appendParagraph(p.text);
    }
    styleParagraph_(para, p);
  });
}

function prepareCell_(cell, width) {
  cell.setPaddingTop(0);
  cell.setPaddingBottom(0);
  cell.setPaddingLeft(LAYOUT.CELL_PADDING);
  cell.setPaddingRight(LAYOUT.CELL_PADDING);
  cell.setVerticalAlignment(DocumentApp.VerticalAlignment.TOP);
  if (width) {
    cell.setWidth(width);
  }
}

function shrinkParagraph_(para) {
  var A = DocumentApp.Attribute;
  var attrs = {};
  attrs[A.FONT_SIZE] = 1;
  attrs[A.SPACING_BEFORE] = 0;
  attrs[A.SPACING_AFTER] = 0;
  attrs[A.LINE_SPACING] = 1;
  para.setAttributes(attrs);
}

function buildDocument_(docName, plan) {
  var doc = DocumentApp.create(docName);
  var body = doc.getBody();
  body.setPageWidth(LAYOUT.PAGE_WIDTH);
  body.setPageHeight(LAYOUT.PAGE_HEIGHT);
  body.setMarginTop(LAYOUT.MARGIN_TOP);
  body.setMarginBottom(LAYOUT.MARGIN_BOTTOM);
  body.setMarginLeft(LAYOUT.MARGIN_LEFT);
  body.setMarginRight(LAYOUT.MARGIN_RIGHT);
  fillContainer_(body, plan.header, true);
  var g = plan.geometry;
  var firstUsed = plan.header.length > 0;
  plan.pages.forEach(function (page, pi) {
    if (pi > 0) {
      var lastChild = body.getChild(body.getNumChildren() - 1);
      var breakPara = lastChild.getType() === DocumentApp.ElementType.PARAGRAPH ? lastChild.asParagraph() : body.appendParagraph('');
      breakPara.appendPageBreak();
      shrinkParagraph_(breakPara);
    }
    var table;
    if (page.type === 'wide') {
      table = body.appendTable([['']]);
      table.setBorderWidth(0);
      table.setColumnWidth(0, g.contentWidth);
      prepareCell_(table.getCell(0, 0), g.contentWidth);
      fillContainer_(table.getCell(0, 0), page.left, true);
    } else {
      table = body.appendTable([['', '']]);
      table.setBorderWidth(0);
      table.setColumnWidth(0, g.halfCellWidth);
      table.setColumnWidth(1, g.halfCellWidth);
      prepareCell_(table.getCell(0, 0), g.halfCellWidth);
      prepareCell_(table.getCell(0, 1), g.halfCellWidth);
      fillContainer_(table.getCell(0, 0), page.left, true);
      fillContainer_(table.getCell(0, 1), page.right, true);
    }
    if (pi === 0 && !firstUsed) {
      var firstChild = body.getChild(0);
      if (firstChild.getType() === DocumentApp.ElementType.PARAGRAPH && firstChild.asParagraph().getText() === '') {
        shrinkParagraph_(firstChild.asParagraph());
      }
    }
  });
  var tail = body.getChild(body.getNumChildren() - 1);
  if (tail.getType() === DocumentApp.ElementType.PARAGRAPH) {
    shrinkParagraph_(tail.asParagraph());
  }
  doc.saveAndClose();
  return doc.getId();
}
