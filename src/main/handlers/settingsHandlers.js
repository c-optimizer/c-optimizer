const { ipcMain, app } = require('electron');
const store = require('../store');
const { log } = require('../utils/logger');

/**
 * Aplica o estado de "iniciar com o Windows" no OS.
 * Chamado sempre que o setting muda E no boot do app (para reconciliar
 * caso o usuário tenha mexido no Task Manager / msconfig manualmente).
 */
function applyStartupSetting(enabled) {
  try {
    // Em produção (app empacotado), openAtLogin aponta para o executável.
    // Em dev, aponta para o electron.exe — que reabre o próprio dev server.
    // Só aplicamos quando empacotado para evitar poluir o autostart em dev.
    if (!app.isPackaged) {
      log.info('[settings] startup toggle ignorado em dev (app.isPackaged = false).');
      return;
    }

    app.setLoginItemSettings({
      openAtLogin: !!enabled,
      openAsHidden: true,        // abre minimizado na tray, se o app suportar
      path: process.execPath,    // garante que aponta pro .exe correto
      args: ['--hidden'],        // flag que o app pode ler pra iniciar na tray
    });
    log.info(`[settings] Startup ${enabled ? 'ativado' : 'desativado'} no OS.`);
  } catch (err) {
    log.error('[settings] Falha ao aplicar startup no OS:', err.message);
  }
}

/**
 * Reaplica o startup com base no store — chamado no boot do app para
 * reconciliar caso o setting tenha mudado por fora (Task Manager).
 */
function reconcileStartupOnBoot() {
  const settings = store.get('settings');
  if (settings && typeof settings.startup === 'boolean') {
    applyStartupSetting(settings.startup);
  }
}

function registerSettingsHandlers() {
  ipcMain.handle('settings:get', async () => {
    return store.get('settings');
  });

  ipcMain.handle('settings:set', async (_event, partialSettings) => {
    const current = store.get('settings');
    const updated = { ...current, ...partialSettings };
    store.set('settings', updated);

    // Aplica efeitos colaterais no OS quando os settings relevantes mudam.
    if (Object.prototype.hasOwnProperty.call(partialSettings, 'startup')) {
      applyStartupSetting(updated.startup);
    }

    return updated;
  });

  ipcMain.handle('settings:get-language', async () => {
    const settings = store.get('settings');
    return settings.language;
  });

  ipcMain.handle('settings:set-language', async (_event, language) => {
    const settings = store.get('settings');
    settings.language = language;
    store.set('settings', settings);
    return language;
  });
}

module.exports = {
  registerSettingsHandlers,
  reconcileStartupOnBoot,
};