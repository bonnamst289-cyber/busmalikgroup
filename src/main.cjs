const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { AssociationDatabase } = require('./database.cjs');
const { readBusOwnerImport, readFundImport } = require('./bus-owner-import.cjs');
const { UpdateController } = require('./updater/controller.cjs');

let mainWindow;
let database;
let currentUser = null;
let busImportSession = null;
let updates = null;
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

function requireBusImportPermission() {
  const user = requireUser();
  database.requirePermission(user, 'manage_owners');
  database.requirePermission(user, 'manage_buses');
  return user;
}

function requireFundImportPermission() {
  const user = requireUser();
  database.requirePermission(user, 'manage_funds');
  return user;
}

function getBusImportSession(id) {
  if (!busImportSession || (id && busImportSession.id !== id)) {
    throw new Error('Import session expired. Choose the file again.');
  }
  if (Date.now() - busImportSession.createdAt > 30 * 60 * 1000) {
    busImportSession = null;
    throw new Error('Import session expired. Choose the file again.');
  }
  return busImportSession;
}

function getImportSession(id, kind) {
  const session = getBusImportSession(id);
  if (session.kind !== kind) throw new Error('Import session expired. Choose the file again.');
  return session;
}

async function pickImportFile(kind, reader, title) {
  const result = await dialog.showOpenDialog(mainWindow, {
    title,
    properties: ['openFile'],
    filters: [{ name: 'Excel or Word file', extensions: ['xlsx', 'xls', 'docx'] }]
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const parsed = await reader(result.filePaths[0]);
  busImportSession = {
    id: crypto.randomUUID(),
    kind,
    fileName: path.basename(result.filePaths[0]),
    sheetName: parsed.sheetName,
    headers: parsed.headers,
    mapping: parsed.mapping,
    rows: parsed.rows,
    createdAt: Date.now()
  };
  return {
    id: busImportSession.id,
    fileName: busImportSession.fileName,
    sheetName: busImportSession.sheetName,
    headerRow: parsed.headerRow,
    headers: parsed.headers,
    mapping: parsed.mapping,
    total: parsed.rows.length
  };
}

function register(channel, handler) {
  ipcMain.handle(channel, async (_event, ...args) => handler(...args));
}

// The Cash In Report is strictly black and white, so the association logo is
// converted to greyscale before it is embedded in the PDF.
function grayscaleLogo(source) {
  try {
    const image = nativeImage.createFromPath(source);
    if (image.isEmpty()) return null;
    const { width, height } = image.getSize();
    if (!width || !height) return null;
    const bitmap = image.toBitmap();
    for (let index = 0; index < bitmap.length; index += 4) {
      const gray = Math.round(0.299 * bitmap[index + 2] + 0.587 * bitmap[index + 1] + 0.114 * bitmap[index]);
      bitmap[index] = gray;
      bitmap[index + 1] = gray;
      bitmap[index + 2] = gray;
    }
    const output = path.join(app.getPath('temp'), `somiti-report-logo-${process.pid}-${Date.now()}.png`);
    fs.writeFileSync(output, nativeImage.createFromBitmap(bitmap, { width, height }).toPNG());
    return output;
  } catch {
    return null;
  }
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
    busImportSession = null;
    return user;
  });
  register('auth:logout', () => {
    currentUser = null;
    busImportSession = null;
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
  register('records:list', (entity, search = '', filters = {}) => database.listRecords(requireUser(), entity, search, filters));
  register('records:save', (entity, data) => database.saveRecord(requireUser(), entity, data));
  register('records:delete', (entity, id) => database.deleteRecord(requireUser(), entity, id));
  register('owners:import-pick', async () => {
    requireBusImportPermission();
    return pickImportFile('buses', readBusOwnerImport, 'Select bus owner import file');
  });
  register('owners:import-preview', ({ id, mapping } = {}) => {
    try {
      const user = requireBusImportPermission();
      const session = getImportSession(id, 'buses');
      const preview = database.previewBusOwnerImport(user, session.rows, mapping || session.mapping || {});
      console.log(`[bus-import] preview ${session.fileName}: ${JSON.stringify(preview.totals)}`);
      return preview;
    } catch (error) {
      console.error('[bus-import] preview failed:', error);
      throw error;
    }
  });
  register('owners:import-commit', ({ id, mapping } = {}) => {
    try {
      const user = requireBusImportPermission();
      const session = getImportSession(id, 'buses');
      const result = database.importBusOwners(user, session.rows, mapping || session.mapping || {});
      console.log(`[bus-import] commit ${session.fileName}: ${JSON.stringify(result.totals)}`);
      if (result.issues.length) console.log('[bus-import] skipped rows:', JSON.stringify(result.issues));
      busImportSession = null;
      return result;
    } catch (error) {
      console.error('[bus-import] commit failed:', error);
      throw error;
    }
  });
  register('owners:import-cancel', ({ id } = {}) => {
    if (busImportSession && (!id || busImportSession.id === id)) busImportSession = null;
    return true;
  });
  register('owners:import-template', async () => {
    requireUser();
    const output = await dialog.showSaveDialog(mainWindow, {
      title: 'Save bus owner import template',
      defaultPath: 'bus-owner-import-template.xlsx',
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
    });
    if (output.canceled || !output.filePath) return null;
    await database.exportExcel(output.filePath, 'Bus Owner Import Template', [
      'Bus Owner Name', 'Bus Number', "Father's Name", 'Mobile Number', 'Address', 'Status'
    ], []);
    return output.filePath;
  });
  register('funds:import-pick', async () => {
    requireFundImportPermission();
    return pickImportFile('funds', readFundImport, 'Select fund import file');
  });
  register('funds:import-preview', ({ id, mapping } = {}) => {
    try {
      const user = requireFundImportPermission();
      const session = getImportSession(id, 'funds');
      const preview = database.previewFundImport(user, session.rows, mapping || session.mapping || {});
      console.log(`[fund-import] preview ${session.fileName}: ${JSON.stringify(preview.totals)}`);
      return preview;
    } catch (error) {
      console.error('[fund-import] preview failed:', error);
      throw error;
    }
  });
  register('funds:import-commit', ({ id, mapping } = {}) => {
    try {
      const user = requireFundImportPermission();
      const session = getImportSession(id, 'funds');
      const result = database.importFunds(user, session.rows, mapping || session.mapping || {});
      console.log(`[fund-import] commit ${session.fileName}: ${JSON.stringify(result.totals)}`);
      if (result.issues.length) console.log('[fund-import] skipped rows:', JSON.stringify(result.issues));
      busImportSession = null;
      return result;
    } catch (error) {
      console.error('[fund-import] commit failed:', error);
      throw error;
    }
  });
  register('funds:import-cancel', ({ id } = {}) => {
    if (busImportSession && busImportSession.kind === 'funds' && (!id || busImportSession.id === id)) {
      busImportSession = null;
    }
    return true;
  });
  register('funds:import-template', async () => {
    requireUser();
    const output = await dialog.showSaveDialog(mainWindow, {
      title: 'Save fund import template',
      defaultPath: 'fund-import-template.xlsx',
      filters: [{ name: 'Excel Workbook', extensions: ['xlsx'] }]
    });
    if (output.canceled || !output.filePath) return null;
    await database.exportExcel(output.filePath, 'Fund Import Template', [
      'Fund Name (তহবিলের নাম)', 'Route Name (রুটের নাম)',
      'Per Trip Fund Amount (BDT) (টাকা)', 'Opening Balance (BDT) (টাকা)', 'Status (অবস্থা)'
    ], []);
    return output.filePath;
  });
  register('owners:account', (id) => database.ownerAccount(requireUser(), id));
  register('buses:account', (id) => database.busAccount(requireUser(), id));
  register('buses:set-status', (id, status) => database.setBusStatus(requireUser(), id, status));
  register('routes:account', (id) => database.routeAccount(requireUser(), id));
  register('receipts:list', () => database.listReceipts(requireUser()));
  register('audit:list', () => database.listAudit(requireAdmin()));
  register('login-history:list', () => database.listLoginHistory(requireAdmin()));
  register('cashbook:get', () => database.cashbook(requireUser()));
  register('cashbook:create', (data) => database.createCashIn(requireUser(), data));
  register('cashbook:update', (data) => database.updateCashIn(requireUser(), data));
  register('cashbook:delete', (id) => database.deleteCashIn(requireUser(), id));
  register('cashbook:clear-in', () => database.clearCashIns(requireUser()));
  register('cashbook:create-out', (data) => database.createCashOut(requireUser(), data));
  register('cashbook:create-out-batch', (data) => database.createCashOutBatch(requireUser(), data));
  register('cashbook:update-out', (data) => database.updateCashOut(requireUser(), data));
  register('cashbook:update-out-batch', (data) => database.updateCashOutBatch(requireUser(), data));
  register('cashbook:delete-out', (id) => database.deleteCashOut(requireUser(), id));
  register('cashbook:clear-out', () => database.clearCashOuts(requireUser()));
  register('banks:get', (filters) => database.bankOverview(requireUser(), filters));
  register('banks:save', (data) => database.saveBank(requireUser(), data));
  register('banks:delete', (id) => database.deleteBank(requireUser(), id));
  register('banks:deposit-create', (data) => database.createDeposit(requireUser(), data));
  register('banks:deposit-update', (data) => database.updateDeposit(requireUser(), data));
  register('banks:deposit-delete', (id) => database.deleteDeposit(requireUser(), id));
  register('banks:pdf', async () => {
    requireUser();
    const output = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Bank Report as PDF',
      defaultPath: `bank-report-${new Date().toISOString().slice(0, 10)}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (output.canceled || !output.filePath) return null;
    const logo = database.logoFile();
    const grayscale = logo ? grayscaleLogo(logo) : null;
    try {
      await database.exportBankReportPdf(output.filePath, grayscale ? { logo: grayscale } : {});
    } finally {
      if (grayscale) fs.rmSync(grayscale, { force: true });
    }
    return output.filePath;
  });
  register('settings:get', () => database.getSettings(requireUser()));
  register('settings:save', (data) => database.saveSettings(requireAdmin(), data));
  register('files:logo', async () => {
    requireAdmin();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Select association logo',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }]
    });
    if (result.canceled || !result.filePaths[0]) return null;
    const source = result.filePaths[0];
    const target = path.join(app.getPath('userData'), `association-logo${path.extname(source).toLowerCase()}`);
    fs.copyFileSync(source, target);
    return target;
  });
  register('reports:get', (filters) => database.report(requireUser(), filters));
  register('cash-in-report:get', (filters) => {
    requireUser();
    return database.cashInReport(filters);
  });
  register('cash-out-report:get', (filters) => {
    requireUser();
    return database.cashOutReport(filters);
  });
  register('cash-out-report:pdf', async (filters = {}) => {
    requireUser();
    const range = ([filters?.from, filters?.to].filter(Boolean).join('_') || 'all')
      .replace(/[^\w-]/g, '');
    const output = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Cash Out Report as PDF',
      defaultPath: `cash-out-report-${String(range).replace(/[^\w-]/g, '')}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (output.canceled || !output.filePath) return null;
    const logo = database.logoFile();
    const grayscale = logo ? grayscaleLogo(logo) : null;
    try {
      await database.exportCashOutPdf(output.filePath, filters || {}, grayscale ? { logo: grayscale } : {});
    } finally {
      if (grayscale) fs.rmSync(grayscale, { force: true });
    }
    return output.filePath;
  });
  register('cash-in-report:pdf', async (filters = {}) => {
    requireUser();
    const range = ([filters?.from, filters?.to].filter(Boolean).join('_') || 'all')
      .replace(/[^\w-]/g, '');
    const output = await dialog.showSaveDialog(mainWindow, {
      title: 'Save Cash In Report as PDF',
      defaultPath: `cash-in-report-${String(range).replace(/[^\w-]/g, '')}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (output.canceled || !output.filePath) return null;
    const logo = database.logoFile();
    const grayscale = logo ? grayscaleLogo(logo) : null;
    try {
      await database.exportCashInPdf(output.filePath, filters || {}, grayscale ? { logo: grayscale } : {});
    } finally {
      if (grayscale) fs.rmSync(grayscale, { force: true });
    }
    return output.filePath;
  });
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
    await database.backup(result.filePath);
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
    busImportSession = null;
    return true;
  });
  register('backup:pick-folder', async () => {
    requireAdmin();
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose backup folder',
      properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });
  register('backup:open-folder', async (folder) => {
    requireAdmin();
    const settings = database.getSettings();
    if (!folder || !String(folder).startsWith(settings.backup_folder)) throw new Error('Only the configured backup folder can be opened.');
    const error = await shell.openPath(String(folder));
    if (error) throw new Error(error);
    return true;
  });
  register('export:pdf', async ({ title, headers, rows, orientation }) => {
    requireUser();
    const output = await dialog.showSaveDialog(mainWindow, {
      defaultPath: `${String(title || 'report').replace(/[^\w-]/g, '-')}.pdf`,
      filters: [{ name: 'PDF', extensions: ['pdf'] }]
    });
    if (output.canceled || !output.filePath) return null;
    await database.exportPdf(output.filePath, title, headers, rows, { orientation });
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
  // Update actions stay available before sign-in: a mandatory update can cover
  // the login screen, so requiring a session would deadlock the application.
  register('updates:state', () => updates.getState());
  register('updates:check', () => updates.check({ manual: true }));
  register('updates:download', () => updates.startDownload());
  register('updates:install', () => updates.installAndRestart());
  register('updates:later', () => updates.snooze());
  register('updates:skip', () => updates.skipVersion());
}

app.whenReady().then(() => {
  app.setAppUserModelId('bd.busmaliksomiti.desktop');
  try {
    database = new AssociationDatabase(path.join(app.getPath('userData'), 'association.sqlite'));
  } catch (error) {
    // Without the pre-migration copy the ledger must not be touched, so the
    // customer gets the exact folder to free up instead of a blank window.
    dialog.showErrorBox('Bus Malik Somiti could not start', error.message);
    app.quit();
    return;
  }
  registerIpc();
  createWindow();
  startScheduledBackup();
  const forceDev = process.env.SOMITI_UPDATES_FORCE === '1';
  updates = new UpdateController({
    app,
    getWindows: () => BrowserWindow.getAllWindows(),
    // The portable build unpacks into a temporary folder on every launch, so an
    // update installed there would be thrown away immediately.
    enabled: (app.isPackaged || forceDev) && !process.env.PORTABLE_EXECUTABLE_DIR,
    disabledReason: process.env.PORTABLE_EXECUTABLE_DIR
      ? 'The portable version cannot update itself. Install the setup program to receive updates.'
      : 'Automatic updates are only active in the installed application.',
    forceDevConfig: forceDev
  });
  updates.start();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

let backupTimer;
function startScheduledBackup() {
  const run = () => database.runScheduledBackup().catch((error) => console.error('Automatic backup failed:', error.message));
  run();
  backupTimer = setInterval(run, 60 * 60 * 1000);
}

app.on('will-quit', () => {
  if (backupTimer) clearInterval(backupTimer);
  if (updates) updates.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  if (database) database.close();
});
