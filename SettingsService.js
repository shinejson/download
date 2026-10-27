const SETTINGS_SHEET = 'settings';

function getSettings() {
  requirePermission_('settings.view');
  return readAll_(SETTINGS_SHEET);
}

function getSettingsMap() {
  requirePermission_('settings.view');
  const rows = readAll_(SETTINGS_SHEET) || [];
  const map = {};
  rows.forEach(r => {
    const k = String(r.key || '').trim();
    if (k) map[k] = r.value !== undefined && r.value !== null ? String(r.value) : '';
  });
  return map;
}

function saveSetting(key, value) {
  requirePermission_('settings.edit');
  if (!key) throw new Error('Setting key cannot be empty.');
  const sheet = getSheet_(SETTINGS_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sheet.appendRow([String(key).trim(), value != null ? String(value) : '']);
    return { key: key, value: value };
  }
  const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
  const idx = data.findIndex(r => String(r[0]).trim() === String(key).trim());
  if (idx === -1) {
    sheet.appendRow([String(key).trim(), value != null ? String(value) : '']);
  } else {
    sheet.getRange(idx + 2, 2).setValue(value != null ? String(value) : '');
  }
  return { key: key, value: value };
}

function saveSettingsBatch(settingsMap) {
  requirePermission_('settings.edit');
  if (!settingsMap || typeof settingsMap !== 'object') {
    throw new Error('Invalid settings payload.');
  }

  const sheet = getSheet_(SETTINGS_SHEET);
  const lastRow = sheet.getLastRow();
  const existingKeys = new Map();

  if (lastRow >= 2) {
    const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
    data.forEach((r, i) => {
      const k = String(r[0] || '').trim();
      if (k) existingKeys.set(k, i + 2); // row index in sheet (1-based)
    });
  }

  const newRows = [];
  Object.keys(settingsMap).forEach(key => {
    const cleanKey = String(key).trim();
    if (!cleanKey) return;
    const val = settingsMap[key] != null ? String(settingsMap[key]) : '';

    if (existingKeys.has(cleanKey)) {
      const rowNum = existingKeys.get(cleanKey);
      sheet.getRange(rowNum, 2).setValue(val);
    } else {
      newRows.push([cleanKey, val]);
    }
  });

  if (newRows.length > 0) {
    sheet.getRange(sheet.getLastRow() + 1, 1, newRows.length, 2).setValues(newRows);
  }

  return { success: true, count: Object.keys(settingsMap).length };
}

function deleteSetting(key) {
  requirePermission_('settings.edit');
  if (!key) throw new Error('Key cannot be empty.');
  const sheet = getSheet_(SETTINGS_SHEET);
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true };
  const data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  const idx = data.findIndex(r => String(r[0]).trim() === String(key).trim());
  if (idx !== -1) {
    sheet.deleteRow(idx + 2);
  }
  return { success: true, key: key };
}

function sendTestEmail(targetEmail) {
  requirePermission_('settings.edit');
  const recipient = String(targetEmail || '').trim();
  if (!recipient || !recipient.includes('@') || !recipient.includes('.')) {
    throw new Error('Please enter a valid recipient email address.');
  }

  const settings = getSettingsMap();
  const companyName = settings['company_name'] || 'Conference Records System';
  const senderName = settings['email_sender_name'] || companyName;

  const subject = `[Test Email] Configuration verified for ${companyName}`;
  const htmlBody = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 10px; background: #ffffff;">
      <div style="border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 18px;">
        <h2 style="color: #1e3a8a; margin: 0; font-size: 20px;">Email System Test Successful</h2>
        <span style="color: #64748b; font-size: 13px;">Sent from ${senderName}</span>
      </div>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">
        Hello,
      </p>
      <p style="color: #334155; font-size: 14px; line-height: 1.6;">
        This is a verification test confirming that your email notification configuration in <strong>${companyName}</strong> is operational and ready to send event alerts.
      </p>
      <div style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 20px 0; border-radius: 0 6px 6px 0;">
        <p style="margin: 0; font-size: 13px; color: #475569;"><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
        <p style="margin: 4px 0 0 0; font-size: 13px; color: #475569;"><strong>Status:</strong> Active &amp; Ready</p>
      </div>
      <p style="color: #64748b; font-size: 12px; margin-top: 24px; border-top: 1px solid #e2e8f0; padding-top: 12px;">
        ${settings['email_signature'] || 'Conference Management System &bull; Powered by Google Apps Script'}
      </p>
    </div>
  `;

  MailApp.sendEmail({
    to: recipient,
    subject: subject,
    name: senderName,
    htmlBody: htmlBody
  });

  return { success: true, recipient: recipient };
}

function sendConferenceAlert_(action, conferenceRecord) {
  try {
    const settings = getSettingsMap();
    if (settings['email_notifications_enabled'] !== 'true') return;

    if (action === 'create' && settings['email_notify_on_create'] !== 'true') return;
    if (action === 'edit' && settings['email_notify_on_edit'] !== 'true') return;
    if (action === 'delete' && settings['email_notify_on_delete'] !== 'true') return;

    const recipients = String(settings['email_recipients'] || '')
      .split(',')
      .map(e => e.trim())
      .filter(e => e.includes('@'));

    if (recipients.length === 0) return;

    const companyName = settings['company_name'] || 'Conference Records';
    const senderName = settings['email_sender_name'] || companyName;
    const prefix = settings['email_subject_prefix'] || `[${companyName}]`;

    const confName = conferenceRecord ? (conferenceRecord['conference name'] || 'Event') : 'Event';
    const confDate = conferenceRecord && conferenceRecord.date ? String(conferenceRecord.date) : 'N/A';
    const confPax = conferenceRecord && conferenceRecord.pax ? String(conferenceRecord.pax) : 'N/A';
    const confMid = conferenceRecord && conferenceRecord.mid ? String(conferenceRecord.mid) : '';

    const actionLabels = {
      create: 'New Conference Scheduled',
      edit: 'Conference Menu Updated',
      delete: 'Conference Event Deleted'
    };
    const title = actionLabels[action] || 'Conference Event Alert';
    const subject = `${prefix} ${title}: ${confName}`;

    const htmlBody = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h3 style="color: #1e40af; margin-top: 0;">${title}</h3>
        <p style="color: #374151; font-size: 14px;">An event has been <strong>${action.toUpperCase()}D</strong> in the Catering Production System.</p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 13.5px;">
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: bold; color: #4b5563; width: 140px;">Event Name:</td>
            <td style="padding: 8px 0; color: #111827;">${confName}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">MID:</td>
            <td style="padding: 8px 0; color: #111827;">${confMid}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Date:</td>
            <td style="padding: 8px 0; color: #111827;">${confDate}</td>
          </tr>
          <tr style="border-bottom: 1px solid #e5e7eb;">
            <td style="padding: 8px 0; font-weight: bold; color: #4b5563;">Pax:</td>
            <td style="padding: 8px 0; color: #111827;">${confPax} PAX</td>
          </tr>
        </table>
        <p style="font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; padding-top: 10px; margin-top: 20px;">
          ${settings['email_signature'] || 'Catering Management System'}
        </p>
      </div>
    `;

    MailApp.sendEmail({
      to: recipients.join(','),
      subject: subject,
      name: senderName,
      htmlBody: htmlBody
    });
  } catch (err) {
    console.error('Non-critical: sendConferenceAlert_ error:', err);
  }
}
