const { ipcMain, BrowserWindow, shell } = require('electron');
const { spawn, execSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { withLicense } = require('../utils/licenseGuard');
const { log } = require('../utils/logger');

const WINGET_CATALOG = [
  // Runtimes
  { id: 'Microsoft.VCRedist.2015+.x64', name: 'Visual C++ Redistributable (x64)', category: 'Runtimes' },
  { id: 'Microsoft.VCRedist.2015+.x86', name: 'Visual C++ Redistributable (x86)', category: 'Runtimes' },
  { id: 'Microsoft.DotNet.DesktopRuntime.8', name: '.NET Desktop Runtime 8', category: 'Runtimes' },
  { id: 'Microsoft.DotNet.DesktopRuntime.6', name: '.NET Desktop Runtime 6', category: 'Runtimes' },
  { id: 'Microsoft.DirectX', name: 'DirectX End-User Runtime', category: 'Runtimes' },
  { id: 'Microsoft.WindowsDesktopApp.Runtime', name: 'Windows Desktop Runtime', category: 'Runtimes' },

  // Navegadores
  { id: 'Google.Chrome', name: 'Google Chrome', category: 'Navegadores' },
  { id: 'Mozilla.Firefox', name: 'Mozilla Firefox', category: 'Navegadores' },
  { id: 'Brave.Brave', name: 'Brave Browser', category: 'Navegadores' },
  { id: 'Opera.OperaGX', name: 'Opera GX', category: 'Navegadores' },

  // Comunicação
  { id: 'Discord.Discord', name: 'Discord', category: 'Comunicação' },
  { id: 'WhatsApp.WhatsApp', name: 'WhatsApp Desktop', category: 'Comunicação' },
  { id: 'Telegram.TelegramDesktop', name: 'Telegram Desktop', category: 'Comunicação' },
  { id: 'Zoom.Zoom', name: 'Zoom', category: 'Comunicação' },
  { id: 'SlackTechnologies.Slack', name: 'Slack', category: 'Comunicação' },
  { id: 'Microsoft.Teams', name: 'Microsoft Teams', category: 'Comunicação' },

  // Mídia
  { id: 'OBSProject.OBSStudio', name: 'OBS Studio', category: 'Mídia' },
  { id: 'VideoLAN.VLC', name: 'VLC Media Player', category: 'Mídia' },
  { id: 'Spotify.Spotify', name: 'Spotify', category: 'Mídia' },
  { id: 'GIMP.GIMP', name: 'GIMP', category: 'Mídia' },
  { id: 'Audacity.Audacity', name: 'Audacity', category: 'Mídia' },

  // Jogos
  { id: 'Valve.Steam', name: 'Steam', category: 'Jogos' },
  { id: 'EpicGames.EpicGamesLauncher', name: 'Epic Games Launcher', category: 'Jogos' },
  { id: 'GOG.Galaxy', name: 'GOG Galaxy', category: 'Jogos' },
  { id: 'Nvidia.GeForceExperience', name: 'NVIDIA GeForce Experience', category: 'Jogos' },
  { id: 'ElectronicArts.EADesktop', name: 'EA Desktop', category: 'Jogos' },

  // Utilitários
  { id: '7zip.7zip', name: '7-Zip', category: 'Utilitários' },
  { id: 'RARLab.WinRAR', name: 'WinRAR', category: 'Utilitários' },
  { id: 'Notepad++.Notepad++', name: 'Notepad++', category: 'Utilitários' },
  { id: 'Rufus.Rufus', name: 'Rufus (criador de pendrive bootável)', category: 'Utilitários' },
  { id: 'CPUID.CPU-Z', name: 'CPU-Z', category: 'Utilitários' },
  { id: 'TechPowerUp.GPU-Z', name: 'GPU-Z', category: 'Utilitários' },
  { id: 'CrystalDewWorld.CrystalDiskInfo', name: 'CrystalDiskInfo', category: 'Utilitários' },
  { id: 'ShareX.ShareX', name: 'ShareX (captura de tela)', category: 'Utilitários' },
  { id: 'Bitwarden.Bitwarden', name: 'Bitwarden (gerenciador de senhas)', category: 'Utilitários' },
];

/**
 * Detecta o winget em múltiplos locais. O `execSync('winget --version')`
 * falha silenciosamente em alguns Windows 10 com PATH mal configurado,
 * mesmo quando o winget está instalado em %LOCALAPPDATA%\Microsoft\WindowsApps.
 */
function isWingetAvailable() {
  // 1) PATH global.
  try {
    execSync('winget --version', { stdio: 'ignore', windowsHide: true });
    return true;
  } catch { /* continua */ }

  // 2) Path padrão do App Installer no Windows 10/11.
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const candidate = path.join(localAppData, 'Microsoft', 'WindowsApps', 'winget.exe');
    try {
      if (fs.existsSync(candidate)) return true;
    } catch { /* continua */ }
  }

  return false;
}

function installApp(appId, window) {
  return new Promise((resolve) => {
    const args = ['install', '--id', appId, '-e', '--silent', '--accept-source-agreements', '--accept-package-agreements'];
    const child = spawn('winget', args, { windowsHide: true, shell: true });

    const emit = (line) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send('winget:progress', { appId, line: line.toString().trim() });
      }
    };

    child.stdout?.on('data', emit);
    child.stderr?.on('data', emit);

    child.on('close', (code) => {
      // 0 = sucesso. -1978335189 = "já instalado" (não é erro).
      if (code === 0 || code === -1978335189) resolve({ appId, success: true });
      else resolve({ appId, success: false, error: `winget saiu com código ${code}` });
    });

    child.on('error', (err) => {
      log.error(`[winget] Erro ao instalar "${appId}":`, err.message);
      resolve({ appId, success: false, error: err.message });
    });
  });
}

function registerWingetHandlers() {
  ipcMain.handle('winget:check-installed', async () => {
    if (os.platform() !== 'win32') return { available: false, reason: 'Disponível apenas no Windows.' };
    return { available: isWingetAvailable() };
  });

  ipcMain.handle('winget:get-catalog', async () => WINGET_CATALOG);

  // Abre a página do "App Installer" na Microsoft Store. É o pacote que
  // fornece o winget no Windows 10. O `ms-windows-store://` é um protocolo
  // registrado pelo próprio Windows, não precisa de permissão especial.
  ipcMain.handle('winget:open-installer', withLicense(async () => {
    if (os.platform() !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    try {
      await shell.openExternal('ms-windows-store://pdp/?ProductId=9NBLGGH4NNS1');
      return { success: true };
    } catch (err) {
      log.error('[winget:open-installer] Falha ao abrir Store:', err.message);
      return { success: false, error: 'Não foi possível abrir a Microsoft Store.' };
    }
  }));

  ipcMain.handle('winget:install', withLicense(async (event, appIds) => {
    if (!Array.isArray(appIds) || appIds.length === 0) return { success: false, error: 'Nenhum aplicativo selecionado.' };
    if (os.platform() !== 'win32') return { success: false, error: 'Disponível apenas no Windows.' };
    if (!isWingetAvailable()) {
      log.error('[winget:install] winget não encontrado.');
      return {
        success: false,
        error: 'winget não encontrado neste sistema. Instale o "App Installer" pela Microsoft Store para habilitar este módulo.'
      };
    }

    const window = BrowserWindow.fromWebContents(event.sender);
    const results = [];
    for (const appId of appIds) {
      const result = await installApp(appId, window);
      results.push(result);
    }

    const failed = results.filter((r) => !r.success);
    return {
      success: failed.length === 0,
      installed: results.filter((r) => r.success).map((r) => r.appId),
      failed
    };
  }));
}

module.exports = { registerWingetHandlers };