const { contextBridge, ipcRenderer } = require('electron');

// Whitelist de canais permitidos — princípio de segurança:
// o Renderer NUNCA tem acesso direto ao ipcRenderer bruto.
const validInvokeChannels = [
  // Dashboard
  'system:get-stats',
  'system:get-info',
  'system:get-optimization-status',
  'system:is-admin',

  // Otimizações
  'tweaks:get-catalog',
  'tweaks:apply',
  'tweaks:revert',
  'tweaks:get-applied-state',

  // Limpeza do Sistema
  'cleanup:get-targets',
  'cleanup:scan',
  'cleanup:execute',
  'cleanup:get-last-run',

  // Restauração
  'restore:list-points',
  'restore:list-points-elevated',
  'restore:create-point',
  'restore:enable-protection',

  // Apps / Bloatware
  'apps:list-installed',
  'apps:uninstall-batch',

  // Configurações
  'settings:get',
  'settings:set',
  'settings:get-language',
  'settings:set-language',

  // Autenticação
  'auth:validate-license',
  'auth:get-stored-license',
  'auth:logout'
];

const validOnChannels = [
  'system:stats-update',
  'cleanup:progress',
  'tweaks:progress'
];

contextBridge.exposeInMainWorld('electronAPI', {
  invoke: (channel, ...args) => {
    if (validInvokeChannels.includes(channel)) {
      return ipcRenderer.invoke(channel, ...args);
    }
    return Promise.reject(new Error(`Canal IPC não autorizado: ${channel}`));
  },

  on: (channel, callback) => {
    if (validOnChannels.includes(channel)) {
      const subscription = (_event, ...args) => callback(...args);
      ipcRenderer.on(channel, subscription);
      return () => ipcRenderer.removeListener(channel, subscription);
    }
    return () => {};
  },

  removeAllListeners: (channel) => {
    if (validOnChannels.includes(channel)) {
      ipcRenderer.removeAllListeners(channel);
    }
  }
});