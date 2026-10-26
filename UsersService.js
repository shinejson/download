const USERS_SHEET = 'users';
const USERS_ID = 'userid';

function normalizeUsername_(value) {
  return String(value || '').trim().toLowerCase();
}

function generateSalt_() {
  return Utilities.getUuid().replace(/-/g, '').slice(0, 16);
}

function hashPassword_(password, salt) {
  const raw = `${salt}:${String(password || '')}`;
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, raw);
  return Utilities.base64Encode(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function getUsers() {
  // Don't return password to client for security
  return readAll_(USERS_SHEET).map(u => {
    const copy = Object.assign({}, u);
    delete copy.password;
    delete copy.passwordSalt;
    return copy;
  });
}

function createUser(data) {
  if (!data || !data['username']) throw new Error('username is required');
  if (!data['password']) throw new Error('password is required');

  const username = normalizeUsername_(data['username']);
  if (!/^[a-z0-9._-]{3,50}$/i.test(username)) {
    throw new Error('username must be 3-50 characters and contain only letters, numbers, dots, underscores, or hyphens');
  }

  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])(?=.{8,128}$)/.test(String(data['password']))) {
    throw new Error('password must include uppercase, lowercase, number, and symbol, and be 8-128 characters long');
  }

  const password = String(data['password']);
  const salt = generateSalt_();
  data['username'] = username;
  data['password'] = hashPassword_(password, salt);
  data['passwordSalt'] = salt;
  data['status'] = String(data['status'] || 'active').toLowerCase();
  if (!data['userid']) data['userid'] = genId_('USR');

  return createRow_(USERS_SHEET, data);
}

function updateUser(id, data) {
  if (!data) throw new Error('user data is required');
  if (data['username']) {
    const username = normalizeUsername_(data['username']);
    if (!/^[a-z0-9._-]{3,50}$/i.test(username)) {
      throw new Error('username must be 3-50 characters and contain only letters, numbers, dots, underscores, or hyphens');
    }
    data['username'] = username;
  }

  if (data['password']) {
    const password = String(data['password']);
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])(?=.{8,128}$)/.test(password)) {
      throw new Error('password must include uppercase, lowercase, number, and symbol, and be 8-128 characters long');
    }
    const salt = generateSalt_();
    data['password'] = hashPassword_(password, salt);
    data['passwordSalt'] = salt;
  }

  if (data['status']) data['status'] = String(data['status']).toLowerCase();
  return updateRow_(USERS_SHEET, USERS_ID, id, data);
}

function deleteUser(id) {
  return deleteRow_(USERS_SHEET, USERS_ID, id);
}

function ensureDefaultAdmin_() {
  const rows = readAll_(USERS_SHEET) || [];
  if (rows.length > 0) return null;

  const defaultUser = {
    userid: genId_('USR'),
    username: 'admin',
    firstname: 'System',
    lastname: 'Administrator',
    role: 'admin',
    status: 'active',
    email: 'admin@localhost',
    department: 'Administration'
  };
  const salt = generateSalt_();
  defaultUser.password = hashPassword_('Admin!234567', salt);
  defaultUser.passwordSalt = salt;
  createRow_(USERS_SHEET, defaultUser);
  return defaultUser;
}

function authenticateUser(username, password) {
  ensureDefaultAdmin_();

  const cleanUser = normalizeUsername_(username);
  const cleanPassword = String(password || '').trim();

  if (!cleanUser || !cleanPassword) {
    throw new Error('username and password are required');
  }

  if (!/^[a-z0-9._-]{3,50}$/i.test(cleanUser)) {
    throw new Error('username is invalid');
  }

  if (cleanPassword.length < 8 || cleanPassword.length > 128) {
    throw new Error('password must be between 8 and 128 characters');
  }

  const rows = readAll_(USERS_SHEET);
  const user = rows.find(row => normalizeUsername_(row.username) === cleanUser);
  if (!user) {
    throw new Error('invalid username or password');
  }

  if (String(user.status || '').toLowerCase() !== 'active') {
    throw new Error('this account is inactive');
  }

  const storedHash = String(user.password || '');
  const storedSalt = String(user.passwordSalt || '');
  const expectedHash = storedSalt ? hashPassword_(cleanPassword, storedSalt) : '';

  const isValid = storedHash && (storedHash === expectedHash || storedHash === cleanPassword);
  if (!isValid) {
    throw new Error('invalid username or password');
  }

  if (!storedSalt && storedHash !== cleanPassword) {
    const salt = generateSalt_();
    const rowIndex = rows.findIndex(row => String(row[USERS_ID]) === String(user[USERS_ID]));
    if (rowIndex >= 0) {
      const targetRow = rows[rowIndex];
      targetRow.password = hashPassword_(cleanPassword, salt);
      targetRow.passwordSalt = salt;
      updateRow_(USERS_SHEET, USERS_ID, user[USERS_ID], targetRow);
    }
  }

  PropertiesService.getUserProperties().setProperty('conference_records.username', cleanUser);
  return {
    ok: true,
    username: user.username,
    role: user.role || 'admin'
  };
}

function logoutUser() {
  PropertiesService.getUserProperties().deleteProperty('conference_records.username');
  return { ok: true };
}

function changePassword(username, currentPassword, newPassword) {
  const cleanUser = normalizeUsername_(username);
  const current = String(currentPassword || '').trim();
  const next = String(newPassword || '').trim();

  if (!cleanUser) throw new Error('username is required');
  if (!current) throw new Error('current password is required');
  if (!next) throw new Error('new password is required');
  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])(?=.{8,128}$)/.test(next)) {
    throw new Error('password must include uppercase, lowercase, number, and symbol, and be 8-128 characters long');
  }

  const rows = readAll_(USERS_SHEET) || [];
  const user = rows.find(row => normalizeUsername_(row.username) === cleanUser);
  if (!user) throw new Error('user not found');

  const storedHash = String(user.password || '');
  const storedSalt = String(user.passwordSalt || '');
  const expectedHash = storedSalt ? hashPassword_(current, storedSalt) : '';
  const currentMatches = !!storedHash && (storedHash === expectedHash || storedHash === current);

  if (!currentMatches) throw new Error('current password is incorrect');

  const salt = generateSalt_();
  const updated = Object.assign({}, user, {
    password: hashPassword_(next, salt),
    passwordSalt: salt
  });

  return updateRow_(USERS_SHEET, USERS_ID, user[USERS_ID], updated);
}

function getCurrentUserProfile() {
  const username = PropertiesService.getUserProperties().getProperty('conference_records.username');
  if (!username) {
    return { username: '', fullName: '', role: 'admin' };
  }

  const rows = readAll_(USERS_SHEET) || [];
  const user = rows.find(row => normalizeUsername_(row.username) === normalizeUsername_(username));
  if (!user) {
    return { username: String(username), fullName: String(username), role: 'admin' };
  }

  const fullName = [user.firstname, user.lastname].filter(Boolean).join(' ').trim();
  return {
    username: String(user.username || username),
    fullName: fullName || String(user.username || username),
    role: String(user.role || 'admin')
  };
}