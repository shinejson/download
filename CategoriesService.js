/**
 * Shared helpers for all sheet CRUD services.
 */

const SHEET_HEADERS = {
  categories: ['ID', 'Categories name'],
  items: ['ID', 'Items Name'],
  menu: ['mid', 'conference name', 'date', 'pax', 'menu', 'remarks'],
  users: ['userid', 'firstname', 'lastname', 'contact', 'email', 'username', 'password', 'role', 'department', 'status'],
  settings: ['key', 'value']
};

function getSheet_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    const headers = SHEET_HEADERS[name] || [];
    if (headers.length) sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#1f2937')
      .setFontColor('#ffffff');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readAll_(name) {
  const sheet = getSheet_(name);
  const headers = SHEET_HEADERS[name];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      let v = row[i];
      if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
      obj[h] = v;
    });
    return obj;
  });
}

function findRowById_(name, idField, idValue) {
  const sheet = getSheet_(name);
  const headers = SHEET_HEADERS[name];
  const idCol = headers.indexOf(idField) + 1;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues().flat();
  const idx = ids.findIndex(v => String(v) === String(idValue));
  return idx === -1 ? -1 : idx + 2; // +2 => sheet row number
}

function createRow_(name, data) {
  const sheet = getSheet_(name);
  const headers = SHEET_HEADERS[name];
  const row = headers.map(h => data[h] !== undefined ? data[h] : '');
  sheet.appendRow(row);
  return rowToObj_(headers, row);
}

function updateRow_(name, idField, idValue, data) {
  const rowNum = findRowById_(name, idField, idValue);
  if (rowNum === -1) throw new Error('Record not found: ' + idValue);
  const sheet = getSheet_(name);
  const headers = SHEET_HEADERS[name];
  const current = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  const updated = headers.map((h, i) => data[h] !== undefined ? data[h] : current[i]);
  sheet.getRange(rowNum, 1, 1, headers.length).setValues([updated]);
  return rowToObj_(headers, updated);
}

function deleteRow_(name, idField, idValue) {
  const rowNum = findRowById_(name, idField, idValue);
  if (rowNum === -1) throw new Error('Record not found: ' + idValue);
  getSheet_(name).deleteRow(rowNum);
  return { success: true, id: idValue };
}

function rowToObj_(headers, row) {
  const obj = {};
  headers.forEach((h, i) => {
    let v = row[i];
    if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    obj[h] = v;
  });
  return obj;
}

function genId_(prefix) {
  return prefix + '-' + Utilities.getUuid().split('-')[0].toUpperCase();
}