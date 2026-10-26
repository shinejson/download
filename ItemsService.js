const ITEMS_SHEET = 'items';
const ITEMS_ID = 'ID';

function getItems() {
  requirePermission_('items.view');
  return readAll_(ITEMS_SHEET);
}

function createItem(data) {
  requirePermission_('items.create');
  if (!data || !data['Items Name']) throw new Error('Items Name is required');
  if (!data['ID']) data['ID'] = genId_('ITM');
  return createRow_(ITEMS_SHEET, data);
}

function updateItem(id, data) {
  requirePermission_('items.edit');
  return updateRow_(ITEMS_SHEET, ITEMS_ID, id, data);
}

function deleteItem(id) {
  requirePermission_('items.delete');
  return deleteRow_(ITEMS_SHEET, ITEMS_ID, id);
}
