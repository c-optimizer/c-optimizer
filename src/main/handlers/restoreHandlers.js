const { ipcMain } = require('electron');
const os = require('os');
const { runShellCommand, runCommandSmart } = require('../utils/shell');

/**
 * Converte a string de data do WMI (ex: "20260918064831.954121-000") para ISO string válida
 */
function parseWmiDate(wmiDateStr) {
  if (!wmiDateStr || typeof wmiDateStr !== 'string') return new Date().toISOString();

  // Tenta converter se for formato WMI (AAAAMMDDHHMMSS...)
  if (wmiDateStr.length >= 14 && !wmiDateStr.includes('-') && !wmiDateStr.includes('/')) {
    const year = wmiDateStr.substring(0, 4);
    const month = wmiDateStr.substring(4, 6);
    const day = wmiDateStr.substring(6, 8);
    const hour = wmiDateStr.substring(8, 10);
    const min = wmiDateStr.substring(10, 12);
    const sec = wmiDateStr.substring(12, 14);

    const date = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  // Fallback para datas padrão
  const parsedDate = new Date(wmiDateStr);
  if (!isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString();
  }

  return new Date().toISOString();
}

/**
 * Mapeia os tipos numéricos de RestorePointType para a interface
 */
function mapPointType(typeNum) {
  switch (Number(typeNum)) {
    case 0:
    case 10:
    case 12:
      return 'Ponto Manual';
    case 1:
      return 'Instalação de Aplicativo';
    case 2:
      return 'Remoção de Aplicativo';
    case 18:
      return 'Atualização do Windows';
    default:
      return 'Automático';
  }
}

/**
 * Lista todos os pontos de restauração do sistema
 */
async function listRestorePoints() {
  if (os.platform() !== 'win32') {
    return { success: false, points: [], error: 'Pontos de restauração disponíveis apenas no Windows.' };
  }

  const script = `Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, CreationTime, RestorePointType | ConvertTo-Json -Compress`;

  try {
    const { stdout } = await runShellCommand(script, 20000);
    const trimmed = (stdout || '').trim();

    if (!trimmed) {
      return { success: true, points: [] };
    }

    const parsed = JSON.parse(trimmed);
    const rawPoints = Array.isArray(parsed) ? parsed : [parsed];

    const formattedPoints = rawPoints.map((pt) => ({
      id: pt.SequenceNumber || Math.random(),
      description: pt.Description || 'Ponto de Restauração',
      date: parseWmiDate(pt.CreationTime),
      type: mapPointType(pt.RestorePointType)
    }));

    // Ordena do mais recente para o mais antigo
    formattedPoints.sort((a, b) => new Date(b.date) - new Date(a.date));

    return {
      success: true,
      points: formattedPoints
    };
  } catch (error) {
    console.error('[restore:list-points] Erro:', error.message);
    return {
      success: false,
      points: [],
      error: 'Não foi possível carregar os pontos de restauração.'
    };
  }
}

/**
 * Cria um novo ponto de restauração
 */
async function createRestorePoint(description = 'Backup de Segurança - C-Optimizer') {
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
 * Ativa a Proteção do Sistema na unidade C:
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
    console.error('[restore:enable-protection] Erro:', error.message);
    return { success: false, error: 'Falha ao ativar a Proteção do Sistema.' };
  }
}

function registerRestoreHandlers() {
  ipcMain.handle('restore:list-points', async () => {
    return await listRestorePoints();
  });

  ipcMain.handle('restore:create-point', async (_event, description) => {
    return await createRestorePoint(description);
  });

  ipcMain.handle('restore:enable-protection', async () => {
    return await enableSystemRestore();
  });
}

module.exports = { registerRestoreHandlers };