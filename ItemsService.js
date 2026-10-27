const ITEMS_SHEET = 'items';
const ITEMS_ID = 'ID';

function getItems() {
  requirePermission_('items.view');
  return readAll_(ITEMS_SHEET);
}

function createItem(data) {
  requirePermission_('items.create');
  if (!data || !data['Items Name']) throw new Error('Item name is required');
  const name = String(data['Items Name']).trim();
  if (!name) throw new Error('Item name cannot be empty');

  // Duplicate validation
  const existing = readAll_(ITEMS_SHEET) || [];
  const nameNorm = name.toLowerCase();
  if (existing.some(r => String(r['Items Name'] || '').trim().toLowerCase() === nameNorm)) {
    throw new Error(`Item "${name}" already exists.`);
  }

  if (!data['ID']) data['ID'] = genId_('ITM');
  data['Items Name'] = name;
  return createRow_(ITEMS_SHEET, data);
}

function updateItem(id, data) {
  requirePermission_('items.edit');
  if (data && data['Items Name']) {
    const name = String(data['Items Name']).trim();
    if (!name) throw new Error('Item name cannot be empty');

    // Duplicate validation against other rows
    const existing = readAll_(ITEMS_SHEET) || [];
    const nameNorm = name.toLowerCase();
    const duplicate = existing.some(r => String(r[ITEMS_ID] || r.ID) !== String(id) && String(r['Items Name'] || '').trim().toLowerCase() === nameNorm);
    if (duplicate) {
      throw new Error(`Item "${name}" already exists.`);
    }
    data['Items Name'] = name;
  }
  return updateRow_(ITEMS_SHEET, ITEMS_ID, id, data);
}

function deleteItem(id) {
  requirePermission_('items.delete');
  return deleteRow_(ITEMS_SHEET, ITEMS_ID, id);
}

function deleteItemsBulk(ids) {
  requirePermission_('items.delete');
  if (!Array.isArray(ids) || ids.length === 0) return { success: true, count: 0 };
  let count = 0;
  ids.forEach(id => {
    try {
      deleteRow_(ITEMS_SHEET, ITEMS_ID, id);
      count++;
    } catch (e) {}
  });
  return { success: true, count: count };
}

function importItems(list) {
  requirePermission_('items.create');
  if (!Array.isArray(list) || list.length === 0) throw new Error('No items provided for import');
  const existing = readAll_(ITEMS_SHEET) || [];
  const existingSet = new Set(existing.map(r => String(r['Items Name'] || '').trim().toLowerCase()));
  let imported = 0;
  let skipped = 0;
  list.forEach(item => {
    const rawName = (typeof item === 'string') ? item : (item['Items Name'] || item.name || '');
    const name = String(rawName || '').trim();
    if (!name) return;
    if (existingSet.has(name.toLowerCase())) {
      skipped++;
      return;
    }
    createRow_(ITEMS_SHEET, {
      ID: genId_('ITM'),
      'Items Name': name
    });
    existingSet.add(name.toLowerCase());
    imported++;
  });
  return { success: true, imported: imported, skipped: skipped };
}
