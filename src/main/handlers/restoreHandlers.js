const { ipcMain } = require('electron');
const os = require('os');
const { runShellCommand, runCommandSmart, runElevatedScriptWithOutput } = require('../utils/shell');

/**
 * Converte a string de data do WMI/CIM (ex: "20260918064831.954121-180")
 * para ISO string válida. Os 14 primeiros dígitos SEMPRE são a data/hora,
 * independente do sinal (+/-) do deslocamento de fuso que vem depois —
 * por isso usamos regex de posição fixa, em vez de checar includes('-'),
 * que falha para qualquer fuso horário negativo (ex: Brasil, UTC-3).
 */
function parseWmiDate(wmiDateStr) {
  if (!wmiDateStr || typeof wmiDateStr !== 'string') return new Date().toISOString();

  const match = wmiDateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (match) {
    const [, year, month, day, hour, min, sec] = match;
    const date = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
    if (!isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  const parsedDate = new Date(wmiDateStr);
  if (!isNaN(parsedDate.getTime())) {
    return parsedDate.toISOString();
  }

  return new Date().toISOString();
}

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

function formatPoints(rawPoints) {
  const formatted = rawPoints.map((pt) => ({
    id: pt.SequenceNumber || Math.random(),
    description: pt.Description || 'Ponto de Restauração',
    date: parseWmiDate(pt.CreationTime),
    type: mapPointType(pt.RestorePointType)
  }));
  formatted.sort((a, b) => new Date(b.date) - new Date(a.date));
  return formatted;
}

/**
 * Listagem SEM elevação — mais rápida, mas em alguns ambientes Windows
 * a consulta WMI de restore points retorna vazia sem token elevado,
 * mesmo sem lançar erro. É por isso que existe o fallback elevado abaixo.
 */
async function listRestorePoints() {
  const script = `Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, CreationTime, RestorePointType | ConvertTo-Json -Compress`;
  const { stdout } = await runShellCommand(script, 20000);
  const trimmed = (stdout || '').trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  const rawPoints = Array.isArray(parsed) ? parsed : [parsed];
  return formatPoints(rawPoints);
}

/**
 * Listagem COM elevação (um único UAC) — fallback usado pela UI quando
 * a listagem normal vem vazia.
 */
async function listRestorePointsElevated() {
  const scriptBody = `
$points = Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, CreationTime, RestorePointType
$__resultJson = $points | ConvertTo-Json -Compress
`.trim();

  const raw = await runElevatedScriptWithOutput(scriptBody, 30000);
  const rawPoints = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return formatPoints(rawPoints);
}

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
    if (os.platform() !== 'win32') {
      return { success: false, points: [], error: 'Pontos de restauração disponíveis apenas no Windows.' };
    }
    try {
      const points = await listRestorePoints();
      return { success: true, points };
    } catch (error) {
      console.error('[restore:list-points] Erro:', error.message);
      return { success: false, points: [], error: 'Não foi possível carregar os pontos de restauração.' };
    }
  });

  ipcMain.handle('restore:list-points-elevated', async () => {
    if (os.platform() !== 'win32') {
      return { success: false, points: [], error: 'Disponível apenas no Windows.' };
    }
    try {
      const points = await listRestorePointsElevated();
      return { success: true, points };
    } catch (error) {
      console.error('[restore:list-points-elevated] Erro:', error.message);
      const userCancelled = error.message.includes('cancelado') || error.message.includes('Código:');
      return {
        success: false,
        points: [],
        error: userCancelled
          ? 'Você cancelou a permissão de administrador solicitada pelo Windows.'
          : 'Não foi possível carregar os pontos de restauração mesmo com permissão elevada.'
      };
    }
  });

  ipcMain.handle('restore:create-point', async (_event, description) => {
    return await createRestorePoint(description);
  });

  ipcMain.handle('restore:enable-protection', async () => {
    return await enableSystemRestore();
  });
}

module.exports = { registerRestoreHandlers };