const CATEGORIES_SHEET = 'categories';
const CATEGORIES_ID = 'ID';

function getCategories() {
  requirePermission_('categories.view');
  return readAll_(CATEGORIES_SHEET);
}

function createCategory(data) {
  requirePermission_('categories.create');
  if (!data || !data['Categories name']) throw new Error('Category name is required');
  const name = String(data['Categories name']).trim();
  if (!name) throw new Error('Category name cannot be empty');

  // Duplicate validation
  const existing = readAll_(CATEGORIES_SHEET) || [];
  const nameNorm = name.toLowerCase();
  if (existing.some(r => String(r['Categories name'] || '').trim().toLowerCase() === nameNorm)) {
    throw new Error(`Category "${name}" already exists.`);
  }

  if (!data['ID']) data['ID'] = genId_('CAT');
  data['Categories name'] = name;
  return createRow_(CATEGORIES_SHEET, data);
}

function updateCategory(id, data) {
  requirePermission_('categories.edit');
  if (data && data['Categories name']) {
    const name = String(data['Categories name']).trim();
    if (!name) throw new Error('Category name cannot be empty');

    // Duplicate validation against other rows
    const existing = readAll_(CATEGORIES_SHEET) || [];
    const nameNorm = name.toLowerCase();
    const duplicate = existing.some(r => String(r[CATEGORIES_ID] || r.ID) !== String(id) && String(r['Categories name'] || '').trim().toLowerCase() === nameNorm);
    if (duplicate) {
      throw new Error(`Category "${name}" already exists.`);
    }
    data['Categories name'] = name;
  }
  return updateRow_(CATEGORIES_SHEET, CATEGORIES_ID, id, data);
}

function deleteCategory(id) {
  requirePermission_('categories.delete');
  return deleteRow_(CATEGORIES_SHEET, CATEGORIES_ID, id);
}

function deleteCategoriesBulk(ids) {
  requirePermission_('categories.delete');
  if (!Array.isArray(ids) || ids.length === 0) return { success: true, count: 0 };
  let count = 0;
  ids.forEach(id => {
    try {
      deleteRow_(CATEGORIES_SHEET, CATEGORIES_ID, id);
      count++;
    } catch (e) {}
  });
  return { success: true, count: count };
}

function importCategories(list) {
  requirePermission_('categories.create');
  if (!Array.isArray(list) || list.length === 0) throw new Error('No categories provided for import');
  const existing = readAll_(CATEGORIES_SHEET) || [];
  const existingSet = new Set(existing.map(r => String(r['Categories name'] || '').trim().toLowerCase()));
  let imported = 0;
  let skipped = 0;
  list.forEach(item => {
    const rawName = (typeof item === 'string') ? item : (item['Categories name'] || item.name || '');
    const name = String(rawName || '').trim();
    if (!name) return;
    if (existingSet.has(name.toLowerCase())) {
      skipped++;
      return;
    }
    createRow_(CATEGORIES_SHEET, {
      ID: genId_('CAT'),
      'Categories name': name
    });
    existingSet.add(name.toLowerCase());
    imported++;
  });
  return { success: true, imported: imported, skipped: skipped };
}
