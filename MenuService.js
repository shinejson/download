const MENU_SHEET = 'menu';
const MENU_ID = 'mid';

function getMenuRecords() {
  requirePermission_('menu.view');
  return readAll_(MENU_SHEET);
}

function syncMasterItemsAndCategories_(categoriesData, ingredientsData) {
  try {
    // 1. Sync Categories and Prepared Meals
    if (Array.isArray(categoriesData)) {
      const existingCats = readAll_('categories') || [];
      const catNames = new Set(existingCats.map(c => String(c['Categories name'] || '').trim().toLowerCase()));

      const existingMeals = readAll_('meals') || [];
      const mealNames = new Set(existingMeals.map(m => String(m['Meal Name'] || m['meal name'] || m['Items Name'] || '').trim().toLowerCase()));

      categoriesData.forEach(cat => {
        const cName = String(cat.name || '').trim();
        if (cName && !catNames.has(cName.toLowerCase())) {
          createRow_('categories', {
            ID: genId_('CAT'),
            'Categories name': cName
          });
          catNames.add(cName.toLowerCase());
        }

        // Dish items under categories sync to meals
        if (Array.isArray(cat.items)) {
          cat.items.forEach(it => {
            const mName = String(it.name || '').trim();
            if (mName && !mealNames.has(mName.toLowerCase())) {
              createRow_('meals', {
                ID: genId_('MEL'),
                'Meal Name': mName
              });
              mealNames.add(mName.toLowerCase());
            }
          });
        }
      });
    }

    // 2. Sync raw ingredients to storehouse items
    if (Array.isArray(ingredientsData)) {
      const existingItems = readAll_('items') || [];
      const itemNames = new Set(existingItems.map(i => String(i['Items Name'] || '').trim().toLowerCase()));

      ingredientsData.forEach(ing => {
        const iName = String(ing.name || '').trim();
        if (iName && !itemNames.has(iName.toLowerCase())) {
          createRow_('items', {
            ID: genId_('ITM'),
            'Items Name': iName
          });
          itemNames.add(iName.toLowerCase());
        }
      });
    }
  } catch (err) {
    console.error('Non-critical: syncMasterItemsAndCategories error:', err);
  }
}

function createMenu(data) {
  requirePermission_('menu.create');
  if (!data || !data['conference name']) throw new Error('Conference name is required');
  if (!data['mid']) data['mid'] = genId_('MEN');
  if (data['date']) data['date'] = new Date(data['date']);
  if (!data['status']) data['status'] = 'Pending';

  if (data.menu && typeof data.menu === 'string' && data.menu.startsWith('{')) {
    try {
      const parsed = JSON.parse(data.menu);
      if (parsed.categories || parsed.ingredients) {
        syncMasterItemsAndCategories_(parsed.categories, parsed.ingredients);
      }
    } catch (e) {}
  }

  const created = createRow_(MENU_SHEET, data);
  try { sendConferenceAlert_('create', created); } catch (e) {}
  return created;
}

function updateMenu(id, data) {
  requirePermission_('menu.edit');
  if (data['date']) data['date'] = new Date(data['date']);

  if (data.menu && typeof data.menu === 'string' && data.menu.startsWith('{')) {
    try {
      const parsed = JSON.parse(data.menu);
      if (parsed.categories || parsed.ingredients) {
        syncMasterItemsAndCategories_(parsed.categories, parsed.ingredients);
      }
    } catch (e) {}
  }

  const updated = updateRow_(MENU_SHEET, MENU_ID, id, data);
  try { sendConferenceAlert_('edit', updated); } catch (e) {}
  return updated;
}

function approveMenu(id) {
  requirePermission_('menu.approve');
  const updated = updateRow_(MENU_SHEET, MENU_ID, id, { status: 'Approved' });
  try { sendConferenceAlert_('approve', updated); } catch (e) {}
  return updated;
}

function updateMenuStatus(id, newStatus) {
  const valid = ['Pending', 'Approved', 'Draft'];
  const cleanStatus = valid.includes(newStatus) ? newStatus : 'Pending';
  if (cleanStatus === 'Approved') {
    requirePermission_('menu.approve');
  } else {
    requirePermission_('menu.edit');
  }
  const updated = updateRow_(MENU_SHEET, MENU_ID, id, { status: cleanStatus });
  try { sendConferenceAlert_(cleanStatus.toLowerCase(), updated); } catch (e) {}
  return updated;
}

function deleteMenu(id) {
  requirePermission_('menu.delete');
  let existing = null;
  try {
    const all = readAll_(MENU_SHEET);
    existing = all.find(r => String(r.mid) === String(id));
  } catch (e) {}
  const res = deleteRow_(MENU_SHEET, MENU_ID, id);
  try { sendConferenceAlert_('delete', existing || { mid: id }); } catch (e) {}
  return res;
}

function escapeXml_(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseMenuDataServer_(rawMenu) {
  if (!rawMenu) return { categories: [], ingredients: [] };
  if (typeof rawMenu === 'object') {
    return {
      categories: Array.isArray(rawMenu.categories) ? rawMenu.categories : [],
      ingredients: Array.isArray(rawMenu.ingredients) ? rawMenu.ingredients : []
    };
  }
  const str = String(rawMenu).trim();
  if (str.startsWith('{') && str.endsWith('}')) {
    try {
      const parsed = JSON.parse(str);
      return {
        categories: Array.isArray(parsed.categories) ? parsed.categories : [],
        ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : []
      };
    } catch (e) {}
  }
  return {
    categories: [{ name: 'MENU ITEMS', items: str.split(',').map(s => ({ name: s.trim() })).filter(x => x.name) }],
    ingredients: []
  };
}

function generateProductionSheetPdf_(record) {
  if (!record) throw new Error('No conference record provided');
  const settings = (typeof getSettingsMap === 'function') ? getSettingsMap() : {};

  const companyName = settings['company_name'] || settings['app_display_name'] || 'Conference Records & Catering';
  const companyLogo = settings['company_logo'] || '';
  const companyAddress = settings['company_address'] || '';
  const companyPhone = settings['company_phone'] || '';
  const companyEmail = settings['system_email'] || '';

  const confName = String(record['conference name'] || 'EVENT').toUpperCase();
  const paxStr = record.pax ? `${record.pax}PAX` : '';
  const mid = record.mid || '';
  const rawStatus = String(record.status || 'Pending').trim();
  const isApproved = rawStatus.toLowerCase() === 'approved';

  // Format date and day of week
  let dayOfWeek = '';
  let displayDate = '';
  if (record.date) {
    try {
      const d = (record.date instanceof Date) ? record.date : new Date(record.date);
      if (!isNaN(d.getTime())) {
        const days = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
        dayOfWeek = days[d.getDay()];
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        displayDate = `${dd}/${mm}/${yyyy}`;
      } else {
        displayDate = String(record.date);
      }
    } catch (e) {
      displayDate = String(record.date);
    }
  }

  const titleStr = `${confName}${paxStr ? `(${paxStr})` : ''} – ${dayOfWeek ? `${dayOfWeek}-` : ''}${displayDate || ''}`;

  // Parse menu structure
  const parsed = parseMenuDataServer_(record.menu);

  // Standalone A4 single-sheet HTML layout
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Production Sheet - ${escapeXml_(confName)}</title>
  <style>
    @page {
      size: A4 portrait;
      margin: 8mm 10mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    body {
      font-family: Arial, Helvetica, sans-serif;
      margin: 0;
      padding: 0;
      color: #111827;
      background: #ffffff;
      font-size: 9.5pt;
      line-height: 1.25;
    }
    table.layout-table {
      width: 100%;
      border-collapse: collapse;
    }
    .brand-bar {
      border-bottom: 2px solid #111827;
      padding-bottom: 6px;
      margin-bottom: 8px;
    }
    .brand-logo {
      max-height: 38px;
      max-width: 110px;
    }
    .brand-title {
      font-size: 13pt;
      font-weight: bold;
      color: #111827;
      text-transform: uppercase;
      letter-spacing: -0.01em;
    }
    .brand-sub {
      font-size: 8pt;
      color: #555555;
    }
    .status-badge {
      display: inline-block;
      padding: 3px 8px;
      font-size: 8.5pt;
      font-weight: bold;
      border-radius: 4px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .status-approved {
      background-color: #dcfce7;
      color: #15803d;
      border: 1px solid #16a34a;
    }
    .status-pending {
      background-color: #fef3c7;
      color: #b45309;
      border: 1px solid #f59e0b;
    }
    .event-title {
      text-align: center;
      font-size: 12pt;
      font-weight: bold;
      text-decoration: underline;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 8px 0 10px 0;
    }
    .category-title {
      font-size: 10pt;
      font-weight: bold;
      text-transform: uppercase;
      text-decoration: underline;
      margin: 6px 0 2px 0;
      color: #111827;
    }
    .dish-line {
      font-size: 9.5pt;
      margin-bottom: 2px;
      color: #1f2937;
    }
    .sub-item {
      padding-left: 14px;
      font-size: 9pt;
      font-style: italic;
    }
    .ingredients-box {
      border: 1.5px solid #111827;
      padding: 6px 8px;
      border-radius: 4px;
      background: #fafafa;
    }
    .ingredients-header {
      text-align: center;
      font-size: 10pt;
      font-weight: bold;
      letter-spacing: 1px;
      border-bottom: 1.5px solid #111827;
      padding-bottom: 3px;
      margin-bottom: 6px;
    }
    .ingredient-row {
      font-size: 9.5pt;
      padding: 2px 0;
      border-bottom: 1px dotted #cccccc;
    }
    .remarks-box {
      margin-top: 10px;
      padding-top: 6px;
      border-top: 1px dashed #999999;
      font-size: 9pt;
      color: #374151;
    }
    .footer-bar {
      margin-top: 8px;
      padding-top: 4px;
      border-top: 1px solid #e5e7eb;
      font-size: 8pt;
      color: #6b7280;
    }
  </style>
</head>
<body>
  <!-- Brand Header -->
  <table class="layout-table brand-bar">
    <tr>
      <td style="vertical-align: middle;">
        ${companyLogo ? `<img src="${companyLogo}" class="brand-logo" alt="Logo"><br>` : ''}
        <span class="brand-title">${escapeXml_(companyName)}</span>
        ${companyAddress ? `<div class="brand-sub">${escapeXml_(companyAddress)}</div>` : ''}
      </td>
      <td style="text-align: right; vertical-align: middle;">
        <span class="status-badge ${isApproved ? 'status-approved' : 'status-pending'}">
          ${isApproved ? 'APPROVED' : 'PENDING APPROVAL'}
        </span>
        <div style="font-size: 8pt; color: #6b7280; margin-top: 4px;">
          MID: <strong>${escapeXml_(mid)}</strong> | Date: ${escapeXml_(new Date().toLocaleDateString('en-GB'))}
        </div>
      </td>
    </tr>
  </table>

  <!-- Event Header Title -->
  <div class="event-title">
    ${escapeXml_(titleStr)}
  </div>

  <!-- 2-Column Content: Left Categories & Dishes, Right Boxed Ingredients -->
  <table class="layout-table" style="vertical-align: top;">
    <tr>
      <td style="width: 58%; vertical-align: top; padding-right: 14px;">
        ${parsed.categories.map(cat => `
          <div style="margin-bottom: 6px;">
            <div class="category-title">${escapeXml_(cat.name)}</div>
            ${(cat.items || []).map(it => {
              const pcsPart = it.pcs ? ` (${escapeXml_(it.pcs)})` : '';
              const weightPart = it.weight ? ` &mdash; ${escapeXml_(it.weight)}${escapeXml_(it.unit || 'kg')}` : '';
              const notesPart = it.notes ? ` <span style="color:#4b5563;">(${escapeXml_(it.notes)})</span>` : '';
              const isSubVariant = !!it.notes && it.notes.toLowerCase().indexOf('fish') !== -1;
              return `
                <div class="dish-line">
                  <span>${escapeXml_(it.name)}</span>${pcsPart}${weightPart}${!isSubVariant ? notesPart : ''}
                </div>
                ${isSubVariant ? `
                  <div class="dish-line sub-item">
                    &bull; ${escapeXml_(it.notes)}${weightPart}
                  </div>
                ` : ''}
              `;
            }).join('')}
          </div>
        `).join('')}
      </td>

      <td style="width: 42%; vertical-align: top;">
        <div class="ingredients-box">
          <div class="ingredients-header">INGREDIENT USE</div>
          ${parsed.ingredients && parsed.ingredients.length > 0 ? `
            <table class="layout-table">
              ${parsed.ingredients.map(ing => `
                <tr class="ingredient-row">
                  <td style="padding: 2px 0;">${escapeXml_(ing.name)}</td>
                  <td style="text-align: right; font-weight: bold; padding: 2px 0;">${escapeXml_(ing.weight)}${escapeXml_(ing.unit || '')}</td>
                </tr>
              `).join('')}
            </table>
          ` : `
            <div style="font-size: 8.5pt; color: #6b7280; text-align: center; padding: 12px 0;">
              <em>No storehouse ingredients recorded</em>
            </div>
          `}
        </div>
      </td>
    </tr>
  </table>

  <!-- Remarks -->
  ${record.remarks ? `
    <div class="remarks-box">
      <strong>Remarks / Setup Instructions:</strong> ${escapeXml_(record.remarks)}
    </div>
  ` : ''}

  <!-- Footer -->
  <table class="layout-table footer-bar">
    <tr>
      <td>${companyPhone ? `Tel: ${escapeXml_(companyPhone)}` : ''} ${companyEmail ? `| Email: ${escapeXml_(companyEmail)}` : ''}</td>
      <td style="text-align: right;">Catering Production System</td>
    </tr>
  </table>
</body>
</html>`;

  const safeFileName = `Production_Sheet_${(confName || 'Event').replace(/[^a-zA-Z0-9_-]/g, '_')}_${mid || ''}`;
  const blob = Utilities.newBlob(html, 'text/html', safeFileName + '.html');
  const pdfBlob = blob.getAs('application/pdf').setName(safeFileName + '.pdf');
  return pdfBlob;
}

function downloadProductionSheetPdf(mid) {
  requirePermission_('menu.view');
  const all = readAll_(MENU_SHEET);
  const record = all.find(r => String(r.mid) === String(mid));
  if (!record) throw new Error('Conference record not found');
  const pdfBlob = generateProductionSheetPdf_(record);
  return {
    base64: Utilities.base64Encode(pdfBlob.getBytes()),
    filename: pdfBlob.getName()
  };
}
