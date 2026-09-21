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

// Configuração de logs do Auto-Updater
autoUpdater.logger = require('electron-log');
autoUpdater.logger.transports.file.level = 'info';
autoUpdater.autoDownload = false;

function setupAutoUpdater(window) {
  if (!window) return;

  // Procura por atualizações ao iniciar o app
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', (info) => {
    window.webContents.send('update:available', info);
  });

  autoUpdater.on('download-progress', (progressObj) => {
    window.webContents.send('update:progress', progressObj);
  });

  autoUpdater.on('update-downloaded', (info) => {
    window.webContents.send('update:downloaded', info);
  });

  ipcMain.handle('update:start-download', () => {
    autoUpdater.downloadUpdate();
  });

  ipcMain.handle('update:quit-and-install', () => {
    autoUpdater.quitAndInstall();
  });
}

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow = null;

// Rede de segurança: captura qualquer erro não tratado no Main Process
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

  createWindow();

  // Inicializa o auto-updater apenas em produção (app empacotado)
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