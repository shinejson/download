const MENU_SHEET = 'menu';
const MENU_ID = 'mid';

function getMenuRecords() {
  requirePermission_('menu.view');
  return readAll_(MENU_SHEET);
}

function createMenu(data) {
  requirePermission_('menu.create');
  if (!data || !data['conference name']) throw new Error('Conference name is required');
  if (!data['mid']) data['mid'] = genId_('MEN');
  if (data['date']) data['date'] = new Date(data['date']);
  return createRow_(MENU_SHEET, data);
}

function updateMenu(id, data) {
  requirePermission_('menu.edit');
  if (data['date']) data['date'] = new Date(data['date']);
  return updateRow_(MENU_SHEET, MENU_ID, id, data);
}

function deleteMenu(id) {
  requirePermission_('menu.delete');
  return deleteRow_(MENU_SHEET, MENU_ID, id);
}
