const { ipcMain, Notification } = require('electron');
const store = require('../store');
const { log } = require('../utils/logger');

function areNotificationsEnabled() {
  const settings = store.get('settings', {});
  return settings.notifications !== false; // default: true
}

/**
 * Dispara uma notificação nativa do SO, respeitando o toggle do usuário.
 * Usado tanto pelo handler IPC (botão "Testar") quanto internamente por
 * outros módulos (ex: reparo de sistema concluído, atualização baixada).
 */
function notifyIfEnabled(title, body) {
  if (!areNotificationsEnabled()) return false;
  if (!Notification.isSupported()) return false;

  try {
    new Notification({ title, body }).show();
    return true;
  } catch (error) {
    log.error('[notifications] Falha ao exibir notificação:', error.message);
    return false;
  }
}

function registerNotificationHandlers() {
  ipcMain.handle('notifications:show', async (_event, { title, body }) => {
    const shown = notifyIfEnabled(title || 'C-Optimizer', body || '');
    return { success: shown };
  });
}

module.exports = { registerNotificationHandlers, notifyIfEnabled };