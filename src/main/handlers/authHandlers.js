const { ipcMain } = require('electron');
const store = require('../store');
const { isValidLicenseFormat, formatLicenseKey, normalizeKey } = require('../utils/license');

function registerAuthHandlers() {
  ipcMain.handle('auth:validate-license', async (_event, rawKey) => {
    if (!rawKey || typeof rawKey !== 'string') {
      return { success: false, error: 'Digite uma chave de licença.' };
    }

    const normalized = normalizeKey(rawKey);

    if (!isValidLicenseFormat(normalized)) {
      return { success: false, error: 'Chave de licença inválida. Verifique e tente novamente.' };
    }

    const formattedKey = formatLicenseKey(normalized);

    store.set('license', {
      key: formattedKey,
      validatedAt: new Date().toISOString()
    });

    return { success: true, key: formattedKey };
  });

  ipcMain.handle('auth:get-stored-license', async () => {
    const license = store.get('license', { key: null, validatedAt: null });
    return license;
  });

  ipcMain.handle('auth:logout', async () => {
    store.set('license', { key: null, validatedAt: null });
    return { success: true };
  });
}

module.exports = { registerAuthHandlers };