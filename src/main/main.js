const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const { registerSystemHandlers, stopStatsStreaming } = require('./handlers/systemHandlers');
const { registerTweaksHandlers } = require('./handlers/tweaksHandlers');
const { registerCleanupHandlers } = require('./handlers/cleanupHandlers');
const { registerSettingsHandlers } = require('./handlers/settingsHandlers');
const { registerRestoreHandlers } = require('./handlers/restoreHandlers');
const { registerAppsHandlers } = require('./handlers/appsHandlers');
const { registerAuthHandlers } = require('./handlers/authHandlers');
const { registerDiskHandlers } = require('./handlers/diskHandlers');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow = null;

// ------------------------------------------------------------------
// Auto-updater (electron-updater + GitHub Releases)
// ------------------------------------------------------------------
autoUpdater.logger = console;
autoUpdater.autoDownload = false;

// Registrados UMA ÚNICA VEZ, no carregamento do módulo — nunca dentro de
// setupAutoUpdater/activate, ou o app quebra com "Attempted to register
// a second handler" caso a janela seja recriada (ex: evento 'activate').
ipcMain.handle('update:start-download', () => autoUpdater.downloadUpdate());
ipcMain.handle('update:quit-and-install', () => autoUpdater.quitAndInstall());

function setupAutoUpdater(window) {
  if (!window) return;

  // checkForUpdates (não checkForUpdatesAndNotify): evita notificação
  // nativa duplicada, já que a UI própria escuta 'update:available'.
  // .catch é necessário: sem nenhum Release publicado ainda no GitHub,
  // isso falha com 404 — esperado, não deve derrubar o app.
  autoUpdater.checkForUpdates().catch((err) => {
    console.error('[autoUpdater] Falha ao checar atualizações:', err.message);
  });

  autoUpdater.on('update-available', (info) => {
    window.webContents.send('update:available', info);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    window.webContents.send('update:progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    window.webContents.send('update:downloaded', info);
  });
}

// ------------------------------------------------------------------
// Tratamento global de erros — evita crash silencioso do Main Process
// ------------------------------------------------------------------
process.on('uncaughtException', (error) => {
  console.error('[uncaughtException]', error);
  if (mainWindow && !mainWindow.isDestroyed()) {
    dialog.showErrorBox(
      'C-Optimizer encontrou um erro inesperado',
      `Um problema interno ocorreu:\n\n${error.message}\n\nSe o app continuar instável, reinicie-o.`
    );
  }
});

process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});

// ------------------------------------------------------------------
// Janela principal
// ------------------------------------------------------------------
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: '#0F172A',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  registerSystemHandlers();
  registerTweaksHandlers();
  registerCleanupHandlers();
  registerSettingsHandlers();
  registerRestoreHandlers();
  registerAppsHandlers();
  registerAuthHandlers();
  registerDiskHandlers();

  createWindow();

  if (!isDev) {
    setupAutoUpdater(mainWindow);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      if (!isDev) {
        setupAutoUpdater(mainWindow);
      }
    }
  });
});

app.on('window-all-closed', () => {
  stopStatsStreaming();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

import { ipcMain } from 'electron';
import { installWingetPackage } from './winget.js'; // ajuste o caminho relativo se necessário

// Handler para instalar um pacote individual
ipcMain.handle('winget:install', async (event, appId) => {
  try {
    return await installWingetPackage(event.sender, appId);
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// Handler para verificar se o Winget está disponível no sistema
ipcMain.handle('winget:check-installed', async () => {
  return new Promise((resolve) => {
    const child = spawn('winget', ['--version'], { shell: true });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
});