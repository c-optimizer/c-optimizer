const { ipcMain } = require('electron');
const store = require('../store');

function registerSettingsHandlers() {
  ipcMain.handle('settings:get', async () => {
    return store.get('settings');
  });

  ipcMain.handle('settings:set', async (_event, partialSettings) => {
    const current = store.get('settings');
    const updated = { ...current, ...partialSettings };
    store.set('settings', updated);
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
  registerSettingsHandlers
};