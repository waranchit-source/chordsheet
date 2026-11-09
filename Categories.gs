function categoryList_() {
  return readTable_(SHEETS.CATEGORIES).filter(function (c) {
    return c.CategoryId && String(c.Name).trim();
  }).map(function (c) {
    return { id: String(c.CategoryId), name: String(c.Name).trim() };
  }).sort(function (a, b) {
    return a.name.localeCompare(b.name, 'th');
  });
}

function categoryIdSet_() {
  var set = {};
  categoryList_().forEach(function (c) { set[c.id] = true; });
  return set;
}

function parseCategoryIds_(value) {
  var raw = String(value || '').trim();
  if (!raw) {
    return [];
  }
  try {
    var list = JSON.parse(raw);
    return Array.isArray(list) ? list.map(String) : [];
  } catch (e) {
    return [];
  }
}

function cleanCategoryIds_(ids, valid) {
  var seen = {};
  var out = [];
  (Array.isArray(ids) ? ids : []).forEach(function (id) {
    var key = String(id);
    if (valid[key] && !seen[key]) {
      seen[key] = true;
      out.push(key);
    }
  });
  return out;
}

function categoryIdsToCell_(ids) {
  return ids.length ? JSON.stringify(ids) : '';
}

function listCategories(token) {
  requireSession_(token);
  return categoryList_();
}

function saveCategory(token, data) {
  var session = requireSession_(token, 'categories.manage');
  var name = String((data && data.name) || '').replace(/\s+/g, ' ').trim();
  var id = String((data && data.id) || '');
  if (!name) {
    throw new Error('CATEGORY_NAME_REQUIRED');
  }
  if (name.length > 40) {
    throw new Error('CATEGORY_NAME_TOO_LONG');
  }
  return withLock_(function () {
    var rows = readTable_(SHEETS.CATEGORIES).filter(function (c) { return c.CategoryId; });
    var lower = name.toLowerCase();
    var clash = rows.filter(function (c) {
      return String(c.Name).trim().toLowerCase() === lower && String(c.CategoryId) !== id;
    });
    if (clash.length) {
      throw new Error('CATEGORY_EXISTS');
    }
    if (id) {
      var row = rows.filter(function (c) { return String(c.CategoryId) === id; })[0];
      if (!row) {
        throw new Error('CATEGORY_NOT_FOUND');
      }
      row.Name = name;
      updateRow_(SHEETS.CATEGORIES, row._row, row);
    } else {
      if (rows.length >= 100) {
        throw new Error('CATEGORY_LIMIT');
      }
      appendRow_(SHEETS.CATEGORIES, {
        CategoryId: newId_('C'),
        Name: name,
        CreatedBy: session.displayName,
        CreatedAt: new Date()
      });
    }
    return categoryList_();
  });
}

function deleteCategory(token, categoryId) {
  requireSession_(token, 'categories.manage');
  var id = String(categoryId || '');
  return withLock_(function () {
    var row = findBy_(SHEETS.CATEGORIES, 'CategoryId', id);
    if (!row) {
      throw new Error('CATEGORY_NOT_FOUND');
    }
    getSheet_(SHEETS.CATEGORIES).deleteRow(row._row);
    readTable_(SHEETS.SONGS).forEach(function (s) {
      var ids = parseCategoryIds_(s.Categories);
      if (ids.indexOf(id) >= 0) {
        s.Categories = categoryIdsToCell_(ids.filter(function (x) { return x !== id; }));
        updateRow_(SHEETS.SONGS, s._row, s);
      }
    });
    return categoryList_();
  });
}
