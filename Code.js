/**
 * Main entry point for the web app.
 * Serves the single-page application with dynamic client-side multi-user session management.
 * Eliminates cross-origin redirect failures and Google Drive authentication conflicts.
 */
function doGet(e) {
  const brand = typeof getPublicBrandSettings === 'function' ? getPublicBrandSettings() : { company_name: 'Conference Records' };
  const appUrl = getAppUrl();
  const page = (e && e.parameter && e.parameter.page) || 'dashboard';

  const template = HtmlService.createTemplateFromFile('index');
  template.page = page;
  template.sheetId = getActiveSpreadsheetId_();
  template.appUrl = appUrl;
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
  const payload = getDashboardPayload();
  return payload.trends;
}

/**
 * Category breakdown for donut chart.
 */
function getCategoryBreakdown() {
  const payload = getDashboardPayload();
  return payload.categoryBreakdown;
}

/**
 * Items distribution by category for bar chart.
 */
function getItemsDistribution() {
  const payload = getDashboardPayload();
  return payload.itemsDistribution;
}

/**
 * Single bundled endpoint for Dashboard data:
 * Fetches stats, monthly trends, category breakdown, items distribution, and upcoming events in ONE round-trip.
 * Drastically improves dashboard initial load time from ~6s to <1s.
 */
function getDashboardPayload(opt_sid) {
  requirePermission_('dashboard.view', opt_sid);
  const user = getCurrentUser_(opt_sid);
  const canViewUsers = user ? hasRolePermission_(user.role, 'users.view') : false;

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  function getSheetByNameLoose(name) {
    if (!ss) return null;
    const direct = ss.getSheetByName(name);
    if (direct) return direct;
    const target = String(name || '').trim().toLowerCase();
    const sheets = ss.getSheets();
    for (let i = 0; i < sheets.length; i++) {
      if (sheets[i].getName().trim().toLowerCase() === target) {
        return sheets[i];
      }
    }
    return null;
  }

  const catSheet = getSheetByNameLoose('categories');
  const itemSheet = getSheetByNameLoose('items');
  const menuSheet = getSheetByNameLoose('menu');
  const userSheet = canViewUsers ? getSheetByNameLoose('users') : null;

  const catCount = catSheet && catSheet.getLastRow() > 1 ? catSheet.getLastRow() - 1 : 0;
  const itemCount = itemSheet && itemSheet.getLastRow() > 1 ? itemSheet.getLastRow() - 1 : 0;
  const menuCount = menuSheet && menuSheet.getLastRow() > 1 ? menuSheet.getLastRow() - 1 : 0;
  const userCount = userSheet && userSheet.getLastRow() > 1 ? userSheet.getLastRow() - 1 : (canViewUsers ? 0 : null);

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let upcoming = [];
  const trendLabels = [];
  const trendData = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    trendLabels.push(Utilities.formatDate(d, Session.getScriptTimeZone(), 'MMM yyyy'));
    trendData.push(0);
  }

  if (menuSheet && menuSheet.getLastRow() > 1) {
    const lastCol = Math.max(menuSheet.getLastColumn(), 6);
    const menuRows = menuSheet.getRange(2, 1, menuSheet.getLastRow() - 1, lastCol).getValues();
    const headerRow = menuSheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim().toLowerCase());
    let dateCol = headerRow.findIndex(h => h.includes('date'));
    if (dateCol === -1) dateCol = 2;
    let nameCol = headerRow.findIndex(h => h.includes('conference') || h.includes('name'));
    if (nameCol === -1) nameCol = 1;
    let paxCol = headerRow.findIndex(h => h.includes('pax'));
    if (paxCol === -1) paxCol = 3;
    let midCol = headerRow.findIndex(h => h.includes('mid') || h.includes('id'));
    if (midCol === -1) midCol = 0;

    const upcomingCandidates = [];

    menuRows.forEach(r => {
      let confDate = r[dateCol];
      let dObj = null;
      if (confDate instanceof Date && !isNaN(confDate.getTime())) {
        dObj = new Date(confDate.getFullYear(), confDate.getMonth(), confDate.getDate());
      } else if (confDate) {
        const s = String(confDate).trim();
        const mIso = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
        if (mIso) {
          dObj = new Date(parseInt(mIso[1], 10), parseInt(mIso[2], 10) - 1, parseInt(mIso[3], 10));
        } else {
          const mDm = s.match(/^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/);
          if (mDm) {
            dObj = new Date(parseInt(mDm[3], 10), parseInt(mDm[2], 10) - 1, parseInt(mDm[1], 10));
          } else {
            const fb = new Date(s);
            if (!isNaN(fb.getTime())) dObj = new Date(fb.getFullYear(), fb.getMonth(), fb.getDate());
          }
        }
      }

      if (dObj) {
        if (dObj.getTime() >= today.getTime()) {
          upcomingCandidates.push({
            mid: r[midCol] || '',
            conference: r[nameCol] || 'Untitled Event',
            date: Utilities.formatDate(dObj, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
            dateObj: dObj,
            pax: r[paxCol] || 0
          });
        }

        for (let i = 0; i < 6; i++) {
          const start = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
          const end = new Date(now.getFullYear(), now.getMonth() - (4 - i), 1);
          if (dObj >= start && dObj < end) {
            trendData[i]++;
            break;
          }
        }
      }
    });

    upcoming = upcomingCandidates
      .sort((a, b) => a.dateObj.getTime() - b.dateObj.getTime())
      .slice(0, 5)
      .map(item => ({
        mid: item.mid,
        conference: item.conference,
        date: item.date,
        pax: item.pax
      }));
  }

  let catLabels = [];
  let catData = [];
  let itemDistLabels = [];
  let itemDistData = [];

  if (catSheet && catSheet.getLastRow() > 1) {
    const rawCats = catSheet.getRange(2, 1, catSheet.getLastRow() - 1, catSheet.getLastColumn()).getValues();
    const catHeader = catSheet.getRange(1, 1, 1, catSheet.getLastColumn()).getValues()[0].map(h => String(h || '').trim().toLowerCase());
    let nameIdx = catHeader.findIndex(h => h.includes('name'));
    if (nameIdx === -1) nameIdx = catHeader.length > 1 ? 1 : 0;
    catLabels = rawCats.map(r => String(r[nameIdx] || '').trim()).filter(Boolean);
  }

  if (itemSheet && itemSheet.getLastRow() > 1) {
    const lastCol = itemSheet.getLastColumn();
    const rawItems = itemSheet.getRange(2, 1, itemSheet.getLastRow() - 1, lastCol).getValues();
    const itemHeader = itemSheet.getRange(1, 1, 1, lastCol).getValues()[0].map(h => String(h || '').trim().toLowerCase());
    let catCol = itemHeader.findIndex(h => h.includes('cat'));
    if (catCol === -1) catCol = lastCol > 1 ? 1 : 0;

    const counts = {};
    catLabels.forEach(l => { counts[l] = 0; });
    let otherCount = 0;

    rawItems.forEach(r => {
      const cVal = String(r[catCol] || '').trim();
      if (cVal && counts.hasOwnProperty(cVal)) {
        counts[cVal]++;
      } else if (cVal) {
        otherCount++;
        counts[cVal] = (counts[cVal] || 0) + 1;
      }
    });

    catData = catLabels.map(l => counts[l] || 0);
    if (otherCount > 0 && !catLabels.includes('Other')) {
      catLabels.push('Other');
      catData.push(otherCount);
    }

    itemDistLabels = Object.keys(counts);
    itemDistData = itemDistLabels.map(k => counts[k]);
  }

  return {
    stats: {
      categories: catCount,
      items: itemCount,
      menu: menuCount,
      users: userCount,
      upcoming: upcoming
    },
    trends: {
      labels: trendLabels,
      data: trendData
    },
    categoryBreakdown: {
      labels: catLabels.length ? catLabels : ['No Categories'],
      data: catData.length ? catData : [0]
    },
    itemsDistribution: {
      labels: itemDistLabels.length ? itemDistLabels : ['No Items'],
      data: itemDistData.length ? itemDistData : [0]
    }
  };
}

/**
 * Dashboard stats aggregator - counts per sheet
 */
function getDashboardStats() {
  const payload = getDashboardPayload();
  return payload.stats;
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
