const { ipcMain } = require('electron');
const { exec } = require('child_process');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const util = require('util');
const store = require('../store');

const execAsync = util.promisify(exec);

function encodePowerShellCommand(command) {
  return Buffer.from(command, 'utf16le').toString('base64');
}

async function runShellCommand(command) {
  const platform = os.platform();
  if (platform === 'win32') {
    const encoded = encodePowerShellCommand(command);
    const psCommand = `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
    return execAsync(psCommand, { windowsHide: true, timeout: 30000 });
  }
  return execAsync(command, { shell: '/bin/bash', timeout: 30000 });
}

/**
 * Apaga recursivamente o CONTEÚDO de uma pasta (não a pasta em si),
 * ignorando arquivos individuais que falharem (em uso, sem permissão, etc.)
 * e somando quantos bytes foram efetivamente liberados.
 */
async function clearDirectoryContents(dirPath) {
  let freedBytes = 0;
  let skippedCount = 0;

  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    // Pasta não existe ou sem acesso — não é um erro fatal para a limpeza geral
    return { freedBytes: 0, skippedCount: 0 };
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    try {
      const stat = await fs.stat(fullPath);
      if (entry.isDirectory()) {
        // Soma o tamanho de dentro da subpasta antes de remover
        const sub = await clearDirectoryContents(fullPath);
        freedBytes += sub.freedBytes;
        skippedCount += sub.skippedCount;
        await fs.rmdir(fullPath).catch(() => {});
      } else {
        freedBytes += stat.size;
        await fs.unlink(fullPath);
      }
    } catch (error) {
      // Arquivo em uso, sem permissão, etc. — pula e continua
      skippedCount += 1;
    }
  }

  return { freedBytes, skippedCount };
}

/**
 * Definição dos alvos de limpeza. Cada `run()` retorna { freedBytes, skippedCount }.
 */
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
      const platform = os.platform();
      if (platform !== 'win32') {
        return { freedBytes: 0, skippedCount: 0 };
      }
      const prefetchPath = path.join(process.env.WINDIR || 'C:\\Windows', 'Prefetch');
      return clearDirectoryContents(prefetchPath);
    }
  },
  'recycle-bin': {
    id: 'recycle-bin',
    label: 'Lixeira',
    async run() {
      const platform = os.platform();
      if (platform !== 'win32') {
        return { freedBytes: 0, skippedCount: 0 };
      }
      // Clear-RecycleBin não informa bytes liberados; estimamos como "sucesso" sem métrica exata
      await runShellCommand(`Clear-RecycleBin -Force -ErrorAction SilentlyContinue`);
      return { freedBytes: 0, skippedCount: 0, unmeasured: true };
    }
  },
  'wu-cache': {
    id: 'wu-cache',
    label: 'Cache do Windows Update',
    async run() {
      const platform = os.platform();
      if (platform !== 'win32') {
        return { freedBytes: 0, skippedCount: 0 };
      }
      const wuPath = path.join(process.env.WINDIR || 'C:\\Windows', 'SoftwareDistribution', 'Download');

      // Para o serviço antes de limpar (arquivos ficam travados enquanto ele roda)
      await runShellCommand(`Stop-Service -Name wuauserv -Force -ErrorAction SilentlyContinue`).catch(() => {});
      const result = await clearDirectoryContents(wuPath);
      await runShellCommand(`Start-Service -Name wuauserv -ErrorAction SilentlyContinue`).catch(() => {});

      return result;
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
    // Scan "leve": apenas estima tamanho do %temp% sem apagar nada,
    // usado se a UI quiser mostrar tamanho estimado antes de confirmar.
    let tempSize = 0;
    try {
      const entries = await fs.readdir(os.tmpdir());
      for (const entry of entries) {
        try {
          const stat = await fs.stat(path.join(os.tmpdir(), entry));
          tempSize += stat.size;
        } catch {
          // ignora entradas inacessíveis
        }
      }
    } catch {
      // %temp% inacessível — mantém tempSize em 0
    }
    return { estimatedBytes: tempSize };
  });

  ipcMain.handle('cleanup:execute', async (_event, targetIds) => {
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

    return {
      success: !hadError,
      results,
      totalFreedBytes,
      lastCleanupAt: now
    };
  });
}

module.exports = {
  registerCleanupHandlers
};