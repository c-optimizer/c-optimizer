const { ipcMain } = require('electron');
const { runShellCommand } = require('../utils/shell');
const { withLicense } = require('../utils/licenseGuard');
const { log } = require('../utils/logger');
const {
  QUERY_SCRIPT,
  startDaemon,
  stopDaemon,
  isDaemonRunning,
} = require('../utils/timerResolution');

async function queryCurrentResolution() {
  try {
    const { stdout } = await runShellCommand(QUERY_SCRIPT, 8000);
    const trimmed = (stdout || '').trim();
    if (!trimmed) return null;
    const parsed = JSON.parse(trimmed);
    if (!parsed.success) return null;
    // current/min/max vêm em unidades de 100ns. Divide por 10000 → ms.
    return {
      minMs: parsed.min / 10000,
      maxMs: parsed.max / 10000,
      currentMs: parsed.current / 10000,
    };
  } catch (err) {
    log.warn('[timer] Falha ao consultar resolução:', err.message);
    return null;
  }
}

function registerTimerHandlers() {
  ipcMain.handle('timer:get-status', withLicense(async () => {
    if (process.platform !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    const active = isDaemonRunning();
    const info = await queryCurrentResolution();
    return {
      success: true,
      active,
      currentMs: info ? info.currentMs : null,
      requestedMs: 0.5,
    };
  }));

  ipcMain.handle('timer:start', withLicense(async () => {
    if (process.platform !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    if (isDaemonRunning()) {
      return { success: true, alreadyRunning: true };
    }
    const res = await startDaemon();
    if (!res.success) return res;
    return { success: true };
  }));

  ipcMain.handle('timer:stop', withLicense(async () => {
    if (process.platform !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    return stopDaemon();
  }));
}

module.exports = { registerTimerHandlers };