const MENU_SHEET = 'menu';
const MENU_ID = 'mid';

function getMenuRecords() {
  requirePermission_('menu.view');
  return readAll_(MENU_SHEET);
}

function syncMasterItemsAndCategories_(categoriesData) {
  if (!Array.isArray(categoriesData)) return;
  try {
    const existingCats = readAll_('categories') || [];
    const catNames = new Set(existingCats.map(c => String(c['Categories name'] || '').trim().toLowerCase()));

    const existingItems = readAll_('items') || [];
    const itemNames = new Set(existingItems.map(i => String(i['Items Name'] || '').trim().toLowerCase()));

    categoriesData.forEach(cat => {
      const cName = String(cat.name || '').trim();
      if (cName && !catNames.has(cName.toLowerCase())) {
        createRow_('categories', {
          ID: genId_('CAT'),
          'Categories name': cName
        });
        catNames.add(cName.toLowerCase());
      }

      if (Array.isArray(cat.items)) {
        cat.items.forEach(it => {
          const iName = String(it.name || '').trim();
          if (iName && !itemNames.has(iName.toLowerCase())) {
            createRow_('items', {
              ID: genId_('ITM'),
              'Items Name': iName
            });
            itemNames.add(iName.toLowerCase());
          }
        });
      }
    });
  } catch (err) {
    console.error('Non-critical: syncMasterItemsAndCategories error:', err);
  }
}

function createMenu(data) {
  requirePermission_('menu.create');
  if (!data || !data['conference name']) throw new Error('Conference name is required');
  if (!data['mid']) data['mid'] = genId_('MEN');
  if (data['date']) data['date'] = new Date(data['date']);
  if (!data['status']) data['status'] = 'Pending';

  if (data.menu && typeof data.menu === 'string' && data.menu.startsWith('{')) {
    try {
      const parsed = JSON.parse(data.menu);
      if (parsed.categories) syncMasterItemsAndCategories_(parsed.categories);
    } catch (e) {}
  }

  const created = createRow_(MENU_SHEET, data);
  try { sendConferenceAlert_('create', created); } catch (e) {}
  return created;
}

function updateMenu(id, data) {
  requirePermission_('menu.edit');
  if (data['date']) data['date'] = new Date(data['date']);

  if (data.menu && typeof data.menu === 'string' && data.menu.startsWith('{')) {
    try {
      const parsed = JSON.parse(data.menu);
      if (parsed.categories) syncMasterItemsAndCategories_(parsed.categories);
    } catch (e) {}
  }

  const updated = updateRow_(MENU_SHEET, MENU_ID, id, data);
  try { sendConferenceAlert_('edit', updated); } catch (e) {}
  return updated;
}

function approveMenu(id) {
  requirePermission_('menu.edit');
  const updated = updateRow_(MENU_SHEET, MENU_ID, id, { status: 'Approved' });
  try { sendConferenceAlert_('approve', updated); } catch (e) {}
  return updated;
}

function updateMenuStatus(id, newStatus) {
  requirePermission_('menu.edit');
  const valid = ['Pending', 'Approved'];
  const cleanStatus = valid.includes(newStatus) ? newStatus : 'Pending';
  const updated = updateRow_(MENU_SHEET, MENU_ID, id, { status: cleanStatus });
  try { sendConferenceAlert_(cleanStatus.toLowerCase(), updated); } catch (e) {}
  return updated;
}

function deleteMenu(id) {
  requirePermission_('menu.delete');
  let existing = null;
  try {
    const all = readAll_(MENU_SHEET);
    existing = all.find(r => String(r.mid) === String(id));
  } catch (e) {}
  const res = deleteRow_(MENU_SHEET, MENU_ID, id);
  try { sendConferenceAlert_('delete', existing || { mid: id }); } catch (e) {}
  return res;
}
