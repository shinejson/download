const SETTINGS_SHEET = 'settings';

function getSettings() {
  return readAll_(SETTINGS_SHEET);
}

function saveSetting(key, value) {
  const sheet = getSheet_(SETTINGS_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sheet.appendRow([key, value]);
    return { key: key, value: value };
  }
  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const idx = data.findIndex(r => String(r[0]) === String(key));
  if (idx === -1) {
    sheet.appendRow([key, value]);
  } else {
    sheet.getRange(idx + 2, 2).setValue(value);
  }
  return { key: key, value: value };
}