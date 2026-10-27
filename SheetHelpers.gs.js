/**
 * Shared helpers for all sheet CRUD services.
 */

const SHEET_HEADERS = {
  categories: ['ID', 'Categories name'],
  items: ['ID', 'Items Name'],
  menu: ['mid', 'conference name', 'date', 'pax', 'menu', 'remarks', 'status'],
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

function getHeaders_(sheet, name) {
  if (sheet && sheet.getLastRow() >= 1 && sheet.getLastColumn() >= 1) {
    const raw = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const cleaned = raw.map(h => String(h != null ? h : '').trim()).filter(Boolean);
    if (cleaned.length > 0) {
      // Auto-migrate menu sheet if 'status' column is missing in row 1
      if (name === 'menu' && !cleaned.some(h => normKey_(h) === 'status')) {
        const nextCol = cleaned.length + 1;
        sheet.getRange(1, nextCol).setValue('status')
          .setFontWeight('bold')
          .setBackground('#1f2937')
          .setFontColor('#ffffff');
        cleaned.push('status');
      }
      return cleaned;
    }
  }
  return SHEET_HEADERS[name] || [];
}

function normKey_(key) {
  return String(key || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function rowToObj_(headers, row) {
  const obj = {};
  headers.forEach((h, i) => {
    let v = row[i];
    if (v instanceof Date) v = Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
    obj[h] = v;
    const nk = normKey_(h);
    if (nk && obj[nk] === undefined) {
      obj[nk] = v;
    }
  });
  return obj;
}

function readAll_(name) {
  const sheet = getSheet_(name);
  const headers = getHeaders_(sheet, name);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2 || headers.length === 0) return [];
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  return values.map(row => rowToObj_(headers, row));
}

function findRowById_(name, idField, idValue) {
  const sheet = getSheet_(name);
  const headers = getHeaders_(sheet, name);
  const targetKey = normKey_(idField);
  const idCol = headers.findIndex(h => normKey_(h) === targetKey) + 1;
  if (idCol <= 0) return -1;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues().flat();
  const targetVal = String(idValue != null ? idValue : '').trim();
  const idx = ids.findIndex(v => String(v != null ? v : '').trim() === targetVal);
  return idx === -1 ? -1 : idx + 2; // +2 => sheet row number
}

function createRow_(name, data) {
  const sheet = getSheet_(name);
  const headers = getHeaders_(sheet, name);
  const row = headers.map(h => {
    if (data[h] !== undefined) return data[h];
    const nk = normKey_(h);
    if (nk && data[nk] !== undefined) return data[nk];
    return '';
  });
  sheet.appendRow(row);
  return rowToObj_(headers, row);
}

function updateRow_(name, idField, idValue, data) {
  const rowNum = findRowById_(name, idField, idValue);
  if (rowNum === -1) throw new Error('Record not found: ' + idValue);
  const sheet = getSheet_(name);
  const headers = getHeaders_(sheet, name);
  const current = sheet.getRange(rowNum, 1, 1, headers.length).getValues()[0];
  const updated = headers.map((h, i) => {
    if (data[h] !== undefined) return data[h];
    const nk = normKey_(h);
    if (nk && data[nk] !== undefined) return data[nk];
    return current[i];
  });
  sheet.getRange(rowNum, 1, 1, headers.length).setValues([updated]);
  return rowToObj_(headers, updated);
}

function deleteRow_(name, idField, idValue) {
  const rowNum = findRowById_(name, idField, idValue);
  if (rowNum === -1) throw new Error('Record not found: ' + idValue);
  getSheet_(name).deleteRow(rowNum);
  return { success: true, id: idValue };
}

function genId_(prefix) {
  return prefix + '-' + Utilities.getUuid().split('-')[0].toUpperCase();
}
