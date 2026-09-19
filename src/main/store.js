const Store = require('electron-store');

/**
 * Instância única do electron-store para todo o app.
 * O arquivo físico fica em:
 *   Windows: %APPDATA%\c-optimizer\config.json
 *   Linux:   ~/.config/c-optimizer/config.json
 *
 * `schema` valida o formato dos dados e evita corrupção silenciosa;
 * `defaults` garante que a primeira execução já tenha uma estrutura válida.
 */
const store = new Store({
  name: 'config',
  defaults: {
    tweaksApplied: {},       // { [tweakId]: boolean }
    lastCleanupAt: null,     // ISO string ou null
    settings: {
      language: 'pt-BR',
      startup: false,
      minimizeTray: true
    },
    license: {
      key: null,
      validatedAt: null
    }
  }
});

module.exports = store;