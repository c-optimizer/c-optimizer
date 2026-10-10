const { ipcMain, dialog, app, BrowserWindow } = require('electron');
const fs = require('fs').promises;
const os = require('os');
const path = require('path');
const store = require('../store');
const { withLicense } = require('../utils/licenseGuard');
const { isRunningAsAdmin } = require('../utils/shell');
const { log } = require('../utils/logger');

const SCHEMA = 'c-optimizer-config';
const SCHEMA_VERSION = 1;

function collectExportPayload() {
  const settings = store.get('settings', {});
  const tweaksApplied = store.get('tweaksApplied', {});
  const displaySettings = store.get('displaySettings', {});
  const onboarding = store.get('onboarding', {});

  const activeTweaks = Object.entries(tweaksApplied)
    .filter(([, enabled]) => enabled)
    .map(([id]) => id);

  return {
    schema: SCHEMA,
    version: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: `C-Optimizer v${app.getVersion()}`,
    machine: {
      hostname: os.hostname(),
      platform: os.platform(),
      release: os.release(),
    },
    preferences: {
      language: settings.language || 'pt-BR',
      startup: !!settings.startup,
      minimizeTray: settings.minimizeTray !== false,
      notifications: settings.notifications !== false,
    },
    activeTweaks,
    display: {
      brightness: displaySettings.brightness ?? null,
    },
    onboarding: {
      completed: !!onboarding.completed,
      chosenProfile: onboarding.chosenProfile || null,
    },
  };
}

function validateImportPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return { valid: false, errorCode: 'ERR_INVALID_FILE' };
  }
  if (payload.schema !== SCHEMA) {
    return { valid: false, errorCode: 'ERR_WRONG_SCHEMA' };
  }
  if (typeof payload.version !== 'number' || payload.version < 1) {
    return { valid: false, errorCode: 'ERR_INVALID_VERSION' };
  }
  if (payload.version > SCHEMA_VERSION) {
    return { valid: false, errorCode: 'ERR_VERSION_TOO_NEW' };
  }
  return { valid: true };
}

/**
 * Aplica as preferências importadas ao store. Retorna LISTA DE IDs alterados
 * (não strings) para o frontend traduzir conforme o idioma ativo.
 */
function applyPreferences(prefs) {
  if (!prefs || typeof prefs !== 'object') return [];

  const current = store.get('settings', {});
  const changedIds = [];
  const newSettings = { ...current };

  if (typeof prefs.language === 'string' && prefs.language !== current.language) {
    newSettings.language = prefs.language;
    changedIds.push('language');
  }
  if (typeof prefs.startup === 'boolean' && prefs.startup !== current.startup) {
    newSettings.startup = prefs.startup;
    changedIds.push('startup');
  }
  if (typeof prefs.minimizeTray === 'boolean' && prefs.minimizeTray !== current.minimizeTray) {
    newSettings.minimizeTray = prefs.minimizeTray;
    changedIds.push('minimizeTray');
  }
  if (typeof prefs.notifications === 'boolean' && prefs.notifications !== current.notifications) {
    newSettings.notifications = prefs.notifications;
    changedIds.push('notifications');
  }

  store.set('settings', newSettings);
  return changedIds;
}

async function exportToFile(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  const payload = collectExportPayload();
  const defaultName = `c-optimizer-config-${new Date().toISOString().slice(0, 10)}.json`;

  const result = await dialog.showSaveDialog(win, {
    title: 'Save settings backup', // título curto; usuário vê no diálogo nativo do Windows
    defaultPath: path.join(app.getPath('documents'), defaultName),
    filters: [{ name: 'Config file', extensions: ['json'] }],
  });

  if (result.canceled || !result.filePath) {
    return { success: false, cancelled: true };
  }

  try {
    await fs.writeFile(result.filePath, JSON.stringify(payload, null, 2), 'utf8');
    log.info(`[config:export] Backup salvo em ${result.filePath}`);
    return { success: true, filePath: result.filePath };
  } catch (err) {
    log.error('[config:export] Falha ao salvar:', err.message);
    return { success: false, errorCode: 'ERR_SAVE_FAILED', error: err.message };
  }
}

async function importFromFile(event) {
  const win = BrowserWindow.fromWebContents(event.sender);

  const result = await dialog.showOpenDialog(win, {
    title: 'Select settings backup',
    properties: ['openFile'],
    filters: [{ name: 'Config file', extensions: ['json'] }],
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, cancelled: true };
  }

  const filePath = result.filePaths[0];

  let payload;
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    payload = JSON.parse(raw);
  } catch (err) {
    log.error('[config:import] Falha ao ler arquivo:', err.message);
    return { success: false, errorCode: 'ERR_FILE_READ' };
  }

  const validation = validateImportPayload(payload);
  if (!validation.valid) {
    return { success: false, errorCode: validation.errorCode };
  }

  try {
    const changes = applyPreferences(payload.preferences);
    log.info(`[config:import] Preferências aplicadas: ${changes.join(', ') || 'nenhuma'}`);

    const appliedNow = store.get('tweaksApplied', {});
    const backupTweaks = Array.isArray(payload.activeTweaks) ? payload.activeTweaks : [];
    const pendingTweaks = backupTweaks.filter((id) => !appliedNow[id]);

    return {
      success: true,
      changes,
      activeTweaks: backupTweaks,
      pendingTweaks,
      metadata: {
        exportedAt: payload.exportedAt,
        app: payload.app,
        machine: payload.machine,
      },
    };
  } catch (err) {
    log.error('[config:import] Falha ao aplicar:', err.message);
    return { success: false, errorCode: 'ERR_APPLY_FAILED', error: err.message };
  }
}

async function applyImportedTweaks(tweakIds) {
  if (!Array.isArray(tweakIds) || tweakIds.length === 0) {
    return { success: true, applied: [], skipped: [], failed: [] };
  }

  const { TWEAKS_CATALOG, applyWithSnapshot } = require('./tweaksHandlers');

  const appliedState = store.get('tweaksApplied', {});
  const skipped = [];
  const toApply = [];

  for (const id of tweakIds) {
    if (appliedState[id]) skipped.push(id);
    else toApply.push(id);
  }

  if (toApply.length === 0) {
    return { success: true, applied: [], skipped, failed: [] };
  }

  const needsAdmin = toApply.some((id) => {
    const tweak = TWEAKS_CATALOG.find((t) => t.id === id);
    return tweak && tweak.requiresAdmin;
  });
  if (needsAdmin && !isRunningAsAdmin()) {
    return {
      success: false,
      applied: [],
      skipped,
      failed: toApply.map((id) => ({ id, code: 'ERR_NEEDS_ADMIN' })),
      errorCode: 'ERR_NEEDS_ADMIN',
    };
  }

  const applied = [];
  const failed = [];

  for (const id of toApply) {
    const tweak = TWEAKS_CATALOG.find((t) => t.id === id);
    if (!tweak) {
      failed.push({ id, code: 'ERR_TWEAK_MISSING' });
      continue;
    }

    if (tweak.minWindowsBuild) {
      const parts = os.release().split('.');
      const build = parseInt(parts[2] || '0', 10);
      if (build < tweak.minWindowsBuild) {
        failed.push({ id, code: 'ERR_UNSUPPORTED_WINDOWS' });
        continue;
      }
    }

    try {
      const r = await applyWithSnapshot(tweak);
      if (r.success) applied.push(id);
      else failed.push({ id, code: 'ERR_APPLY_FAILED', error: r.error });
    } catch (err) {
      failed.push({ id, code: 'ERR_APPLY_FAILED', error: err.message });
    }
  }

  // Se TODOS falharam pelo mesmo motivo, retorna o errorCode agregado
  // para o frontend mostrar uma mensagem única e traduzida.
  let errorCode;
  if (failed.length > 0 && applied.length === 0) {
    const codes = new Set(failed.map((f) => f.code));
    if (codes.size === 1) errorCode = failed[0].code;
  }

  return { success: failed.length === 0, applied, skipped, failed, errorCode };
}

function registerConfigHandlers() {
  ipcMain.handle('config:export', withLicense(async (event) => {
    return await exportToFile(event);
  }));

  ipcMain.handle('config:import', withLicense(async (event) => {
    return await importFromFile(event);
  }));

  ipcMain.handle('config:apply-imported-tweaks', withLicense(async (_event, tweakIds) => {
    return await applyImportedTweaks(tweakIds);
  }));
}

module.exports = { registerConfigHandlers };