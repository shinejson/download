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

/**
 * Encodes password as self-contained "salt:hash" string stored directly in password column
 */
function encodePassword_(password) {
  const salt = generateSalt_();
  return `${salt}:${hashPassword_(password, salt)}`;
}

/**
 * Verifies plain password against stored value.
 * Supports:
 * 1. Self-contained "salt:hash"
 * 2. Self-contained "salt$hash"
 * 3. Plain text legacy passwords
 */
function verifyPassword_(plainPassword, storedValue) {
  if (!plainPassword || !storedValue) return false;
  const cleanPlain = String(plainPassword).trim();
  const cleanStored = String(storedValue).trim();

  // 1. Direct plaintext match
  if (cleanStored === cleanPlain) {
    return true;
  }

  // 2. Format: "salt:hash"
  if (cleanStored.includes(':')) {
    const idx = cleanStored.indexOf(':');
    const salt = cleanStored.substring(0, idx);
    const hash = cleanStored.substring(idx + 1);
    if (salt && hash && hashPassword_(cleanPlain, salt) === hash) {
      return true;
    }
  }

  // 3. Format: "salt$hash"
  if (cleanStored.includes('$')) {
    const idx = cleanStored.indexOf('$');
    const salt = cleanStored.substring(0, idx);
    const hash = cleanStored.substring(idx + 1);
    if (salt && hash && hashPassword_(cleanPlain, salt) === hash) {
      return true;
    }
  }

  return false;
}

function getUsers() {
  requirePermission_('users.view');

  // Don't return password or sensitive data to client
  return readAll_(USERS_SHEET).map(u => {
    const copy = Object.assign({}, u);
    delete copy.password;
    delete copy.passwordSalt;
    copy.role = normalizeRole_(copy.role);
    return copy;
  });
}

function createUser(data) {
  requirePermission_('users.create');

  if (!data || !data['username']) throw new Error('username is required');
  if (!data['password']) throw new Error('password is required');

  const username = normalizeUsername_(data['username']);
  if (!/^[a-z0-9._-]{3,50}$/i.test(username)) {
    throw new Error('username must be 3-50 characters and contain only letters, numbers, dots, underscores, or hyphens');
  }

  // Check if username already exists
  const existingRows = readAll_(USERS_SHEET) || [];
  if (existingRows.some(r => normalizeUsername_(r.username) === username)) {
    throw new Error('Username already exists. Please choose a different username.');
  }

  if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])(?=.{8,128}$)/.test(String(data['password']))) {
    throw new Error('password must include uppercase, lowercase, number, and symbol, and be 8-128 characters long');
  }

  const password = String(data['password']);
  data['username'] = username;
  data['password'] = encodePassword_(password);
  data['role'] = normalizeRole_(data['role'] || ROLES.STAFF);
  data['status'] = String(data['status'] || 'active').toLowerCase() === 'inactive' ? 'inactive' : 'active';
  if (!data['userid']) data['userid'] = genId_('USR');

  return createRow_(USERS_SHEET, data);
}

function updateUser(id, data) {
  requirePermission_('users.edit');

  if (!data) throw new Error('user data is required');

  const rows = readAll_(USERS_SHEET) || [];
  const targetUser = rows.find(r => String(r[USERS_ID] || r.userid) === String(id));
  if (!targetUser) throw new Error('User not found: ' + id);

  if (data['username']) {
    const username = normalizeUsername_(data['username']);
    if (!/^[a-z0-9._-]{3,50}$/i.test(username)) {
      throw new Error('username must be 3-50 characters and contain only letters, numbers, dots, underscores, or hyphens');
    }
    // Check if new username belongs to another user
    const duplicate = rows.find(r => normalizeUsername_(r.username) === username && String(r[USERS_ID] || r.userid) !== String(id));
    if (duplicate) throw new Error('Username is already taken by another account.');
    data['username'] = username;
  }

  // Protect against demoting or deactivating the last active administrator
  const isTargetActiveAdmin = normalizeRole_(targetUser.role) === ROLES.ADMIN &&
    String(targetUser.status || '').toLowerCase() === 'active';

  if (isTargetActiveAdmin) {
    const willBeDemoted = data['role'] !== undefined && normalizeRole_(data['role']) !== ROLES.ADMIN;
    const willBeInactive = data['status'] !== undefined && String(data['status']).toLowerCase() !== 'active';

    if (willBeDemoted || willBeInactive) {
      if (countActiveAdmins_() <= 1) {
        throw new Error('Cannot demote or deactivate the only active Administrator.');
      }
    }
  }

  if (data['role'] !== undefined) {
    data['role'] = normalizeRole_(data['role']);
  }

  if (data['password']) {
    const password = String(data['password']);
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])(?=.{8,128}$)/.test(password)) {
      throw new Error('password must include uppercase, lowercase, number, and symbol, and be 8-128 characters long');
    }
    data['password'] = encodePassword_(password);
  }

  if (data['status']) data['status'] = String(data['status']).toLowerCase() === 'inactive' ? 'inactive' : 'active';

  return updateRow_(USERS_SHEET, USERS_ID, id, data);
}

function deleteUser(id) {
  requirePermission_('users.delete');

  const rows = readAll_(USERS_SHEET) || [];
  const targetUser = rows.find(r => String(r[USERS_ID] || r.userid) === String(id));
  if (!targetUser) throw new Error('User not found: ' + id);

  const currentUser = getCurrentUser_();
  if (currentUser && String(currentUser[USERS_ID] || currentUser.userid) === String(id)) {
    throw new Error('You cannot delete your own logged-in account.');
  }

  const isTargetActiveAdmin = normalizeRole_(targetUser.role) === ROLES.ADMIN &&
    String(targetUser.status || '').toLowerCase() === 'active';

  if (isTargetActiveAdmin && countActiveAdmins_() <= 1) {
    throw new Error('Cannot delete the only active Administrator.');
  }

  return deleteRow_(USERS_SHEET, USERS_ID, id);
}

function deleteUsersBulk(ids) {
  requirePermission_('users.delete');
  if (!Array.isArray(ids) || ids.length === 0) return { success: true, count: 0 };
  let count = 0;
  ids.forEach(id => {
    try {
      deleteUser(id);
      count++;
    } catch (e) {}
  });
  return { success: true, count: count };
}

function ensureDefaultAdmin_() {
  const rows = readAll_(USERS_SHEET) || [];
  const existingAdmin = rows.find(r => normalizeUsername_(r.username) === 'admin');
  const encoded = encodePassword_('Admin!234567');

  if (existingAdmin) {
    let needsUpdate = false;
    const updates = {};
    if (normalizeRole_(existingAdmin.role) !== ROLES.ADMIN) {
      updates.role = ROLES.ADMIN;
      needsUpdate = true;
    }
    if (String(existingAdmin.status || '').toLowerCase() !== 'active') {
      updates.status = 'active';
      needsUpdate = true;
    }
    const currentPass = String(existingAdmin.password || '');
    // If password is not matching Admin!234567 and not properly formatted, heal it
    if (!verifyPassword_('Admin!234567', currentPass)) {
      updates.password = encoded;
      needsUpdate = true;
    }
    if (needsUpdate) {
      const id = existingAdmin.userid || existingAdmin[USERS_ID];
      updateRow_(USERS_SHEET, USERS_ID, id, updates);
    }
    return existingAdmin;
  }

  const defaultUser = {
    userid: genId_('USR'),
    username: 'admin',
    firstname: 'System',
    lastname: 'Administrator',
    contact: '',
    email: 'admin@localhost',
    password: encoded,
    role: ROLES.ADMIN,
    department: 'Administration',
    status: 'active'
  };
  createRow_(USERS_SHEET, defaultUser);
  return defaultUser;
}

/**
 * Public function to seed, create, or reset the main administrator account.
 * Guarantees username 'admin' has password 'Admin!234567', active status, and full admin permissions.
 */
function createOrResetAdminAccount() {
  const rows = readAll_(USERS_SHEET) || [];
  const existingAdmin = rows.find(r => normalizeUsername_(r.username) === 'admin');
  const encoded = encodePassword_('Admin!234567');

  if (existingAdmin) {
    const id = existingAdmin.userid || existingAdmin[USERS_ID];
    const updated = {
      username: 'admin',
      password: encoded,
      role: ROLES.ADMIN,
      status: 'active'
    };
    updateRow_(USERS_SHEET, USERS_ID, id, updated);
    return {
      ok: true,
      action: 'updated',
      username: 'admin',
      role: ROLES.ADMIN,
      message: 'Admin account has been reset with password Admin!234567 and full administrator access.'
    };
  }

  const newAdmin = {
    userid: genId_('USR'),
    username: 'admin',
    firstname: 'System',
    lastname: 'Administrator',
    contact: '',
    email: 'admin@localhost',
    password: encoded,
    role: ROLES.ADMIN,
    department: 'Administration',
    status: 'active'
  };
  createRow_(USERS_SHEET, newAdmin);
  return {
    ok: true,
    action: 'created',
    username: 'admin',
    role: ROLES.ADMIN,
    message: 'Admin account created successfully with password Admin!234567 and full administrator access.'
  };
}

function authenticateUser(username, password) {
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

  // Ensure default admin exists or heal if needed
  ensureDefaultAdmin_();

  let rows = readAll_(USERS_SHEET) || [];
  let user = rows.find(row => normalizeUsername_(row.username) === cleanUser);

  // If logging in as admin with default admin password, guarantee access and auto-repair
  if (cleanUser === 'admin' && cleanPassword === 'Admin!234567') {
    if (!user) {
      user = ensureDefaultAdmin_();
      rows = readAll_(USERS_SHEET) || [];
    } else {
      const isMatch = verifyPassword_(cleanPassword, user.password);
      if (!isMatch || normalizeRole_(user.role) !== ROLES.ADMIN || String(user.status || '').toLowerCase() !== 'active') {
        const id = user.userid || user[USERS_ID];
        const healed = {
          password: encodePassword_(cleanPassword),
          role: ROLES.ADMIN,
          status: 'active'
        };
        updateRow_(USERS_SHEET, USERS_ID, id, healed);
        user.password = healed.password;
        user.role = ROLES.ADMIN;
        user.status = 'active';
      }
    }
  }

  if (!user) {
    throw new Error('invalid username or password');
  }

  if (String(user.status || '').toLowerCase() !== 'active') {
    throw new Error('this account is inactive');
  }

  const isValid = verifyPassword_(cleanPassword, user.password);
  if (!isValid) {
    throw new Error('invalid username or password');
  }

  // If password was stored as plaintext, upgrade to salted hash format seamlessly
  if (String(user.password || '').trim() === cleanPassword) {
    const id = user.userid || user[USERS_ID];
    const upgraded = { password: encodePassword_(cleanPassword) };
    updateRow_(USERS_SHEET, USERS_ID, id, upgraded);
  }

  const normalizedRole = normalizeRole_(user.role);
  const sid = (typeof createSession_ === 'function') ? createSession_(cleanUser, normalizedRole) : '';

  try {
    PropertiesService.getUserProperties().setProperty('conference_records.username', cleanUser);
  } catch (e) {}

  return {
    ok: true,
    username: user.username,
    role: normalizedRole,
    permissions: getRolePermissions_(normalizedRole),
    sid: sid
  };
}

function logoutUser(opt_sid) {
  if (opt_sid && typeof invalidateSession_ === 'function') {
    invalidateSession_(opt_sid);
  }
  try {
    PropertiesService.getUserProperties().deleteProperty('conference_records.username');
    PropertiesService.getUserProperties().deleteProperty('conference_records.lastActivity');
  } catch (e) {}
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

  const currentUser = getCurrentUser_();
  // If not logged-in user changing their own password, require users.edit permission
  if (!currentUser || normalizeUsername_(currentUser.username) !== cleanUser) {
    requirePermission_('users.edit');
  }

  const rows = readAll_(USERS_SHEET) || [];
  const user = rows.find(row => normalizeUsername_(row.username) === cleanUser);
  if (!user) throw new Error('user not found');

  const currentMatches = verifyPassword_(current, user.password);
  if (!currentMatches) throw new Error('current password is incorrect');

  const id = user.userid || user[USERS_ID];
  const updated = {
    password: encodePassword_(next)
  };

  return updateRow_(USERS_SHEET, USERS_ID, id, updated);
}

function getCurrentUserProfile(opt_sid) {
  let username = '';
  if (opt_sid && typeof getValidSession_ === 'function') {
    const sess = getValidSession_(opt_sid);
    if (sess && sess.username) username = sess.username;
  }
  if (!username) {
    try {
      username = PropertiesService.getUserProperties().getProperty('conference_records.username');
    } catch (e) {}
  }
  if (!username) {
    return {
      username: '',
      fullName: '',
      role: ROLES.VIEWER,
      permissions: []
    };
  }

  const rows = readAll_(USERS_SHEET) || [];
  const user = rows.find(row => normalizeUsername_(row.username) === normalizeUsername_(username));
  if (!user) {
    return {
      username: String(username),
      fullName: String(username),
      role: ROLES.VIEWER,
      permissions: []
    };
  }

  const fullName = [user.firstname, user.lastname].filter(Boolean).join(' ').trim();
  const role = normalizeRole_(user.role);

  return {
    username: String(user.username || username),
    fullName: fullName || String(user.username || username),
    role: role,
    permissions: getRolePermissions_(role),
    email: user.email || '',
    contact: user.contact || '',
    department: user.department || '',
    status: user.status || 'active'
  };
}
