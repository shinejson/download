/**
 * MealsService.js
 * Backend CRUD service for Prepared Meals.
 * Backed by the 'meals' sheet: ['ID', 'Meal Name']
 */

const MEALS_SHEET = 'meals';
const MEALS_ID = 'ID';

function getMeals() {
  requirePermission_('meals.view');
  return readAll_(MEALS_SHEET);
}

function createMeal(data) {
  requirePermission_('meals.create');
  if (!data || !data['Meal Name']) throw new Error('Meal name is required');
  const name = String(data['Meal Name']).trim();
  if (!name) throw new Error('Meal name cannot be empty');

  // Duplicate validation (case-insensitive)
  const existing = readAll_(MEALS_SHEET) || [];
  const nameNorm = name.toLowerCase();
  if (existing.some(r => String(r['Meal Name'] || r['meal name'] || r['Items Name'] || '').trim().toLowerCase() === nameNorm)) {
    throw new Error(`Meal "${name}" already exists.`);
  }

  if (!data['ID']) data['ID'] = genId_('MEL');
  data['Meal Name'] = name;
  return createRow_(MEALS_SHEET, data);
}

function updateMeal(id, data) {
  requirePermission_('meals.edit');
  if (data && data['Meal Name']) {
    const name = String(data['Meal Name']).trim();
    if (!name) throw new Error('Meal name cannot be empty');

    // Duplicate validation against other rows
    const existing = readAll_(MEALS_SHEET) || [];
    const nameNorm = name.toLowerCase();
    const duplicate = existing.some(r => String(r[MEALS_ID] || r.ID) !== String(id) && String(r['Meal Name'] || r['meal name'] || r['Items Name'] || '').trim().toLowerCase() === nameNorm);
    if (duplicate) {
      throw new Error(`Meal "${name}" already exists.`);
    }
    data['Meal Name'] = name;
  }
  return updateRow_(MEALS_SHEET, MEALS_ID, id, data);
}

function deleteMeal(id) {
  requirePermission_('meals.delete');
  return deleteRow_(MEALS_SHEET, MEALS_ID, id);
}

function deleteMealsBulk(ids) {
  requirePermission_('meals.delete');
  if (!Array.isArray(ids) || ids.length === 0) return { success: true, count: 0 };
  let count = 0;
  ids.forEach(id => {
    try {
      deleteRow_(MEALS_SHEET, MEALS_ID, id);
      count++;
    } catch (e) {}
  });
  return { success: true, count: count };
}

function importMeals(list) {
  requirePermission_('meals.create');
  if (!Array.isArray(list) || list.length === 0) throw new Error('No meals provided for import');
  const existing = readAll_(MEALS_SHEET) || [];
  const existingSet = new Set(existing.map(r => String(r['Meal Name'] || r['meal name'] || r['Items Name'] || '').trim().toLowerCase()));
  let imported = 0;
  let skipped = 0;
  list.forEach(item => {
    const rawName = (typeof item === 'string') ? item : (item['Meal Name'] || item['meal name'] || item.name || item['Items Name'] || '');
    const name = String(rawName || '').trim();
    if (!name) return;
    if (existingSet.has(name.toLowerCase())) {
      skipped++;
      return;
    }
    createRow_(MEALS_SHEET, {
      ID: genId_('MEL'),
      'Meal Name': name
    });
    existingSet.add(name.toLowerCase());
    imported++;
  });
  return { success: true, imported: imported, skipped: skipped };
}
