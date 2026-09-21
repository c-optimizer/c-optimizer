const { ipcMain, BrowserWindow } = require('electron');
const si = require('systeminformation');
const { isRunningAsAdmin } = require('../utils/shell');

const STATS_INTERVAL_MS = 2000;
let statsIntervalHandle = null;

async function collectStats() {
  const [cpuLoad, mem, fsSize, graphics] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.graphics()
  ]);

  const cpuPercent = Math.round(cpuLoad.currentLoad);

  const ramTotalGB = mem.total / (1024 ** 3);
  const ramUsedGB = (mem.total - mem.available) / (1024 ** 3);
  const ramPercent = Math.round((ramUsedGB / ramTotalGB) * 100);

  const relevantDisks = fsSize.filter((disk) => {
    const isTiny = disk.size < 1024 ** 3;
    const isNetworkOrVirtual = disk.type === 'network' || disk.mount?.startsWith('\\\\');
    return !isTiny && !isNetworkOrVirtual;
  });

  const totalStorage = relevantDisks.reduce((acc, disk) => acc + disk.size, 0);
  const usedStorage = relevantDisks.reduce((acc, disk) => acc + disk.used, 0);
  const storageTotalGB = totalStorage / (1024 ** 3);
  const storageUsedGB = usedStorage / (1024 ** 3);
  const storagePercent = storageTotalGB > 0 ? Math.round((storageUsedGB / storageTotalGB) * 100) : 0;

  const gpuController = graphics.controllers?.[0];
  let gpuPercent = 0;
  if (gpuController && typeof gpuController.utilizationGpu === 'number') {
    gpuPercent = Math.round(gpuController.utilizationGpu);
  } else if (gpuController && typeof gpuController.memoryUsed === 'number' && gpuController.memoryTotal) {
    gpuPercent = Math.round((gpuController.memoryUsed / gpuController.memoryTotal) * 100);
  }

  return {
    cpu: { percent: cpuPercent },
    gpu: { percent: gpuPercent },
    ram: {
      percent: ramPercent,
      usedGB: Number(ramUsedGB.toFixed(1)),
      totalGB: Number(ramTotalGB.toFixed(1))
    },
    storage: {
      percent: storagePercent,
      usedGB: Number(storageUsedGB.toFixed(0)),
      totalGB: Number(storageTotalGB.toFixed(0))
    },
    timestamp: Date.now()
  };
}

async function collectStaticInfo() {
  const [cpu, graphics, osInfo, mem] = await Promise.all([
    si.cpu(),
    si.graphics(),
    si.osInfo(),
    si.mem()
  ]);

  const gpuController = graphics.controllers?.[0];

  return {
    cpu: {
      model: `${cpu.manufacturer} ${cpu.brand}`.trim(),
      cores: cpu.cores,
      physicalCores: cpu.physicalCores,
      speed: cpu.speed
    },
    gpu: {
      model: gpuController?.model || 'GPU não detectada',
      vendor: gpuController?.vendor || '',
      vram: gpuController?.vram ? Math.round(gpuController.vram / 1024) : null
    },
    ram: {
      totalGB: Number((mem.total / (1024 ** 3)).toFixed(1))
    },
    os: {
      platform: osInfo.platform,
      distro: osInfo.distro,
      release: osInfo.release,
      arch: osInfo.arch,
      hostname: osInfo.hostname,
      kernel: osInfo.kernel
    }
  };
}

function registerSystemHandlers() {
  console.log('');

  ipcMain.handle('system:is-admin', async () => {
    try {
      return isRunningAsAdmin();
    } catch (error) {
      console.error('[system:is-admin] Erro:', error);
      return false;
    }
  });

  ipcMain.handle('system:get-stats', async () => {
    try {
      return await collectStats();
    } catch (error) {
      console.error('[system:get-stats] Erro:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('system:get-info', async () => {
    try {
      return await collectStaticInfo();
    } catch (error) {
      console.error('[system:get-info] Erro:', error);
      return { error: error.message };
    }
  });

  ipcMain.handle('system:get-optimization-status', async () => {
    return {
      score: 76,
      lastCheck: new Date().toISOString()
    };
  });

  startStatsStreaming();
}

function startStatsStreaming() {
  if (statsIntervalHandle) {
    clearInterval(statsIntervalHandle);
  }

  statsIntervalHandle = setInterval(async () => {
    const focusedWindow = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    if (!focusedWindow || focusedWindow.isDestroyed()) {
      return;
    }

    try {
      const stats = await collectStats();
      focusedWindow.webContents.send('system:stats-update', stats);
    } catch (error) {
      console.error('[system:stats-update] Erro ao enviar telemetria:', error);
    }
  }, STATS_INTERVAL_MS);
}

function stopStatsStreaming() {
  if (statsIntervalHandle) {
    clearInterval(statsIntervalHandle);
    statsIntervalHandle = null;
  }
}

module.exports = {
  registerSystemHandlers,
  stopStatsStreaming
};