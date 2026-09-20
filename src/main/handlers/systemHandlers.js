const { ipcMain } = require('electron');
const si = require('systeminformation');
const { isRunningAsAdmin } = require('../utils/shell');

const STATS_INTERVAL_MS = 2000;
let statsIntervalHandle = null;

/**
 * Coleta um snapshot atual de CPU, RAM, Disco e GPU.
 * Retorna valores já formatados (percentuais e GB) prontos para a UI.
 */
async function collectStats() {
  const [cpuLoad, mem, fsSize, graphics] = await Promise.all([
    si.currentLoad(),
    si.mem(),
    si.fsSize(),
    si.graphics()
  ]);

  // CPU
  const cpuPercent = Math.round(cpuLoad.currentLoad);

  // RAM
  const ramTotalGB = mem.total / (1024 ** 3);
  const ramUsedGB = (mem.total - mem.available) / (1024 ** 3);
  const ramPercent = Math.round((ramUsedGB / ramTotalGB) * 100);

  // Armazenamento — filtra apenas discos físicos relevantes,
  // ignorando partições de recuperação/EFI e volumes de rede/virtuais
  const relevantDisks = fsSize.filter((disk) => {
    const isTiny = disk.size < 1024 ** 3; // menor que 1 GB (recovery/EFI)
    const isNetworkOrVirtual = disk.type === 'network' || disk.mount?.startsWith('\\\\');
    return !isTiny && !isNetworkOrVirtual;
  });

  const totalStorage = relevantDisks.reduce((acc, disk) => acc + disk.size, 0);
  const usedStorage = relevantDisks.reduce((acc, disk) => acc + disk.used, 0);
  const storageTotalGB = totalStorage / (1024 ** 3);
  const storageUsedGB = usedStorage / (1024 ** 3);
  const storagePercent = storageTotalGB > 0 ? Math.round((storageUsedGB / storageTotalGB) * 100) : 0;

  // GPU — usa a primeira GPU dedicada/detectada; fallback para controller[0]
  const gpuController = graphics.controllers?.[0];
  let gpuPercent = 0;
  if (gpuController && typeof gpuController.utilizationGpu === 'number') {
    gpuPercent = Math.round(gpuController.utilizationGpu);
  } else if (gpuController && typeof gpuController.memoryUsed === 'number' && gpuController.memoryTotal) {
    gpuPercent = Math.round((gpuController.memoryUsed / gpuController.memoryTotal) * 100);
  }

  return {
    cpu: {
      percent: cpuPercent
    },
    gpu: {
      percent: gpuPercent
    },
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

/**
 * Coleta dados estáticos: modelo de CPU, GPU e informações do SO.
 * Chamado uma única vez (não muda em tempo real).
 */
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
      vram: gpuController?.vram ? Math.round(gpuController.vram / 1024) : null // vram vem em MB -> GB
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

/**
 * Registra todos os handlers IPC relacionados a telemetria de sistema
 * e inicia o loop de streaming de estatísticas em tempo real.
 *
 * @param {import('electron').BrowserWindow} mainWindow - janela principal, usada para enviar updates via webContents.send
 */
function registerSystemHandlers(mainWindow) {
  // Handler para verificar se o app possui privilégios de Administrador
  ipcMain.handle('system:is-admin', async () => {
    try {
      return isRunningAsAdmin();
    } catch (error) {
      console.error('[system:is-admin] Erro ao verificar privilégios:', error);
      return false;
    }
  });

  // Snapshot único sob demanda (ex: refresh manual, ou primeira carga da Dashboard)
  ipcMain.handle('system:get-stats', async () => {
    try {
      return await collectStats();
    } catch (error) {
      console.error('[system:get-stats] Erro ao coletar telemetria:', error);
      return { error: error.message };
    }
  });

  // Dados estáticos (modelo de CPU/GPU, SO) — buscados uma vez pela UI
  ipcMain.handle('system:get-info', async () => {
    try {
      return await collectStaticInfo();
    } catch (error) {
      console.error('[system:get-info] Erro ao coletar info estática:', error);
      return { error: error.message };
    }
  });

  // Placeholder de status de otimização
  ipcMain.handle('system:get-optimization-status', async () => {
    return {
      score: 76,
      lastCheck: new Date().toISOString()
    };
  });

  // Inicia o streaming de telemetria em tempo real para o Renderer
  startStatsStreaming(mainWindow);
}

/**
 * Envia 'system:stats-update' periodicamente para o Renderer via webContents.send.
 * Isso alimenta a Dashboard sem que o React precise ficar chamando invoke em loop.
 */
function startStatsStreaming(mainWindow) {
  if (statsIntervalHandle) {
    clearInterval(statsIntervalHandle);
  }

  statsIntervalHandle = setInterval(async () => {
    if (!mainWindow || mainWindow.isDestroyed()) {
      clearInterval(statsIntervalHandle);
      return;
    }

    try {
      const stats = await collectStats();
      mainWindow.webContents.send('system:stats-update', stats);
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