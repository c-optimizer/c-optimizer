const { contextBridge, ipcRenderer } = require('electron');

const validInvokeChannels = [
  // Dashboard
  'system:get-stats',
  'system:get-info',
  'system:get-optimization-status',
  'system:is-admin',
  'system:get-memory-profile',
  'system:open-external',
  'system:copy-logs',
  'system-fixer:is-admin',
  'system-fixer:run-repair',
  'system-fixer:check-drive',
  'system:get-changelog',

  // Otimizações
  'tweaks:get-catalog',
  'tweaks:apply',
  'tweaks:revert',
  'tweaks:get-applied-state',
  'tweaks:revert-all',

  // Presets
  'preset:list',
  'preset:apply',

  // Game Mode
  'game-mode:get-status',
  'game-mode:enable',
  'game-mode:disable',

  // Disco
  'disk:list-volumes',
  'disk:optimize',

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

  // Winget — instalação de softwares e runtimes
  'winget:check-installed',
  'winget:get-catalog',
  'winget:install',
  'winget:open-installer',

  // Configurações
  'settings:get',
  'settings:set',
  'settings:get-language',
  'settings:set-language',
  'notifications:show',

  // Display & Cores
  'display:get-brightness',
  'display:set-brightness',
  // Timer Resolution
  'timer:get-status',
  'timer:start',
  'timer:stop',

  // Latency Tools
  'latency:is-admin',
  'latency:clean-standby',

  // Autenticação
  'auth:validate-license',
  'auth:get-stored-license',
  'auth:logout',

  // Auto-update
  'update:start-download',
  'update:quit-and-install'
];

const validOnChannels = [
  'system:stats-update',
  'cleanup:progress',
  'tweaks:progress',
  'winget:progress',
  'update:available',
  'update:progress',
  'update:downloaded',
  'system-fixer:progress',
  'preset:progress',
  'game-mode:state',

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