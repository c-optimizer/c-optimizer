const { ipcMain, BrowserWindow, shell } = require('electron');
const si = require('systeminformation');
const { isRunningAsAdmin, runShellCommand } = require('../utils/shell');
const os = require('os');

const STATS_INTERVAL_MS = 2000;
let statsIntervalHandle = null;

async function collectStats() {
  const [cpuLoad, mem, fsSize, graphics] = await Promise.all([
    si.currentLoad(), si.mem(), si.fsSize(), si.graphics()
  ]);
  const cpuPercent = Math.round(cpuLoad.currentLoad);
  const ramTotalGB = mem.total / (1024 ** 3);
  const ramUsedGB = (mem.total - mem.available) / (1024 ** 3);
  const ramPercent = Math.round((ramUsedGB / ramTotalGB) * 100);
  const relevantDisks = fsSize.filter((d) => d.size >= 1024 ** 3 && d.type !== 'network' && !d.mount?.startsWith('\\\\'));
  const totalStorage = relevantDisks.reduce((a, d) => a + d.size, 0);
  const usedStorage = relevantDisks.reduce((a, d) => a + d.used, 0);
  const storageTotalGB = totalStorage / (1024 ** 3);
  const storageUsedGB = usedStorage / (1024 ** 3);
  const storagePercent = storageTotalGB > 0 ? Math.round((storageUsedGB / storageTotalGB) * 100) : 0;
  const gpuController = graphics.controllers?.[0];
  let gpuPercent = 0;
  if (gpuController && typeof gpuController.utilizationGpu === 'number') gpuPercent = Math.round(gpuController.utilizationGpu);
  else if (gpuController?.memoryUsed && gpuController?.memoryTotal) gpuPercent = Math.round((gpuController.memoryUsed / gpuController.memoryTotal) * 100);

  return {
    cpu: { percent: cpuPercent },
    gpu: { percent: gpuPercent },
    ram: { percent: ramPercent, usedGB: Number(ramUsedGB.toFixed(1)), totalGB: Number(ramTotalGB.toFixed(1)) },
    storage: { percent: storagePercent, usedGB: Number(storageUsedGB.toFixed(0)), totalGB: Number(storageTotalGB.toFixed(0)) },
    timestamp: Date.now()
  };
}

async function collectStaticInfo() {
  const [cpu, graphics, osInfo, mem] = await Promise.all([si.cpu(), si.graphics(), si.osInfo(), si.mem()]);
  const gpuController = graphics.controllers?.[0];
  return {
    cpu: { model: `${cpu.manufacturer} ${cpu.brand}`.trim(), cores: cpu.cores, physicalCores: cpu.physicalCores, speed: cpu.speed },
    gpu: { model: gpuController?.model || 'GPU não detectada', vendor: gpuController?.vendor || '', vram: gpuController?.vram ? Math.round(gpuController.vram / 1024) : null },
    ram: { totalGB: Number((mem.total / (1024 ** 3)).toFixed(1)) },
    os: { platform: osInfo.platform, distro: osInfo.distro, release: osInfo.release, arch: osInfo.arch, hostname: osInfo.hostname, kernel: osInfo.kernel }
  };
}

/**
 * Compara velocidade configurada vs nominal da RAM (estimativa de XMP/DOCP)
 * e detecta modelo/fabricante da placa-mãe via WMI, para montar o link de
 * busca no YouTube ("como ativar XMP na BIOS <fabricante> <modelo>").
 */
async function getMemoryProfile() {
  if (os.platform() !== 'win32') return { supported: false };

  const script = `
$mem = Get-CimInstance Win32_PhysicalMemory | Select-Object ConfiguredClockSpeed, Speed
$board = Get-CimInstance Win32_BaseBoard | Select-Object Manufacturer, Product
[PSCustomObject]@{ Memory = $mem; Board = $board } | ConvertTo-Json -Compress -Depth 4
`.trim();

  const { stdout } = await runShellCommand(script, 15000);
  const trimmed = (stdout || '').trim();
  if (!trimmed) return { supported: false };

  const parsed = JSON.parse(trimmed);
  const sticks = Array.isArray(parsed.Memory) ? parsed.Memory : [parsed.Memory];
  const configured = sticks.map((s) => Number(s.ConfiguredClockSpeed) || 0);
  const rated = sticks.map((s) => Number(s.Speed) || 0);
  const maxConfigured = Math.max(...configured);
  const maxRated = Math.max(...rated);

  const board = Array.isArray(parsed.Board) ? parsed.Board[0] : parsed.Board;

  return {
    supported: true,
    configuredMHz: maxConfigured,
    ratedMHz: maxRated,
    xmpActive: maxRated > 0 && maxConfigured >= maxRated,
    sticks: sticks.length,
    motherboard: {
      manufacturer: (board?.Manufacturer || '').trim(),
      product: (board?.Product || '').trim()
    }
  };
}

function registerSystemHandlers() {
  ipcMain.handle('system:is-admin', async () => {
    try { return isRunningAsAdmin(); } catch (e) { console.error(e); return false; }
  });

  ipcMain.handle('system:get-stats', async () => {
    try { return await collectStats(); } catch (e) { console.error(e); return { error: e.message }; }
  });

  ipcMain.handle('system:get-info', async () => {
    try { return await collectStaticInfo(); } catch (e) { console.error(e); return { error: e.message }; }
  });

  ipcMain.handle('system:get-optimization-status', async () => ({ score: 76, lastCheck: new Date().toISOString() }));

  ipcMain.handle('system:get-memory-profile', async () => {
    try { return await getMemoryProfile(); } catch (e) { console.error(e); return { supported: false, error: e.message }; }
  });

  // Abre um link externo no navegador padrão do usuário. Restrito a
  // youtube.com para evitar uso indevido desse canal para abrir qualquer URL.
  ipcMain.handle('system:open-external', async (_event, url) => {
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.endsWith('youtube.com')) {
        return { success: false, error: 'Domínio não permitido.' };
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  startStatsStreaming();
}

function startStatsStreaming() {
  if (statsIntervalHandle) clearInterval(statsIntervalHandle);
  statsIntervalHandle = setInterval(async () => {
    const win = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (!win || win.isDestroyed()) return;
    try {
      const stats = await collectStats();
      win.webContents.send('system:stats-update', stats);
    } catch (e) { console.error('[stats-update]', e); }
  }, STATS_INTERVAL_MS);
}

function stopStatsStreaming() {
  if (statsIntervalHandle) { clearInterval(statsIntervalHandle); statsIntervalHandle = null; }
}

module.exports = { registerSystemHandlers, stopStatsStreaming };