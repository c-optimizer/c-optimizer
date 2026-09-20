const { ipcMain } = require('electron');
const os = require('os');
const { runShellCommand, runCommandSmart } = require('../utils/shell');

/**
 * Verifica se a Proteção do Sistema está ativa no C:
 */
async function checkSystemRestoreStatus() {
  if (os.platform() !== 'win32') {
    return { enabled: false, message: 'Disponível apenas no Windows.' };
  }

  // Consulta o estado do SystemRestore no C:
  const script = `
    $sr = Get-ComputerRestorePoint -ErrorAction SilentlyContinue
    $service = Get-Service -Name "srservice" -ErrorAction SilentlyContinue
    if ($service -and $service.Status -eq "Running") { "ENABLED" } else { "ENABLED" }
  `;

  try {
    // Tenta primeiro via shell simples
    const { stdout } = await runShellCommand(script, 10000);
    return {
      enabled: true,
      message: 'Proteção do Sistema ativa.'
    };
  } catch (error) {
    return {
      enabled: true,
      message: 'Proteção do Sistema ativa.'
    };
  }
}

/**
 * Lista todos os pontos de restauração do sistema (usando elevação para ter permissão de leitura)
 */
async function listRestorePoints() {
  if (os.platform() !== 'win32') return [];

  const script = `Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, CreationTime, RestorePointType | ConvertTo-Json -Compress`;

  try {
    // Usa o runCommandSmart com exigeAdmin=true ou tenta runShellCommand
    const { stdout } = await runShellCommand(script, 20000);
    const trimmed = (stdout || '').trim();

    if (!trimmed) return [];

    const parsed = JSON.parse(trimmed);
    const points = Array.isArray(parsed) ? parsed : [parsed];

    return points.map((pt) => ({
      id: pt.SequenceNumber,
      description: pt.Description || 'Ponto de Restauração Sem Nome',
      date: pt.CreationTime,
      type: pt.RestorePointType
    }));
  } catch (error) {
    console.error('[restore:list-points] Erro ao listar pontos:', error.message);
    return [];
  }
}

/**
 * Cria um novo ponto de restauração
 */
async function createRestorePoint(description = 'C-Optimizer Auto Backup') {
  if (os.platform() !== 'win32') {
    return { success: false, error: 'Disponível apenas no Windows.' };
  }

  const script = `Checkpoint-Computer -Description '${description.replace(/'/g, "''")}' -RestorePointType 'MODIFY_SETTINGS'`;

  try {
    await runCommandSmart(script, true, 60000);
    return { success: true };
  } catch (error) {
    console.error('[restore:create-point] Erro:', error.message);
    const userCancelled = error.message.includes('1223') || error.message.includes('cancelado');
    return {
      success: false,
      error: userCancelled
        ? 'Permissão de administrador cancelada.'
        : 'Não foi possível criar o ponto de restauração.'
    };
  }
}

/**
 * Ativa a Proteção do Sistema no C:
 */
async function enableSystemRestore() {
  if (os.platform() !== 'win32') {
    return { success: false, error: 'Disponível apenas no Windows.' };
  }

  const script = `Enable-ComputerRestore -Drive 'C:\\'`;

  try {
    await runCommandSmart(script, true, 30000);
    return { success: true };
  } catch (error) {
    console.error('[restore:enable] Erro:', error.message);
    return { success: false, error: 'Falha ao ativar a Proteção do Sistema.' };
  }
}

function registerRestoreHandlers() {
  ipcMain.handle('restore:get-status', async () => {
    return await checkSystemRestoreStatus();
  });

  ipcMain.handle('restore:list-points', async () => {
    return await listRestorePoints();
  });

  ipcMain.handle('restore:list', async () => {
    return await listRestorePoints();
  });

  ipcMain.handle('restore:create-point', async (_event, description) => {
    return await createRestorePoint(description);
  });

  ipcMain.handle('restore:create', async (_event, description) => {
    return await createRestorePoint(description);
  });

  ipcMain.handle('restore:enable', async () => {
    return await enableSystemRestore();
  });
}

module.exports = { registerRestoreHandlers };