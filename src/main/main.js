const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');

const { registerSystemHandlers, stopStatsStreaming } = require('./handlers/systemHandlers');
const { registerTweaksHandlers } = require('./handlers/tweaksHandlers');
const { registerCleanupHandlers } = require('./handlers/cleanupHandlers');
const { registerSettingsHandlers } = require('./handlers/settingsHandlers');
const { registerRestoreHandlers } = require('./handlers/restoreHandlers');
const { registerAppsHandlers } = require('./handlers/appsHandlers');
const { registerAuthHandlers } = require('./handlers/authHandlers');

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow = null;

// Rede de segurança: captura qualquer erro não tratado no Main Process
// para evitar que o app trave silenciosamente sem explicação ao usuário.
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

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopStatsStreaming();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});