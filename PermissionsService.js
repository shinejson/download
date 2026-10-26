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
    'items.view', 'items.create', 'items.edit', 'items.delete',
    'menu.view', 'menu.create', 'menu.edit', 'menu.delete',
    'users.view', 'users.create', 'users.edit', 'users.delete',
    'settings.view', 'settings.edit'
  ],
  manager: [
    'dashboard.view',
    'categories.view', 'categories.create', 'categories.edit', 'categories.delete',
    'items.view', 'items.create', 'items.edit', 'items.delete',
    'menu.view', 'menu.create', 'menu.edit', 'menu.delete'
  ],
  staff: [
    'dashboard.view',
    'categories.view',
    'items.view',
    'menu.view', 'menu.create', 'menu.edit'
  ],
  viewer: [
    'dashboard.view',
    'categories.view',
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
 */
function getCurrentUser_() {
  const username = PropertiesService.getUserProperties().getProperty('conference_records.username');
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
function requirePermission_(permission) {
  const user = getCurrentUser_();
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
function canAccessPage_(page) {
  const user = getCurrentUser_();
  if (!user) return false;
  return hasRolePermission_(user.role, page + '.view');
}
