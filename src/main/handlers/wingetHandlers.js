const { ipcMain, BrowserWindow, shell } = require('electron');
const { spawn, execSync } = require('child_process');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { withLicense } = require('../utils/licenseGuard');
const { isRunningAsAdmin } = require('../utils/shell');
const { log } = require('../utils/logger');

const WINGET_CATALOG = [
  // ==========================
  // Runtimes
  // ==========================
  { id: 'Microsoft.VCRedist.2015+.x64', name: 'Visual C++ Redistributable (x64)', category: 'Runtimes' },
  { id: 'Microsoft.VCRedist.2015+.x86', name: 'Visual C++ Redistributable (x86)', category: 'Runtimes' },
  { id: 'Microsoft.DotNet.DesktopRuntime.8', name: '.NET Desktop Runtime 8', category: 'Runtimes' },
  { id: 'Microsoft.DotNet.DesktopRuntime.6', name: '.NET Desktop Runtime 6', category: 'Runtimes' },
  { id: 'Microsoft.DirectX', name: 'DirectX End-User Runtime', category: 'Runtimes' },
  { id: 'Microsoft.WindowsDesktopApp.Runtime', name: 'Windows Desktop Runtime', category: 'Runtimes' },
  { id: 'EclipseAdoptium.Temurin.21.JRE', name: 'Java Runtime (Eclipse Temurin 21)', category: 'Runtimes' },
  { id: 'EclipseAdoptium.Temurin.17.JRE', name: 'Java Runtime (Eclipse Temurin 17)', category: 'Runtimes' },
  { id: 'Oracle.JavaRuntimeEnvironment', name: 'Java Runtime (Oracle JRE)', category: 'Runtimes' },
  { id: 'OpenAL.OpenAL', name: 'OpenAL (biblioteca de áudio)', category: 'Runtimes' },

  // ==========================
  // Navegadores
  // ==========================
  { id: 'Google.Chrome', name: 'Google Chrome', category: 'Navegadores' },
  { id: 'Mozilla.Firefox', name: 'Mozilla Firefox', category: 'Navegadores' },
  { id: 'Brave.Brave', name: 'Brave Browser', category: 'Navegadores' },
  { id: 'Opera.OperaGX', name: 'Opera GX (para gamers)', category: 'Navegadores' },
  { id: 'Microsoft.Edge', name: 'Microsoft Edge', category: 'Navegadores' },

  // ==========================
  // Comunicação
  // ==========================
  { id: 'Discord.Discord', name: 'Discord', category: 'Comunicação' },
  { id: 'WhatsApp.WhatsApp', name: 'WhatsApp Desktop', category: 'Comunicação' },
  { id: 'Telegram.TelegramDesktop', name: 'Telegram Desktop', category: 'Comunicação' },
  { id: 'Zoom.Zoom', name: 'Zoom', category: 'Comunicação' },
  { id: 'SlackTechnologies.Slack', name: 'Slack', category: 'Comunicação' },
  { id: 'Microsoft.Teams', name: 'Microsoft Teams', category: 'Comunicação' },
  { id: 'TeamSpeak.TeamSpeak', name: 'TeamSpeak 3', category: 'Comunicação' },
  { id: 'Mumble.Mumble', name: 'Mumble (voz open-source)', category: 'Comunicação' },
  { id: 'Signal.Signal', name: 'Signal Desktop', category: 'Comunicação' },
  { id: 'Element.Element', name: 'Element (Matrix)', category: 'Comunicação' },

  // ==========================
  // Mídia / Streaming / Música
  // ==========================
  { id: 'OBSProject.OBSStudio', name: 'OBS Studio', category: 'Mídia' },
  { id: 'VideoLAN.VLC', name: 'VLC Media Player', category: 'Mídia' },
  { id: 'Spotify.Spotify', name: 'Spotify', category: 'Mídia', requiresUserContext: true },
  { id: 'Deezer.Deezer', name: 'Deezer Desktop', category: 'Mídia' },
  { id: 'GIMP.GIMP', name: 'GIMP', category: 'Mídia' },
  { id: 'Audacity.Audacity', name: 'Audacity', category: 'Mídia' },
  { id: 'PeterPawlowski.foobar2000', name: 'foobar2000', category: 'Mídia' },
  { id: 'Streamlabs.Streamlabs', name: 'Streamlabs Desktop', category: 'Mídia' },

  // ==========================
  // Jogos / Launchers
  // ==========================
  { id: 'Valve.Steam', name: 'Steam', category: 'Jogos' },
  { id: 'EpicGames.EpicGamesLauncher', name: 'Epic Games Launcher', category: 'Jogos' },
  { id: 'GOG.Galaxy', name: 'GOG Galaxy', category: 'Jogos' },
  { id: 'Ubisoft.Connect', name: 'Ubisoft Connect', category: 'Jogos' },
  { id: 'RockstarGames.Launcher', name: 'Rockstar Games Launcher', category: 'Jogos' },
  { id: 'ElectronicArts.EADesktop', name: 'EA Desktop', category: 'Jogos' },
  { id: 'Blizzard.BattleNet', name: 'Battle.net (Blizzard)', category: 'Jogos', batchUnsafe: true, note: 'Requer caminho de instalação. Instale manualmente.' },
  { id: 'Nvidia.App', name: 'NVIDIA App', category: 'Jogos' },
  { id: 'Playnite.Playnite', name: 'Playnite (biblioteca unificada)', category: 'Jogos' },
  { id: 'Sony.PlayStationPlus', name: 'PlayStation Plus', category: 'Jogos' },

  // ==========================
  // Utilitários
  // ==========================
  { id: '7zip.7zip', name: '7-Zip', category: 'Utilitários' },
  { id: 'RARLab.WinRAR', name: 'WinRAR', category: 'Utilitários' },
  { id: 'PeaZip.PeaZip', name: 'PeaZip', category: 'Utilitários' },
  { id: 'Notepad++.Notepad++', name: 'Notepad++', category: 'Utilitários' },
  { id: 'Rufus.Rufus', name: 'Rufus (pendrive bootável)', category: 'Utilitários' },
  { id: 'Ventoy.Ventoy', name: 'Ventoy (multi-boot USB)', category: 'Utilitários' },
  { id: 'CPUID.CPU-Z', name: 'CPU-Z', category: 'Utilitários' },
  { id: 'TechPowerUp.GPU-Z', name: 'GPU-Z', category: 'Utilitários' },
  { id: 'REALiX.HWiNFO', name: 'HWiNFO (monitoramento avançado)', category: 'Utilitários' },
  { id: 'CPUID.HWMonitor', name: 'HWMonitor', category: 'Utilitários' },
  { id: 'CrystalDewWorld.CrystalDiskInfo', name: 'CrystalDiskInfo', category: 'Utilitários' },
  { id: 'CrystalDewWorld.CrystalDiskMark', name: 'CrystalDiskMark (benchmark de disco)', category: 'Utilitários' },
  { id: 'ShareX.ShareX', name: 'ShareX (captura de tela)', category: 'Utilitários' },
  { id: 'Greenshot.Greenshot', name: 'Greenshot (captura de tela)', category: 'Utilitários' },
  { id: 'QL-Win.QuickLook', name: 'QuickLook (preview com Espaço)', category: 'Utilitários' },
  { id: 'voidtools.Everything', name: 'Everything (busca instantânea de arquivos)', category: 'Utilitários' },
  { id: 'AntibodySoftware.WizTree', name: 'WizTree (analisador de disco)', category: 'Utilitários' },
  { id: 'Bitwarden.Bitwarden', name: 'Bitwarden (gerenciador de senhas)', category: 'Utilitários' },
  { id: 'KeePassXCTeam.KeePassXC', name: 'KeePassXC', category: 'Utilitários' },
  { id: 'FxSound.FxSound', name: 'FxSound (melhorador de áudio)', category: 'Utilitários' },
  { id: 'EqualizerAPO.EqualizerAPO', name: 'EqualizerAPO', category: 'Utilitários' },
  { id: 'VB-Audio.Voicemeeter', name: 'Voicemeeter (mixer de áudio)', category: 'Utilitários' },
  { id: 'AutoHotkey.AutoHotkey', name: 'AutoHotkey (automação)', category: 'Utilitários' },
  { id: 'Microsoft.PowerToys', name: 'Microsoft PowerToys', category: 'Utilitários' },
  { id: 'Ditto.Ditto', name: 'Ditto (histórico de clipboard)', category: 'Utilitários' },
  { id: 'File-New-Project.EarTrumpet', name: 'EarTrumpet (mixer por app)', category: 'Utilitários' },
  { id: 'Nilesoft.Shell', name: 'Nilesoft Shell (menu de contexto)', category: 'Utilitários' },
  { id: 'Lightshot.Lightshot', name: 'Lightshot (captura de tela rápida)', category: 'Utilitários' },

  // ==========================
  // Gaming Tools
  // ==========================
  { id: 'Nefarius.DsHidMini', name: 'DsHidMini (controle PS3/PS4 no PC)', category: 'Gaming Tools' },
  { id: 'Ryochan7.DS4Windows', name: 'DS4Windows (DualShock no PC)', category: 'Gaming Tools' },
  { id: 'Guru3D.Afterburner', name: 'MSI Afterburner', category: 'Gaming Tools' },
  { id: 'Rem0o.FanControl', name: 'Fan Control (curvas de fan)', category: 'Gaming Tools' },
  { id: 'NexusMods.Vortex', name: 'Vortex (mods Nexus)', category: 'Gaming Tools' },
  { id: 'ModOrganizer.ModOrganizer2', name: 'Mod Organizer 2', category: 'Gaming Tools' },
  { id: 'AMD.RyzenMaster', name: 'AMD Ryzen Master', category: 'Gaming Tools' },

  // ==========================
  // Desenvolvimento
  // ==========================
  { id: 'Microsoft.VisualStudioCode', name: 'Visual Studio Code', category: 'Desenvolvimento' },
  { id: 'Git.Git', name: 'Git', category: 'Desenvolvimento' },
  { id: 'OpenJS.NodeJS.LTS', name: 'Node.js LTS', category: 'Desenvolvimento' },
  { id: 'Python.Python.3.12', name: 'Python 3.12', category: 'Desenvolvimento' },
  { id: 'Docker.DockerDesktop', name: 'Docker Desktop', category: 'Desenvolvimento' },
  { id: 'Postman.Postman', name: 'Postman', category: 'Desenvolvimento' },
  { id: 'dbeaver.dbeaver-ce', name: 'DBeaver Community (cliente SQL)', category: 'Desenvolvimento' },

  // ==========================
  // Criatividade
  // ==========================
  { id: 'KDE.Krita', name: 'Krita (pintura digital)', category: 'Criatividade' },
  { id: 'Inkscape.Inkscape', name: 'Inkscape (vetorial)', category: 'Criatividade' },
  { id: 'BlenderFoundation.Blender', name: 'Blender', category: 'Criatividade' },
  { id: 'Canva.Canva', name: 'Canva Desktop', category: 'Criatividade' },
  { id: 'KDE.Kdenlive', name: 'Kdenlive (edição de vídeo)', category: 'Criatividade' },
  { id: 'HandBrake.HandBrake', name: 'HandBrake (conversor de vídeo)', category: 'Criatividade' },
];

/**
 * Detecta o winget em múltiplos locais. O `execSync('winget --version')`
 * falha silenciosamente em alguns Windows 10 com PATH mal configurado,
 * mesmo quando o winget está instalado em %LOCALAPPDATA%\Microsoft\WindowsApps.
 */
function isWingetAvailable() {
  try {
    execSync('winget --version', { stdio: 'ignore', windowsHide: true });
    return true;
  } catch { /* continua */ }

  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const candidate = path.join(localAppData, 'Microsoft', 'WindowsApps', 'winget.exe');
    try {
      if (fs.existsSync(candidate)) return true;
    } catch { /* continua */ }
  }

  return false;
}

/**
 * Instala um app via winget respeitando flags do catálogo:
 *  - batchUnsafe:        requer input interativo (caminho de instalação). Pulado em lote.
 *  - requiresUserContext: falha sob admin (ex: Spotify). Pulado se o app está elevado.
 *  - Timeout de 5min por app: evita travar a fila em app que espera input.
 */
function installApp(appId, window, catalogEntry) {
  return new Promise((resolve) => {
    if (catalogEntry?.batchUnsafe) {
      if (window && !window.isDestroyed()) {
        window.webContents.send('winget:progress', {
          appId,
          line: `[${appId}] Pulado: requer instalação manual (exige input/caminho).`,
        });
      }
      return resolve({ appId, success: false, skipped: true, error: 'Requer instalação manual.' });
    }

    if (catalogEntry?.requiresUserContext && isRunningAsAdmin()) {
      if (window && !window.isDestroyed()) {
        window.webContents.send('winget:progress', {
          appId,
          line: `[${appId}] Pulado: este instalador não funciona em contexto administrativo. Execute o C-Optimizer sem admin para instalá-lo.`,
        });
      }
      return resolve({ appId, success: false, skipped: true, error: 'Requer execução sem admin.' });
    }

    const args = ['install', '--id', appId, '-e', '--silent', '--accept-source-agreements', '--accept-package-agreements'];
    const child = spawn('winget', args, { windowsHide: true, shell: true });

    const emit = (line) => {
      if (window && !window.isDestroyed()) {
        window.webContents.send('winget:progress', { appId, line: line.toString().trim() });
      }
    };

    child.stdout?.on('data', emit);
    child.stderr?.on('data', emit);

    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      try { child.kill(); } catch { /* ignora */ }
      emit(`[${appId}] Timeout: instalação não concluída em 5 minutos.`);
      resolve({ appId, success: false, error: 'Timeout após 5 minutos.' });
    }, 5 * 60 * 1000);

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      if (code === 0 || code === -1978335189) resolve({ appId, success: true });
      else resolve({ appId, success: false, error: `winget saiu com código ${code}` });
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
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
      const catalogEntry = WINGET_CATALOG.find((a) => a.id === appId);
      const result = await installApp(appId, window, catalogEntry);
      results.push(result);
    }

    const failed = results.filter((r) => !r.success && !r.skipped);
    const skipped = results.filter((r) => r.skipped);

    return {
      success: failed.length === 0,
      installed: results.filter((r) => r.success).map((r) => r.appId),
      skipped: skipped.map((r) => ({ appId: r.appId, reason: r.error })),
      failed,
    };
  }));
}

module.exports = { registerWingetHandlers };