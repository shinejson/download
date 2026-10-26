const USERS_SHEET = 'users';
const USERS_ID = 'userid';

function getUsers() {
  // Don't return password to client for security
  return readAll_(USERS_SHEET).map(u => {
    const copy = Object.assign({}, u);
    delete copy.password;
    return copy;
  });
}

function createUser(data) {
  if (!data || !data['username']) throw new Error('username is required');
  if (!data['userid']) data['userid'] = genId_('USR');
  if (!data['status']) data['status'] = 'active';
  return createRow_(USERS_SHEET, data);
}

function updateUser(id, data) {
  return updateRow_(USERS_SHEET, USERS_ID, id, data);
}

function deleteUser(id) {
  return deleteRow_(USERS_SHEET, USERS_ID, id);
}