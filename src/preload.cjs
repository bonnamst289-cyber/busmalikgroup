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
  buses: { account: invoke('buses:account') },
  routes: { account: invoke('routes:account') },
  receipts: { list: invoke('receipts:list') },
  audit: { list: invoke('audit:list'), loginHistory: invoke('login-history:list') },
  trips: { save: invoke('trips:save'), delete: invoke('trips:delete') },
  finance: { post: invoke('finance:post'), list: invoke('finance:list'), transfer: invoke('finance:transfer') },
  dues: { generate: invoke('dues:generate'), list: invoke('dues:list'), pay: invoke('dues:pay') },
  reports: { get: invoke('reports:get') },
  files: { ownerPhoto: invoke('files:owner-photo') },
  backup: { save: invoke('backup:save'), restore: invoke('backup:restore') },
  export: { pdf: invoke('export:pdf'), excel: invoke('export:excel') },
  receipt: { open: invoke('receipt:open') }
});
