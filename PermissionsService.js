/**
 * PermissionsService.js
 * Role-Based Access Control (RBAC) System
 *
 * Supported Roles:
 * - admin:   Full access to all modules, user administration, and system settings.
 * - manager: Manage categories, items, and menu conferences. No user administration or settings.
 * - staff:   View categories/items, create and edit menu conferences. No delete, user administration, or settings.
 * - viewer:  Read-only access across dashboard, categories, items, and conferences.
 */

const ROLES = {
  ADMIN: 'admin',
  MANAGER: 'manager',
  STAFF: 'staff',
  VIEWER: 'viewer'
};

const ROLE_PERMISSIONS = {
  admin: [
    'dashboard.view',
    'categories.view', 'categories.create', 'categories.edit', 'categories.delete',
    'meals.view', 'meals.create', 'meals.edit', 'meals.delete',
    'items.view', 'items.create', 'items.edit', 'items.delete',
    'menu.view', 'menu.create', 'menu.edit', 'menu.delete', 'menu.approve',
    'users.view', 'users.create', 'users.edit', 'users.delete',
    'settings.view', 'settings.edit'
  ],
  manager: [
    'dashboard.view',
    'categories.view', 'categories.create', 'categories.edit', 'categories.delete',
    'meals.view', 'meals.create', 'meals.edit', 'meals.delete',
    'items.view', 'items.create', 'items.edit', 'items.delete',
    'menu.view', 'menu.create', 'menu.edit', 'menu.delete'
  ],
  staff: [
    'dashboard.view',
    'categories.view',
    'meals.view',
    'items.view',
    'menu.view', 'menu.create', 'menu.edit'
  ],
  viewer: [
    'dashboard.view',
    'categories.view',
    'meals.view',
    'items.view',
    'menu.view'
  ]
};

/**
 * Returns available roles with display labels and descriptions
 */
function getAvailableRoles() {
  return [
    { value: 'admin', label: 'Admin (Full Access)', description: 'Full access to all modules, users & settings' },
    { value: 'manager', label: 'Manager (Manage Records)', description: 'Manage categories, items & conferences' },
    { value: 'staff', label: 'Staff (Coordinator)', description: 'Create and edit conferences; view categories & items' },
    { value: 'viewer', label: 'Viewer (Read-Only)', description: 'Read-only access across all records' }
  ];
}

/**
 * Validates if role string is recognized
 */
function isValidRole_(role) {
  const normalized = String(role || '').toLowerCase().trim();
  return Object.values(ROLES).includes(normalized);
}

/**
 * Normalizes role to a valid string or defaults to viewer
 */
function normalizeRole_(role) {
  const normalized = String(role || '').toLowerCase().trim();
  return isValidRole_(normalized) ? normalized : ROLES.VIEWER;
}

/**
 * Returns list of permission keys for a given role
 */
function getRolePermissions_(role) {
  const normRole = normalizeRole_(role);
  return ROLE_PERMISSIONS[normRole] || ROLE_PERMISSIONS[ROLES.VIEWER];
}

/**
 * Checks if a specific role has a permission
 */
function hasRolePermission_(role, permission) {
  const normRole = normalizeRole_(role);
  if (normRole === ROLES.ADMIN) return true;
  const permissions = ROLE_PERMISSIONS[normRole] || [];
  return permissions.includes(permission);
}

/**
 * Retrieves the currently logged-in user record from the sheet.
 * Supports explicit session context (sid) or fallback to active UserProperties.
 */
function getCurrentUser_(opt_context) {
  let username = '';
  if (opt_context && typeof opt_context === 'string' && typeof getValidSession_ === 'function') {
    const session = getValidSession_(opt_context);
    if (session && session.username) username = session.username;
  }
  if (!username && opt_context && typeof opt_context === 'object' && typeof getValidSession_ === 'function') {
    const sid = opt_context._sid || opt_context.sid;
    if (sid) {
      const session = getValidSession_(sid);
      if (session && session.username) username = session.username;
    }
  }
  if (!username) {
    try {
      username = PropertiesService.getUserProperties().getProperty('conference_records.username');
    } catch (e) {}
  }
  if (!username) return null;
  const rows = readAll_(USERS_SHEET) || [];
  const clean = normalizeUsername_(username);
  const user = rows.find(r => normalizeUsername_(r.username) === clean);
  if (!user || String(user.status || '').toLowerCase() !== 'active') {
    return null;
  }
  return user;
}

/**
 * Counts total active administrators in the users sheet
 */
function countActiveAdmins_() {
  const rows = readAll_(USERS_SHEET) || [];
  return rows.filter(r =>
    String(r.role || '').toLowerCase().trim() === ROLES.ADMIN &&
    String(r.status || '').toLowerCase().trim() === 'active'
  ).length;
}

/**
 * Checks if current user has permission.
 * Throws an error if not authorized.
 */
function requirePermission_(permission, opt_context) {
  const user = getCurrentUser_(opt_context);
  if (!user) {
    throw new Error('Authentication required. Please log in.');
  }
  const role = normalizeRole_(user.role);
  if (!hasRolePermission_(role, permission)) {
    throw new Error(`Access denied: Your role (${role}) is not authorized to perform action '${permission}'.`);
  }
  return user;
}

/**
 * Checks if current user has view permission for a page
 */
function canAccessPage_(page, opt_context) {
  const user = getCurrentUser_(opt_context);
  if (!user) return false;
  return hasRolePermission_(user.role, page + '.view');
}
