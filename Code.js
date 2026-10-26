/**
 * Main entry point for the web app.
 * Serves the HTML with routing based on ?page= query param.
 */
function doGet(e) {
  const isLogout = e && e.parameter && e.parameter.logout === 'true';
  const username = PropertiesService.getUserProperties().getProperty('conference_records.username');

  if (isLogout) {
    clearSession_();
    const template = HtmlService.createTemplateFromFile('login');
    template.appUrl = getAppUrl();
    return template.evaluate()
      .setTitle('Conference Records Login')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  if (!username || isSessionExpired_()) {
    clearSession_();
    const template = HtmlService.createTemplateFromFile('login');
    template.appUrl = getAppUrl();
    return template.evaluate()
      .setTitle('Conference Records Login')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  PropertiesService.getUserProperties().setProperty('conference_records.lastActivity', String(Date.now()));

  const page = (e && e.parameter && e.parameter.page) || 'dashboard';
  const template = HtmlService.createTemplateFromFile('index');
  template.page = page;
  template.sheetId = getActiveSpreadsheetId_();

  return template.evaluate()
    .setTitle('Conference Records')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Include HTML partial (used for templating: <?!= include('client/styles') ?>)
 * Robust fallback resolution supporting with or without .html / .js extensions.
 */
function include(filename) {
  if (!filename) return '';
  const clean = String(filename).trim();
  const isJs = clean.endsWith('.js') || clean.endsWith('.js.html');
  let candidates = [];
  if (isJs) {
    const base = clean.replace(/\.js(\.html)?$/, '');
    candidates = [
      clean,
      base + '.js.html',
      base + '.js',
      base
    ];
  } else {
    const base = clean.replace(/\.html$/, '');
    candidates = [
      clean,
      base + '.html',
      base
    ];
  }
  for (let i = 0; i < candidates.length; i++) {
    try {
      let content = HtmlService.createHtmlOutputFromFile(candidates[i]).getContent();
      if (content !== undefined && content !== null && content !== '') {
        const trimmed = String(content).trim();
        if (isJs) {
          // If the script partial does not start with <script>, automatically wrap it
          // so it safely executes as JavaScript instead of rendering as text on the webpage!
          if (!trimmed.toLowerCase().startsWith('<script')) {
            return '<script>\n' + trimmed + '\n</script>';
          }
          return trimmed;
        }
        return content;
      }
    } catch (e) {}
  }
  return '';
}

function isAuthenticated() {
  return !!PropertiesService.getUserProperties().getProperty('conference_records.username');
}

function getAppUrl() {
  return ScriptApp.getService().getUrl();
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
 * Router endpoint: returns page title for client-side
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
 * Monthly conference trends for the last 6 months (line chart).
 */
function getMonthlyTrends() {
  requirePermission_('dashboard.view');

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('menu');
    if (!sheet || sheet.getLastRow() <= 1) {
      return { labels: [], data: [] };
    }

    const now = new Date();
    const labels = [];
    const data = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      labels.push(Utilities.formatDate(d, Session.getScriptTimeZone(), 'MMM yyyy'));
      data.push(0);
    }

    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
    rows.forEach(r => {
      const confDate = r[2];
      if (!(confDate instanceof Date)) return;
      for (let i = 0; i < 6; i++) {
        const start = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        const end = new Date(now.getFullYear(), now.getMonth() - (4 - i), 1);
        if (confDate >= start && confDate < end) {
          data[i]++;
          break;
        }
      }
    });

    return { labels: labels, data: data };
  } catch (err) {
    console.error('getMonthlyTrends error', err);
    return { labels: [], data: [], error: err.message };
  }
}

/**
 * Category breakdown for donut chart.
 */
function getCategoryBreakdown() {
  requirePermission_('dashboard.view');

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const catSheet = ss.getSheetByName('categories');
    const itemSheet = ss.getSheetByName('items');

    if (!catSheet || catSheet.getLastRow() <= 1) {
      return { labels: ['No Data'], data: [0] };
    }

    const catRows = catSheet.getRange(2, 1, catSheet.getLastRow() - 1, 1).getValues().flat();
    const labels = catRows.filter(c => c && String(c).trim());

    let data = [];
    if (itemSheet && itemSheet.getLastRow() > 1) {
      const lastCol = itemSheet.getLastColumn();
      const catCol = lastCol >= 2 ? 1 : 0; // column B if present, else A
      const itemRows = itemSheet.getRange(2, 1, itemSheet.getLastRow() - 1, lastCol).getValues();

      const counts = {};
      labels.forEach(l => { counts[l] = 0; });
      let others = 0;

      itemRows.forEach(r => {
        const cat = r[catCol];
        if (cat && counts.hasOwnProperty(cat)) {
          counts[cat]++;
        } else if (cat) {
          others++;
        }
      });

      data = labels.map(l => counts[l] || 0);
      if (others > 0) {
        labels.push('Other');
        data.push(others);
      }
    } else {
      data = labels.map(() => 0);
    }

    return { labels: labels, data: data };
  } catch (err) {
    console.error('getCategoryBreakdown error', err);
    return { labels: ['Error'], data: [0], error: err.message };
  }
}

/**
 * Items distribution by category for bar chart.
 */
function getItemsDistribution() {
  requirePermission_('dashboard.view');

  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('items');
    if (!sheet || sheet.getLastRow() <= 1) {
      return { labels: [], data: [] };
    }

    const lastCol = sheet.getLastColumn();
    const catCol = lastCol >= 2 ? 1 : 0;
    const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, lastCol).getValues();

    const counts = {};
    rows.forEach(r => {
      const cat = r[catCol] || 'Uncategorized';
      counts[cat] = (counts[cat] || 0) + 1;
    });

    const labels = Object.keys(counts);
    const data = labels.map(k => counts[k]);
    return { labels: labels, data: data };
  } catch (err) {
    console.error('getItemsDistribution error', err);
    return { labels: [], data: [], error: err.message };
  }
}

/**
 * Dashboard stats aggregator - counts per sheet
 */
function getDashboardStats() {
  const user = requirePermission_('dashboard.view');
  const canViewUsers = hasRolePermission_(user.role, 'users.view');

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = ['categories', 'items', 'menu'];
  if (canViewUsers) {
    sheets.push('users');
  }

  const stats = {};

  sheets.forEach(name => {
    const sheet = ss.getSheetByName(name);
    if (!sheet) { stats[name] = 0; return; }
    const lastRow = sheet.getLastRow();
    stats[name] = lastRow > 1 ? lastRow - 1 : 0;
  });

  if (!canViewUsers) {
    stats.users = null; // Signal to client that users stat is hidden
  }

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

/**
 * Get server-driven notifications for the user.
 */
function getNotifications() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const items = [];

    const sheetChecks = [
      { sheet: 'items', title: 'Inventory updated', message: 'items tracked in the system.', label: 'items' },
      { sheet: 'menu', title: 'Conference schedule refreshed', message: 'conference records are available.', label: 'conferences' },
      { sheet: 'users', title: 'User access updated', message: 'user accounts are active and ready.', label: 'accounts' },
      { sheet: 'categories', title: 'Category list refreshed', message: 'categories are available for reporting.', label: 'categories' }
    ];

    sheetChecks.forEach(entry => {
      const sheet = ss.getSheetByName(entry.sheet);
      const count = sheet ? Math.max(sheet.getLastRow() - 1, 0) : 0;
      if (count > 0) {
        items.push({
          id: entry.sheet,
          title: entry.title,
          message: `${count} ${entry.message}`,
          timeLabel: 'New update',
          unread: true
        });
      }
    });

    if (items.length === 0) {
      items.push({
        id: 'system-ready',
        title: 'System ready',
        message: 'No active records yet — add your first data entry to get started.',
        timeLabel: 'Just now',
        unread: false
      });
    }

    return items.slice(0, 5);
  } catch (err) {
    console.error('getNotifications error', err);
    return [{
      id: 'notification-error',
      title: 'System alert',
      message: 'Unable to load notifications right now.',
      timeLabel: 'Just now',
      unread: false
    }];
  }
}

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

function isSessionExpired_() {
  const username = PropertiesService.getUserProperties().getProperty('conference_records.username');
  if (!username) return true;

  const lastActivity = Number(PropertiesService.getUserProperties().getProperty('conference_records.lastActivity') || 0);
  if (!lastActivity) return false;

  return (Date.now() - lastActivity) > SESSION_TIMEOUT_MS;
}

function touchSession() {
  const username = PropertiesService.getUserProperties().getProperty('conference_records.username');
  if (!username) return { ok: false, expired: true };

  PropertiesService.getUserProperties().setProperty('conference_records.lastActivity', String(Date.now()));
  return { ok: true, username: username };
}

function clearSession_() {
  PropertiesService.getUserProperties().deleteProperty('conference_records.username');
  PropertiesService.getUserProperties().deleteProperty('conference_records.lastActivity');
}
