const { ipcMain, BrowserWindow } = require('electron');
const { spawn, execSync } = require('child_process');
const os = require('os');
const { withLicense } = require('../utils/licenseGuard');

const WINGET_CATALOG = [
  { id: 'Microsoft.VCRedist.2015+.x64', name: 'Visual C++ Redistributable (x64)', category: 'Runtimes' },
  { id: 'Microsoft.VCRedist.2015+.x86', name: 'Visual C++ Redistributable (x86)', category: 'Runtimes' },
  { id: 'Microsoft.DotNet.DesktopRuntime.8', name: '.NET Desktop Runtime 8', category: 'Runtimes' },
  { id: 'Microsoft.DirectX', name: 'DirectX End-User Runtime', category: 'Runtimes' },
  { id: 'Google.Chrome', name: 'Google Chrome', category: 'Navegadores' },
  { id: 'Brave.Brave', name: 'Brave Browser', category: 'Navegadores' },
  { id: 'Discord.Discord', name: 'Discord', category: 'Comunicação' },
  { id: 'OBSProject.OBSStudio', name: 'OBS Studio', category: 'Mídia' },
  { id: 'VideoLAN.VLC', name: 'VLC Media Player', category: 'Mídia' },
  { id: 'Valve.Steam', name: 'Steam', category: 'Jogos' },
  { id: 'Nvidia.GeForceExperience', name: 'NVIDIA GeForce Experience', category: 'Jogos' },
  { id: '7zip.7zip', name: '7-Zip', category: 'Utilitários' }
];

function isWingetAvailable() {
  try {
    execSync('winget --version', { stdio: 'ignore', windowsHide: true });
    return true;
  } catch {
    return false;
  }
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
      if (code === 0 || code === -1978335189) resolve({ appId, success: true });
      else resolve({ appId, success: false, error: `winget saiu com código ${code}` });
    });

    child.on('error', (err) => resolve({ appId, success: false, error: err.message }));
  });
}

function registerWingetHandlers() {
  ipcMain.handle('winget:check-installed', async () => {
    if (os.platform() !== 'win32') return { available: false, reason: 'Disponível apenas no Windows.' };
    return { available: isWingetAvailable() };
  });

  ipcMain.handle('winget:get-catalog', async () => WINGET_CATALOG);

  ipcMain.handle('winget:install', withLicense(async (event, appIds) => {
    if (!Array.isArray(appIds) || appIds.length === 0) return { success: false, error: 'Nenhum aplicativo selecionado.' };
    if (os.platform() !== 'win32') return { success: false, error: 'Disponível apenas no Windows.' };
    if (!isWingetAvailable()) {
      return { success: false, error: 'winget não foi encontrado no PATH deste sistema. Atualize o App Installer pela Microsoft Store.' };
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