const { ipcMain } = require('electron');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const { runShellCommand, runCommandSmart } = require('../utils/shell');
const { withLicense } = require('../utils/licenseGuard');
const store = require('../store');

async function clearDirectoryContents(dirPath) {
  let freedBytes = 0;
  let skippedCount = 0;

  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return { freedBytes: 0, skippedCount: 0 };
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    try {
      const stat = await fs.stat(fullPath);
      if (entry.isDirectory()) {
        const sub = await clearDirectoryContents(fullPath);
        freedBytes += sub.freedBytes;
        skippedCount += sub.skippedCount;
        await fs.rmdir(fullPath).catch(() => {});
      } else {
        freedBytes += stat.size;
        await fs.unlink(fullPath);
      }
    } catch {
      skippedCount += 1;
    }
  }

  return { freedBytes, skippedCount };
}

/**
 * Localiza a pasta de instalação do Steam via registro. Retorna null se
 * o Steam não estiver instalado — o cleaner correspondente simplesmente
 * reporta "nada a limpar" nesse caso, sem erro.
 */
async function getSteamPath() {
  const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
try {
  $path = (Get-ItemProperty -Path "HKCU:\\Software\\Valve\\Steam" -Name "SteamPath" -ErrorAction Stop).SteamPath
  [PSCustomObject]@{ success = $true; exists = $true; value = $path } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $true; exists = $false; value = $null } | ConvertTo-Json -Compress
}
  `.trim();

  try {
    const { stdout } = await runShellCommand(script, 10000);
    const parsed = JSON.parse((stdout || '').trim());
    return parsed.exists ? parsed.value.replace(/\//g, '\\') : null;
  } catch {
    return null;
  }
}

const CLEANUP_TARGETS = {
  temp: {
    id: 'temp',
    label: '%temp%',
    async run() {
      return clearDirectoryContents(os.tmpdir());
    }
  },
  prefetch: {
    id: 'prefetch',
    label: 'Prefetch',
    async run() {
      if (os.platform() !== 'win32') return { freedBytes: 0, skippedCount: 0 };
      const prefetchPath = path.join(process.env.WINDIR || 'C:\\Windows', 'Prefetch');
      const script = `Remove-Item -Path '${prefetchPath}\\*.pf' -Force -ErrorAction SilentlyContinue`;
      await runCommandSmart(script, true, 30000);
      return { freedBytes: 0, skippedCount: 0, unmeasured: true };
    }
  },
  'recycle-bin': {
    id: 'recycle-bin',
    label: 'Lixeira',
    async run() {
      if (os.platform() !== 'win32') return { freedBytes: 0, skippedCount: 0 };
      await runShellCommand(`Clear-RecycleBin -Force -ErrorAction SilentlyContinue`, 20000);
      return { freedBytes: 0, skippedCount: 0, unmeasured: true };
    }
  },
  'wu-cache': {
    id: 'wu-cache',
    label: 'Cache do Windows Update',
    async run() {
      if (os.platform() !== 'win32') return { freedBytes: 0, skippedCount: 0 };
      const wuPath = path.join(process.env.WINDIR || 'C:\\Windows', 'SoftwareDistribution', 'Download');
      const script = `
Stop-Service -Name wuauserv -Force -ErrorAction SilentlyContinue
Remove-Item -Path '${wuPath}\\*' -Recurse -Force -ErrorAction SilentlyContinue
Start-Service -Name wuauserv -ErrorAction SilentlyContinue
      `.trim();
      await runCommandSmart(script, true, 60000);
      return { freedBytes: 0, skippedCount: 0, unmeasured: true };
    }
  },
  'discord-cache': {
    id: 'discord-cache',
    label: 'Cache do Discord',
    async run() {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      // Cobre Discord estável, PTB e Canary — cada um com pasta própria.
      const variants = ['discord', 'discordptb', 'discordcanary'];
      let totalFreed = 0;
      let totalSkipped = 0;

      for (const variant of variants) {
        const basePath = path.join(appData, variant);
        const subfolders = ['Cache', 'Code Cache', 'GPUCache', 'Local Storage', 'Session Storage'];
        for (const sub of subfolders) {
          const result = await clearDirectoryContents(path.join(basePath, sub));
          totalFreed += result.freedBytes;
          totalSkipped += result.skippedCount;
        }
      }

      return { freedBytes: totalFreed, skippedCount: totalSkipped };
    }
  },
  'steam-cache': {
    id: 'steam-cache',
    label: 'Cache da Steam',
    async run() {
      if (os.platform() !== 'win32') return { freedBytes: 0, skippedCount: 0 };
      const steamPath = await getSteamPath();
      if (!steamPath) return { freedBytes: 0, skippedCount: 0, unmeasured: true };

      const targets = [
        path.join(steamPath, 'steamapps', 'shadercache'),
        path.join(steamPath, 'htmlcache'),
        path.join(steamPath, 'dumps'),
        path.join(steamPath, 'appcache', 'httpcache')
      ];

      let totalFreed = 0;
      let totalSkipped = 0;
      for (const target of targets) {
        const result = await clearDirectoryContents(target);
        totalFreed += result.freedBytes;
        totalSkipped += result.skippedCount;
      }

      return { freedBytes: totalFreed, skippedCount: totalSkipped };
    }
  },
  'log-crash': {
    id: 'log-crash',
    label: 'Logs e Relatórios de Erro',
    async run() {
      if (os.platform() !== 'win32') return { freedBytes: 0, skippedCount: 0 };

      const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
      const userCrashDumps = path.join(localAppData, 'CrashDumps');
      const userResult = await clearDirectoryContents(userCrashDumps);

      // Pasta do WER pertence ao sistema — requer admin.
      const werPath = path.join(process.env.PROGRAMDATA || 'C:\\ProgramData', 'Microsoft', 'Windows', 'WER');
      const script = `Remove-Item -Path '${werPath}\\ReportArchive\\*','${werPath}\\ReportQueue\\*' -Recurse -Force -ErrorAction SilentlyContinue`;
      await runCommandSmart(script, true, 30000);

      return { freedBytes: userResult.freedBytes, skippedCount: userResult.skippedCount, unmeasured: true };
    }
  },
  'thumbnail-cache': {
    id: 'thumbnail-cache',
    label: 'Cache de Miniaturas e Ícones',
    async run() {
      if (os.platform() !== 'win32') return { freedBytes: 0, skippedCount: 0 };

      // Fecha o Explorer momentaneamente para liberar o lock dos arquivos
      // thumbcache_*.db, senão a exclusão falha silenciosamente na maioria
      // dos casos. O Explorer reinicia sozinho logo em seguida.
      const script = `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$explorerPath = "$env:LOCALAPPDATA\\Microsoft\\Windows\\Explorer"
Stop-Process -Name explorer -Force -ErrorAction SilentlyContinue
Start-Sleep -Milliseconds 800
Remove-Item -Path "$explorerPath\\thumbcache_*.db" -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$explorerPath\\iconcache_*.db" -Force -ErrorAction SilentlyContinue
Start-Process explorer.exe
      `.trim();

      await runCommandSmart(script, true, 20000);
      return { freedBytes: 0, skippedCount: 0, unmeasured: true };
    }
  },
  'recent-docs': {
    id: 'recent-docs',
    label: 'Documentos Recentes',
    async run() {
      const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
      const recentPath = path.join(appData, 'Microsoft', 'Windows', 'Recent');
      return clearDirectoryContents(recentPath);
    }
  },
  'font-cache': {
    id: 'font-cache',
    label: 'Cache de Fontes',
    async run() {
      if (os.platform() !== 'win32') return { freedBytes: 0, skippedCount: 0 };
      const script = `
Stop-Service -Name FontCache -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:LOCALAPPDATA\\FontCache\\*" -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -Path "$env:WINDIR\\ServiceProfiles\\LocalService\\AppData\\Local\\FontCache\\*" -Recurse -Force -ErrorAction SilentlyContinue
Start-Service -Name FontCache -ErrorAction SilentlyContinue
      `.trim();
      await runCommandSmart(script, true, 20000);
      return { freedBytes: 0, skippedCount: 0, unmeasured: true };
    }
  }
};

function registerCleanupHandlers() {
  ipcMain.handle('cleanup:get-targets', async () => {
    return Object.values(CLEANUP_TARGETS).map(({ id, label }) => ({ id, label }));
  });

  ipcMain.handle('cleanup:get-last-run', async () => {
    return store.get('lastCleanupAt', null);
  });

  ipcMain.handle('cleanup:scan', async () => {
    let tempSize = 0;
    try {
      const entries = await fs.readdir(os.tmpdir());
      for (const entry of entries) {
        try {
          const stat = await fs.stat(path.join(os.tmpdir(), entry));
          tempSize += stat.size;
        } catch { /* ignora */ }
      }
    } catch { /* %temp% inacessível */ }
    return { estimatedBytes: tempSize };
  });

  ipcMain.handle('cleanup:execute', withLicense(async (_event, targetIds) => {
    if (!Array.isArray(targetIds) || targetIds.length === 0) {
      return { success: false, error: 'Nenhum alvo de limpeza selecionado.' };
    }

    const results = {};
    let totalFreedBytes = 0;
    let hadError = false;

    for (const targetId of targetIds) {
      const target = CLEANUP_TARGETS[targetId];
      if (!target) {
        results[targetId] = { success: false, error: 'Alvo desconhecido.' };
        hadError = true;
        continue;
      }
      try {
        const { freedBytes, skippedCount, unmeasured } = await target.run();
        totalFreedBytes += freedBytes || 0;
        results[targetId] = { success: true, freedBytes, skippedCount, unmeasured: !!unmeasured };
      } catch (error) {
        console.error(`[cleanup:execute] Erro ao limpar "${targetId}":`, error.message);
        results[targetId] = { success: false, error: error.message };
        hadError = true;
      }
    }

    const now = new Date().toISOString();
    store.set('lastCleanupAt', now);

    return { success: !hadError, results, totalFreedBytes, lastCleanupAt: now };
  }));
}

module.exports = { registerCleanupHandlers };