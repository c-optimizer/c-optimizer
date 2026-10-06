const { ipcMain } = require('electron');
const store = require('../store');
const { withLicense } = require('../utils/licenseGuard');
const { isRunningAsAdmin } = require('../utils/shell');
const { log } = require('../utils/logger');
const {
  getState, setState, setOnStateChange, startPolling, stopPolling,
} = require('../utils/gameDetector');
const { PRESETS, applySinglePreset } = require('./presetHandlers');
const { revertWithSnapshot, TWEAKS_CATALOG } = require('./tweaksHandlers');

const GAMING_PRESET = PRESETS.find((p) => p.id === 'gaming');
const STATE_KEY = 'gameMode';

function isEnabled() {
  const cfg = store.get(STATE_KEY, {});
  return !!cfg.enabled;
}

async function applyGamingPreset() {
  const applied = store.get('tweaksApplied', {});
  const preGameActive = GAMING_PRESET.tweaks.filter((id) => applied[id]);

  store.set(`${STATE_KEY}.session`, {
    startedAt: new Date().toISOString(),
    preGameActive,
  });

  const result = await applySinglePreset(GAMING_PRESET, null);
  return { ...result, preGameActive };
}

async function revertGamingPreset() {
  const session = store.get(`${STATE_KEY}.session`, null);
  const preGameActive = new Set(session?.preGameActive || []);

  const reverted = [];
  const failed = [];

  for (const tweakId of GAMING_PRESET.tweaks) {
    if (preGameActive.has(tweakId)) continue;
    const tweak = TWEAKS_CATALOG.find((t) => t.id === tweakId);
    if (!tweak) continue;
    try {
      const r = await revertWithSnapshot(tweak);
      if (r.success) reverted.push(tweakId);
      else failed.push({ id: tweakId, error: r.error });
    } catch (err) {
      failed.push({ id: tweakId, error: err.message });
    }
  }

  store.delete(`${STATE_KEY}.session`);
  return { reverted, failed };
}

async function handleGameStart(gameName) {
  try {
    if (!isRunningAsAdmin()) {
      log.warn('[gameMode] Jogo detectado mas app não é admin. Ignorando.');
      setState('idle', null);
      return;
    }
    log.info(`[gameMode] Jogo detectado: ${gameName}. Aplicando preset Gaming...`);
    const result = await applyGamingPreset();
    log.info(`[gameMode] Aplicado: ${result.applied.length} tweaks.`);
    setState('active', gameName);
  } catch (err) {
    log.error('[gameMode] Falha ao aplicar preset:', err.message);
    setState('idle', null);
  }
}

async function handleGameEnd() {
  try {
    log.info('[gameMode] Jogo encerrado. Revertendo preset Gaming...');
    const result = await revertGamingPreset();
    log.info(`[gameMode] Revertido: ${result.reverted.length} tweaks.`);
  } catch (err) {
    log.error('[gameMode] Falha ao reverter preset:', err.message);
  } finally {
    setState('idle', null);
  }
}

function enableGameMode() {
  if (!isRunningAsAdmin()) {
    return {
      success: false,
      error: 'O Modo de Jogo exige que o C-Optimizer seja executado como Administrador.'
    };
  }
  const cfg = store.get(STATE_KEY, {});
  store.set(STATE_KEY, { ...cfg, enabled: true });
  startPolling({ onGameStart: handleGameStart, onGameEnd: handleGameEnd });
  log.info('[gameMode] Ativado.');
  return { success: true };
}

async function disableGameMode() {
  stopPolling();
  const cfg = store.get(STATE_KEY, {});
  store.set(STATE_KEY, { ...cfg, enabled: false });
  const st = getState();
  if (st.state === 'active' || st.state === 'detecting') {
    await handleGameEnd();
  } else {
    setState('idle', null);
  }
  log.info('[gameMode] Desativado.');
  return { success: true };
}

async function reconcileOnBoot() {
  const session = store.get(`${STATE_KEY}.session`, null);
  if (!session) return;
  log.warn('[gameMode] Sessão órfã detectada. Revertendo tweaks do Game Mode...');
  try {
    await revertGamingPreset();
    log.info('[gameMode] Reversão de boot concluída.');
  } catch (err) {
    log.error('[gameMode] Falha na reversão de boot:', err.message);
  }
}

function registerGameModeHandlers() {
  setOnStateChange((state) => {
    const { BrowserWindow } = require('electron');
    const wins = BrowserWindow.getAllWindows();
    for (const w of wins) {
      if (!w.isDestroyed()) {
        w.webContents.send('game-mode:state', state);
      }
    }
  });

  ipcMain.handle('game-mode:get-status', withLicense(async () => {
    const st = getState();
    return {
      success: true,
      enabled: isEnabled(),
      state: st.state,
      currentGame: st.game,
      isAdmin: isRunningAsAdmin(),
    };
  }));

  ipcMain.handle('game-mode:enable', withLicense(async () => enableGameMode()));
  ipcMain.handle('game-mode:disable', withLicense(async () => await disableGameMode()));

  if (isEnabled() && isRunningAsAdmin()) {
    startPolling({ onGameStart: handleGameStart, onGameEnd: handleGameEnd });
    log.info('[gameMode] Retomado do estado salvo.');
  }
}

module.exports = { registerGameModeHandlers, reconcileOnBoot };