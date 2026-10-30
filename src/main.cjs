const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { AssociationDatabase } = require('./database.cjs');

let mainWindow;
let database;
let currentUser = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1050,
    minHeight: 700,
    backgroundColor: '#f4f7fb',
    title: 'Bus Malik Somiti',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

function requireUser() {
  if (!currentUser) throw new Error('Please sign in first.');
  return currentUser;
}

function requireAdmin() {
  const user = requireUser();
  if (user.role !== 'admin') throw new Error('Administrator permission is required.');
  return user;
}

function register(channel, handler) {
  ipcMain.handle(channel, async (_event, ...args) => handler(...args));
}

function registerIpc() {
  register('auth:status', () => database.hasUsers());
  register('auth:setup', (data) => {
    if (database.hasUsers()) throw new Error('Initial setup has already been completed.');
    const user = database.createUser({ ...data, role: 'admin' }, null);
    currentUser = user;
    return user;
  });
  register('auth:login', ({ username, password }) => {
    const user = database.authenticate(username, password);
    currentUser = user;
    return user;
  });
  register('auth:logout', () => {
    currentUser = null;
    return true;
  });
  register('auth:current', () => currentUser);
  register('auth:change-password', ({ oldPassword, newPassword }) => database.changePassword(requireUser(), oldPassword, newPassword));
  register('users:list', () => {
    requireAdmin();
    return database.listUsers();
  });
  register('users:save', (data) => database.saveUser(requireAdmin(), data));
  register('dashboard:get', () => database.dashboard(requireUser()));
  register('records:list', (entity, search = '') => database.listRecords(requireUser(), entity, search));
  register('records:save', (entity, data) => database.saveRecord(requireUser(), entity, data));
  register('records:delete', (entity, id) => database.deleteRecord(requireUser(), entity, id));
  register('owners:account', (id) => database.ownerAccount(requireUser(), id));
  register('buses:account', (id) => database.busAccount(requireUser(), id));
  register('routes:account', (id) => database.routeAccount(requireUser(), id));
  register('receipts:list', () => database.listReceipts(requireUser()));
  register('audit:list', () => database.listAudit(requireAdmin()));
  register('login-history:list', () => database.listLoginHistory(requireAdmin()));
  register('trips:save', (data) => database.saveTrip(requireUser(), data));
  register('trips:delete', (id) => database.deleteTrip(requireAdmin(), id));
  register('finance:post', (data) => database.postTransaction(requireUser(), data));
  register('finance:list', (filters) => database.listTransactions(requireUser(), filters));
  register('finance:transfer', (data) => database.transfer(requireUser(), data));
  register('dues:generate', (month) => database.generateDues(requireUser(), month));
  register('dues:list', (month) => database.listDues(requireUser(), month));
  register('dues:pay', (data) => database.payDue(requireUser(), data));
  register('reports:get', (filters) => database.report(requireUser(), filters));
  register('files:owner-photo', async (ownerId) => {
    requireUser();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select owner photograph',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const source = result.filePaths[0];
    const ext = path.extname(source).toLowerCase();
    const photoDir = path.join(app.getPath('userData'), 'owner-photos');
    fs.mkdirSync(photoDir, { recursive: true });
    const target = path.join(photoDir, `${String(ownerId).replace(/[^a-zA-Z0-9_-]/g, '')}-${Date.now()}${ext}`);
    fs.copyFileSync(source, target);
    return target;
  });
  register('backup:save', async () => {
    requireAdmin();
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Backup association database',
      defaultPath: `bus-somiti-backup-${new Date().toISOString().slice(0, 10)}.sqlite`,
      filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }]
    });
    if (result.canceled || !result.filePath) return null;
    database.backup(result.filePath);
    return result.filePath;
  });
  register('backup:restore', async () => {
    requireAdmin();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Restore association database',
      properties: ['openFile'],
      filters: [{ name: 'SQLite Database', extensions: ['sqlite', 'db'] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    database.restore(result.filePaths[0]);
    currentUser = null;
    return true;
  });
  register('export:pdf', async ({ title, headers, rows }) => {
    requireUser();
    const output = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${String(title || 'report').replace(/[^\w-]/g, '-')}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (output.canceled || !output.filePath) return null;
    await database.exportPdf(output.filePath, title, headers, rows);
    return output.filePath;
  });
  register('export:excel', async ({ title, headers, rows }) => {
    requireUser();
    const output = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${String(title || 'report').replace(/[^\w-]/g, '-')}.xlsx`,
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
    });
    if (output.canceled || !output.filePath) return null;
    await database.exportExcel(output.filePath, title, headers, rows);
    return output.filePath;
  });
  register('receipt:open', async (receiptId) => {
    requireUser();
    const receiptPath = await database.receiptPath(receiptId);
    await shell.openPath(receiptPath);
    return receiptPath;
  });
}

app.whenReady().then(() => {
  app.setAppUserModelId('bd.busmaliksomiti.desktop');
  database = new AssociationDatabase(path.join(app.getPath('userData'), 'association.sqlite'));
  registerIpc();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (database) database.close();
});
