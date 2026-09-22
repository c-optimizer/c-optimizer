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
      // Requer admin de verdade (arquivos do sistema) — antes usávamos fs
      // direto, que falhava silenciosamente para usuários não-admin.
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
      // Stop/clear/start em UM ÚNICO script elevado — evita 3 prompts de UAC
      // e corrige o bug anterior de stop/start rodarem sem privilégio.
      const script = `
Stop-Service -Name wuauserv -Force -ErrorAction SilentlyContinue
Remove-Item -Path '${wuPath}\\*' -Recurse -Force -ErrorAction SilentlyContinue
Start-Service -Name wuauserv -ErrorAction SilentlyContinue
      `.trim();
      await runCommandSmart(script, true, 60000);
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