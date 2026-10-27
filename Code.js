/**
 * Main entry point for the web app.
 * Serves the HTML with routing based on ?page= query param and isolated ?sid= session token.
 */
function doGet(e) {
  const isLogout = e && e.parameter && e.parameter.logout === 'true';
  const sid = e && e.parameter && e.parameter.sid;
  const appUrl = getAppUrl();
  const brand = typeof getPublicBrandSettings === 'function' ? getPublicBrandSettings() : { company_name: 'Conference Records' };

  if (isLogout) {
    if (sid) invalidateSession_(sid);
    clearLegacySession_();
    const template = HtmlService.createTemplateFromFile('login');
    template.appUrl = appUrl;
    template.brand = brand;
    return template.evaluate()
      .setTitle(brand.company_name ? brand.company_name + ' Login' : 'Conference Records Login')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  const session = getValidSession_(sid);

  if (!session) {
    const template = HtmlService.createTemplateFromFile('login');
    template.appUrl = appUrl;
    template.brand = brand;
    return template.evaluate()
      .setTitle(brand.company_name ? brand.company_name + ' Login' : 'Conference Records Login')
      .addMetaTag('viewport', 'width=device-width, initial-scale=1')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }

  // Update activity timestamp for this specific browser session
  touchSession_(sid);

  const page = (e && e.parameter && e.parameter.page) || 'dashboard';
  const template = HtmlService.createTemplateFromFile('index');
  template.page = page;
  template.sheetId = getActiveSpreadsheetId_();
  template.appUrl = appUrl;
  template.sid = sid;
  template.currentUser = session.username;
  template.currentRole = session.role;
  template.brand = brand;

  return template.evaluate()
    .setTitle(brand.company_name || 'Conference Records')
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
      base + 's.js.html',
      base + 's.js'
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
          if (trimmed.toLowerCase().startsWith('<script')) {
            return trimmed;
          }
          // If the file content starts with HTML markup (e.g., <div, <!--, <p, etc.) but NOT <script,
          // then this candidate is an HTML view/partial, NOT a script. Do NOT wrap it in <script> tags!
          if (trimmed.startsWith('<')) {
            continue;
          }
          return '<script>\n' + trimmed + '\n</script>';
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

/**
 * Global search across items, categories, and menu (conferences).
 * Returns normalized results matching the query (case-insensitive, any cell).
 * Callable from client via google.script.run.searchRecords(query).
 */
function searchRecords(query) {
  try {
    if (!query || !String(query).trim()) return [];
    const q = String(query).trim().toLowerCase();
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const results = [];

    const sheets = [
      { name: 'items', type: 'item', nameField: 'Items Name', idField: 'ID', label: 'Item' },
      { name: 'categories', type: 'category', nameField: 'Categories name', idField: 'ID', label: 'Category' },
      { name: 'menu', type: 'conference', nameField: 'conference name', idField: 'mid', label: 'Conference' }
    ];

    sheets.forEach(function (sheet) {
      try {
        const rows = readAll_(sheet.name);
        rows.forEach(function (row) {
          let matched = false;
          const matchFields = [];
          Object.keys(row).forEach(function (key) {
            const val = row[key];
            if (val == null) return;
            const s = String(val);
            if (s.toLowerCase().indexOf(q) !== -1) {
              matched = true;
              matchFields.push(key + ': ' + s);
            }
          });
          if (matched) {
            results.push({
              type: sheet.type,
              id: row[sheet.idField] || row[normKey_(sheet.idField)] || '',
              name: row[sheet.nameField] || row[normKey_(sheet.nameField)] || '',
              label: sheet.label,
              details: matchFields.slice(0, 3).join(' | '),
              sheet: sheet.name
            });
          }
        });
      } catch (e) {
        console.error('searchRecords error for ' + sheet.name, e);
      }
    });

    // Sort: name-starts-with query first, then alphabetically
    results.sort(function (a, b) {
      const aStarts = a.name.toLowerCase().indexOf(q) === 0 ? 0 : 1;
      const bStarts = b.name.toLowerCase().indexOf(q) === 0 ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.name.localeCompare(b.name);
    });

    return results.slice(0, 50);
  } catch (err) {
    console.error('searchRecords error', err);
    return [];
  }
}

// ==========================================
// MULTI-USER ISOLATED SESSION ENGINE
// ==========================================

const SESSION_CACHE_PREFIX = 'crsess_';
const SESSION_PROP_PREFIX = 'crsess_';

function getSessionTimeoutMs_() {
  try {
    if (typeof getPublicBrandSettings === 'function') {
      const b = getPublicBrandSettings();
      const mins = Number(b.session_timeout_mins);
      if (!isNaN(mins) && mins > 0) return mins * 60 * 1000;
    }
  } catch (e) {}
  return 30 * 60 * 1000;
}

function createSession_(username, role) {
  const sid = Utilities.getUuid().replace(/-/g, '');
  const data = {
    sid: sid,
    username: String(username).trim().toLowerCase(),
    role: String(role || 'viewer').trim().toLowerCase(),
    lastActivity: Date.now(),
    createdAt: Date.now()
  };
  const json = JSON.stringify(data);
  try {
    CacheService.getScriptCache().put(SESSION_CACHE_PREFIX + sid, json, 21600);
  } catch (e) {}
  try {
    PropertiesService.getScriptProperties().setProperty(SESSION_PROP_PREFIX + sid, json);
  } catch (e) {}
  // Legacy single-user support fallback
  try {
    PropertiesService.getUserProperties().setProperty('conference_records.username', data.username);
    PropertiesService.getUserProperties().setProperty('conference_records.lastActivity', String(Date.now()));
  } catch (e) {}
  return sid;
}

function getValidSession_(sid) {
  if (!sid) return null;
  const cleanSid = String(sid).trim();
  if (!cleanSid) return null;
  const timeoutMs = getSessionTimeoutMs_();

  let json = null;
  try {
    json = CacheService.getScriptCache().get(SESSION_CACHE_PREFIX + cleanSid);
  } catch (e) {}
  if (!json) {
    try {
      json = PropertiesService.getScriptProperties().getProperty(SESSION_PROP_PREFIX + cleanSid);
    } catch (e) {}
  }
  if (!json) return null;

  let session = null;
  try {
    session = JSON.parse(json);
  } catch (e) {
    return null;
  }

  if (!session || !session.username) return null;

  // Individual user last-activity timeout validation!
  const lastActivity = Number(session.lastActivity || session.createdAt || 0);
  if ((Date.now() - lastActivity) > timeoutMs) {
    invalidateSession_(cleanSid);
    return null;
  }

  return session;
}

function touchSession_(sid) {
  if (!sid) return null;
  const cleanSid = String(sid).trim();
  const session = getValidSession_(cleanSid);
  if (!session) return null;
  session.lastActivity = Date.now();
  const json = JSON.stringify(session);
  try {
    CacheService.getScriptCache().put(SESSION_CACHE_PREFIX + cleanSid, json, 21600);
  } catch (e) {}
  try {
    PropertiesService.getScriptProperties().setProperty(SESSION_PROP_PREFIX + cleanSid, json);
  } catch (e) {}
  return session;
}

function invalidateSession_(sid) {
  if (!sid) return;
  const cleanSid = String(sid).trim();
  try {
    CacheService.getScriptCache().remove(SESSION_CACHE_PREFIX + cleanSid);
  } catch (e) {}
  try {
    PropertiesService.getScriptProperties().deleteProperty(SESSION_PROP_PREFIX + cleanSid);
  } catch (e) {}
}

function clearLegacySession_() {
  try {
    PropertiesService.getUserProperties().deleteProperty('conference_records.username');
    PropertiesService.getUserProperties().deleteProperty('conference_records.lastActivity');
  } catch (e) {}
}

function validateSession(sid) {
  const session = getValidSession_(sid);
  if (!session) return { valid: false };
  touchSession_(sid);
  return {
    valid: true,
    username: session.username,
    role: session.role,
    timeoutMs: getSessionTimeoutMs_()
  };
}

function touchSession(sid) {
  if (sid) {
    const session = touchSession_(sid);
    if (session) {
      return { ok: true, username: session.username };
    }
    return { ok: false, expired: true };
  }
  const username = PropertiesService.getUserProperties().getProperty('conference_records.username');
  if (!username) return { ok: false, expired: true };
  PropertiesService.getUserProperties().setProperty('conference_records.lastActivity', String(Date.now()));
  return { ok: true, username: username };
}

function logoutUser(sid) {
  if (sid) {
    invalidateSession_(sid);
  }
  clearLegacySession_();
  return { ok: true };
}
