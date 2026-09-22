const store = require('../store');
const { isValidLicenseFormat } = require('./license');

function isLicensed() {
  const license = store.get('license', { key: null, validatedAt: null });
  if (!license || !license.key) return false;
  return isValidLicenseFormat(license.key);
}

/**
 * Envolve um handler ipcMain.handle, bloqueando a execução caso não exista
 * uma licença válida salva localmente. Usado apenas nos handlers que
 * EXECUTAM ações reais no sistema (tweaks, limpeza, restauração, apps,
 * disco, winget) — handlers de leitura/listagem permanecem livres.
 */
function withLicense(handler) {
  return async (event, ...args) => {
    if (!isLicensed()) {
      return {
        success: false,
        error: 'Licença inválida ou não ativada. Valide sua chave na tela de Autenticação.'
      };
    }
    return handler(event, ...args);
  };
}

module.exports = { isLicensed, withLicense };