const MENU_SHEET = 'menu';
const MENU_ID = 'mid';

function getMenuRecords() {
  return readAll_(MENU_SHEET);
}

function createMenu(data) {
  if (!data || !data['conference name']) throw new Error('Conference name is required');
  if (!data['mid']) data['mid'] = genId_('MEN');
  if (data['date']) data['date'] = new Date(data['date']);
  return createRow_(MENU_SHEET, data);
}

function updateMenu(id, data) {
  if (data['date']) data['date'] = new Date(data['date']);
  return updateRow_(MENU_SHEET, MENU_ID, id, data);
}

function deleteMenu(id) {
  return deleteRow_(MENU_SHEET, MENU_ID, id);
}