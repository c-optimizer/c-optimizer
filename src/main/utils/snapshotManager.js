const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { log } = require('./logger');

/**
 * Caminho do arquivo de snapshots, calculado sob demanda (nunca no topo do
 * módulo) porque app.getPath só é confiável depois de app.whenReady().
 */
function getSnapshotFilePath() {
  return path.join(app.getPath('userData'), 'snapshots.json');
}

function loadSnapshots() {
  const filePath = getSnapshotFilePath();
  try {
    if (!fs.existsSync(filePath)) return {};
    const raw = fs.readFileSync(filePath, 'utf8').trim();
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (error) {
    log.error('[snapshotManager] Falha ao ler snapshots.json, iniciando vazio:', error.message);
    return {};
  }
}

function persistSnapshots(data) {
  const filePath = getSnapshotFilePath();
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    log.error('[snapshotManager] Falha ao gravar snapshots.json:', error.message);
    throw error;
  }
}

/**
 * Salva o estado original de um tweak ANTES de qualquer modificação.
 * stateData é livre em formato — para tweaks de registro, esperamos
 * { pathExists, propertyExists, value }.
 */
function saveSnapshot(tweakId, stateData) {
  const all = loadSnapshots();
  all[tweakId] = {
    tweakId,
    timestamp: new Date().toISOString(),
    previousState: stateData
  };
  persistSnapshots(all);
  log.info(`[snapshotManager] Snapshot salvo para "${tweakId}".`, stateData);
  return all[tweakId];
}

function getSnapshot(tweakId) {
  const all = loadSnapshots();
  return all[tweakId] || null;
}

function hasSnapshot(tweakId) {
  return getSnapshot(tweakId) !== null;
}

function removeSnapshot(tweakId) {
  const all = loadSnapshots();
  if (all[tweakId]) {
    delete all[tweakId];
    persistSnapshots(all);
    log.info(`[snapshotManager] Snapshot removido para "${tweakId}".`);
  }
}

module.exports = {
  saveSnapshot,
  getSnapshot,
  hasSnapshot,
  removeSnapshot,
  getSnapshotFilePath
};