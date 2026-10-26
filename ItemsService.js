const CATEGORIES_SHEET = 'categories';
const CATEGORIES_ID = 'ID';

function getCategories() {
  return readAll_(CATEGORIES_SHEET);
}

function createCategory(data) {
  if (!data || !data['Categories name']) throw new Error('Categories name is required');
  if (!data['ID']) data['ID'] = genId_('CAT');
  return createRow_(CATEGORIES_SHEET, data);
}

function updateCategory(id, data) {
  return updateRow_(CATEGORIES_SHEET, CATEGORIES_ID, id, data);
}

function deleteCategory(id) {
  return deleteRow_(CATEGORIES_SHEET, CATEGORIES_ID, id);
}