const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { log } = require('./utils/logger');

const { registerSystemHandlers, stopStatsStreaming } = require('./handlers/systemHandlers');
const { registerTweaksHandlers } = require('./handlers/tweaksHandlers');
const { registerCleanupHandlers } = require('./handlers/cleanupHandlers');
const { registerSettingsHandlers } = require('./handlers/settingsHandlers');
const { registerRestoreHandlers } = require('./handlers/restoreHandlers');
const { registerAppsHandlers } = require('./handlers/appsHandlers');
const { registerAuthHandlers } = require('./handlers/authHandlers');
const { registerDiskHandlers } = require('./handlers/diskHandlers');
const { registerWingetHandlers } = require('./handlers/wingetHandlers');
const { registerSystemFixerHandlers } = require('./handlers/systemFixerHandlers');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow = null;

// ------------------------------------------------------------------
// Auto-updater (electron-updater + GitHub Releases)
// ------------------------------------------------------------------
autoUpdater.logger = log;
autoUpdater.autoDownload = false;

ipcMain.handle('update:start-download', () => autoUpdater.downloadUpdate());
ipcMain.handle('update:quit-and-install', () => autoUpdater.quitAndInstall());

function setupAutoUpdater(window) {
  if (!window) return;

  autoUpdater.checkForUpdates().catch((err) => {
    log.error('[autoUpdater] Falha ao checar atualizações:', err.message);
  });

  autoUpdater.on('update-available', (info) => {
    log.info('[autoUpdater] Atualização disponível:', info.version);
    window.webContents.send('update:available', info);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    window.webContents.send('update:progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('[autoUpdater] Atualização baixada:', info.version);
    window.webContents.send('update:downloaded', info);
  });
}

// ------------------------------------------------------------------
// Tratamento global de erros — evita crash silencioso do Main Process
// ------------------------------------------------------------------
process.on('uncaughtException', (error) => {
  log.error('[uncaughtException]', error);
  if (mainWindow && !mainWindow.isDestroyed()) {
    dialog.showErrorBox(
      'C-Optimizer encontrou um erro inesperado',
      `Um problema interno ocorreu:\n\n${error.message}\n\nSe o app continuar instável, reinicie-o.`
    );
  }
});

process.on('unhandledRejection', (reason) => {
  log.error('[unhandledRejection]', reason);
});

// ------------------------------------------------------------------
// Janela principal
// ------------------------------------------------------------------
function createWindow() {
  log.info(`Iniciando C-Optimizer (isDev=${isDev}, platform=${process.platform})`);

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
    log.info('Janela principal fechada.');
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
  registerWingetHandlers();
  registerSystemFixerHandlers();

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
  log.info('Encerrando C-Optimizer.');
  stopStatsStreaming();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});