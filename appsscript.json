/**
 * Main entry point for the web app.
 * Serves the HTML with routing based on ?page= query param.
 */
function doGet(e) {
  const page = (e && e.parameter && e.parameter.page) || 'dashboard';
  const template = HtmlService.createTemplateFromFile('client/index');
  template.page = page;
  template.sheetId = getActiveSpreadsheetId_();

  return template.evaluate()
    .setTitle('Conference Records')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Include HTML partial (used for templating: <?!= include('client/styles') ?>)
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Return active spreadsheet ID for client-side info
 */
function getActiveSpreadsheetId_() {
  try {
    return SpreadsheetApp.getActiveSpreadsheet().getId();
  } catch (err) {
    return '';
  }
}

/**
 * Router endpoint (optional): returns page title for client-side
 */
function getPageTitle(page) {
  const titles = {
    dashboard: 'Dashboard',
    categories: 'Categories',
    items: 'Items',
    menu: 'Menu (Conferences)',
    users: 'Users',
    settings: 'Settings'
  };
  return titles[page] || 'Dashboard';
}

/**
 * Dashboard stats aggregator - counts per sheet
 */
function getDashboardStats() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ['categories', 'items', 'menu', 'users'];
  const stats = {};

  sheets.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) { stats[name] = 0; return; }
    const lastRow = sheet.getLastRow();
    stats[name] = lastRow > 1 ? lastRow - 1 : 0;
  });

  // Upcoming conferences (menu sheet)
  const menuSheet = ss.getSheetByName('menu');
  let upcoming = [];
  if (menuSheet && menuSheet.getLastRow() > 1) {
    const data = menuSheet.getRange(2, 1, menuSheet.getLastRow() - 1, 6).getValues();
    const now = new Date();
    upcoming = data
      .filter(r => r[2] instanceof Date && r[2] >= now)
      .sort((a, b) => a[2] - b[2])
      .slice(0, 5)
      .map(r => ({
        mid: r[0],
        conference: r[1],
        date: Utilities.formatDate(r[2], Session.getScriptTimeZone(), 'yyyy-MM-dd'),
        pax: r[3]
      }));
  }

  stats.upcoming = upcoming;
  return stats;
}