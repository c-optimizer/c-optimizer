const { Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const store = require('../store');
const { log } = require('./logger');

let trayInstance = null;

function isMinimizeTrayEnabled() {
  const settings = store.get('settings', {});
  return !!settings.minimizeTray;
}

/**
 * Cria o ícone de bandeja e intercepta o evento de minimizar da janela:
 * se a opção "minimizar para bandeja" estiver ativa, a janela é ocultada
 * (some da barra de tarefas) em vez de só minimizar normalmente.
 */
function setupTray(mainWindow, iconPath) {
  if (trayInstance) return trayInstance;

  const image = nativeImage.createFromPath(iconPath);
  trayInstance = new Tray(image.isEmpty() ? undefined : image);
  trayInstance.setToolTip('C-Optimizer');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Abrir C-Optimizer',
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    { type: 'separator' },
    {
      label: 'Sair',
      click: () => {
        trayInstance.destroy();
        mainWindow.destroy();
        require('electron').app.quit();
      }
    }
  ]);

  trayInstance.setContextMenu(contextMenu);

  trayInstance.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  mainWindow.on('minimize', (event) => {
    if (isMinimizeTrayEnabled()) {
      event.preventDefault();
      mainWindow.hide();
      log.info('[tray] Janela minimizada para a bandeja.');
    }
  });

  return trayInstance;
}

function destroyTray() {
  if (trayInstance) {
    trayInstance.destroy();
    trayInstance = null;
  }
}

module.exports = { setupTray, destroyTray };