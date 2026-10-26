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

  if (data.menu && typeof data.menu === 'string' && data.menu.startsWith('{')) {
    try {
      const parsed = JSON.parse(data.menu);
      if (parsed.categories) syncMasterItemsAndCategories_(parsed.categories);
    } catch (e) {}
  }

  return createRow_(MENU_SHEET, data);
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

  return updateRow_(MENU_SHEET, MENU_ID, id, data);
}

function deleteMenu(id) {
  requirePermission_('menu.delete');
  return deleteRow_(MENU_SHEET, MENU_ID, id);
}
