const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld('somiti', {
  auth: {
    status: invoke('auth:status'),
    setup: invoke('auth:setup'),
    login: invoke('auth:login'),
    logout: invoke('auth:logout'),
    current: invoke('auth:current'),
    changePassword: invoke('auth:change-password')
  },
  users: { list: invoke('users:list'), save: invoke('users:save') },
  dashboard: { get: invoke('dashboard:get') },
  records: { list: invoke('records:list'), save: invoke('records:save'), delete: invoke('records:delete') },
  owners: { account: invoke('owners:account') },
  buses: { account: invoke('buses:account'), setStatus: invoke('buses:set-status') },
  routes: { account: invoke('routes:account') },
  receipts: { list: invoke('receipts:list') },
  audit: { list: invoke('audit:list'), loginHistory: invoke('login-history:list') },
  cashbook: {
    get: invoke('cashbook:get'),
    create: invoke('cashbook:create'),
    update: invoke('cashbook:update'),
    delete: invoke('cashbook:delete'),
    clearIn: invoke('cashbook:clear-in'),
    createOut: invoke('cashbook:create-out'),
    createOutBatch: invoke('cashbook:create-out-batch'),
    updateOut: invoke('cashbook:update-out'),
    updateOutBatch: invoke('cashbook:update-out-batch'),
    deleteOut: invoke('cashbook:delete-out'),
    clearOut: invoke('cashbook:clear-out')
  },
  banks: {
    get: invoke('banks:get'),
    save: invoke('banks:save'),
    delete: invoke('banks:delete'),
    createDeposit: invoke('banks:deposit-create'),
    updateDeposit: invoke('banks:deposit-update'),
    deleteDeposit: invoke('banks:deposit-delete'),
    pdf: invoke('banks:pdf')
  },
  settings: { get: invoke('settings:get'), save: invoke('settings:save') },
  reports: { get: invoke('reports:get') },
  cashInReport: { get: invoke('cash-in-report:get'), pdf: invoke('cash-in-report:pdf') },
  cashOutReport: { get: invoke('cash-out-report:get'), pdf: invoke('cash-out-report:pdf') },
  busImport: {
    pick: invoke('owners:import-pick'),
    preview: invoke('owners:import-preview'),
    commit: invoke('owners:import-commit'),
    cancel: invoke('owners:import-cancel'),
    template: invoke('owners:import-template')
  },
  fundImport: {
    pick: invoke('funds:import-pick'),
    preview: invoke('funds:import-preview'),
    commit: invoke('funds:import-commit'),
    cancel: invoke('funds:import-cancel'),
    template: invoke('funds:import-template')
  },
  files: { ownerPhoto: invoke('files:owner-photo'), logo: invoke('files:logo') },
  backup: { save: invoke('backup:save'), restore: invoke('backup:restore'), pickFolder: invoke('backup:pick-folder'), openFolder: invoke('backup:open-folder') },
  export: { pdf: invoke('export:pdf'), excel: invoke('export:excel') },
  receipt: { open: invoke('receipt:open') },
  updates: {
    state: invoke('updates:state'),
    check: invoke('updates:check'),
    download: invoke('updates:download'),
    install: invoke('updates:install'),
    later: invoke('updates:later'),
    skip: invoke('updates:skip'),
    onEvent: (callback) => {
      const listener = (_event, state) => callback(state);
      ipcRenderer.on('updates:event', listener);
      return () => ipcRenderer.removeListener('updates:event', listener);
    }
  }
});
