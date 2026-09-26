const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');
const store = require('../store');
const { log } = require('./logger');

let trayInstance = null;
let isQuitting = false;

function isMinimizeTrayEnabled() {
  const settings = store.get('settings', {});
  return !!settings.minimizeTray;
}

/**
 * Em produção, a pasta 'build/' (usada pelo electron-builder só como
 * buildResources) NÃO é copiada para dentro do pacote final — por isso
 * o ícone precisa vir de process.resourcesPath (via extraResources no
 * package.json) quando empacotado, e do caminho normal do projeto em dev.
 */
function resolveIconPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'trayIcon.ico');
  }
  return path.join(__dirname, '../../../build/icon.ico');
}

function setupTray(mainWindow) {
  if (trayInstance) return trayInstance;

  const iconPath = resolveIconPath();
  const image = nativeImage.createFromPath(iconPath);

  if (image.isEmpty()) {
    log.error(`[tray] Ícone não encontrado em: ${iconPath} — a bandeja pode não aparecer corretamente.`);
  }

  trayInstance = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
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
        isQuitting = true;
        app.quit();
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

  // Minimizar (botão _) segue o comportamento padrão do Windows — não
  // interceptamos mais esse evento.
  //
  // Fechar (X) esconde para a bandeja em vez de encerrar, se a opção
  // estiver ativa. app.quit() (via menu da bandeja) sempre fecha de
  // verdade, graças à flag isQuitting marcada antes de chamá-lo.
  mainWindow.on('close', (event) => {
    if (!isQuitting && isMinimizeTrayEnabled()) {
      event.preventDefault();
      mainWindow.hide();
      log.info('[tray] Janela fechada pelo usuário — minimizada para a bandeja.');
    }
  });

  app.on('before-quit', () => {
    isQuitting = true;
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