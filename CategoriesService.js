const CATEGORIES_SHEET = 'categories';
const CATEGORIES_ID = 'ID';

function getCategories() {
  requirePermission_('categories.view');
  return readAll_(CATEGORIES_SHEET);
}

function createCategory(data) {
  requirePermission_('categories.create');
  if (!data || !data['Categories name']) throw new Error('Categories name is required');
  if (!data['ID']) data['ID'] = genId_('CAT');
  return createRow_(CATEGORIES_SHEET, data);
}

function updateCategory(id, data) {
  requirePermission_('categories.edit');
  return updateRow_(CATEGORIES_SHEET, CATEGORIES_ID, id, data);
}

function deleteCategory(id) {
  requirePermission_('categories.delete');
  return deleteRow_(CATEGORIES_SHEET, CATEGORIES_ID, id);
}
