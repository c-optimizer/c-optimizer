const { ipcMain } = require('electron');
const os = require('os');
const { runShellCommand, runCommandSmart } = require('../utils/shell');

/**
 * Converte o campo CreationTime retornado pelo WMI/PowerShell.
 * Em alguns formatos vem como string ISO, em outros como /Date(epoch)/.
 */
function parseWmiDate(value) {
  if (typeof value === 'string' && value.startsWith('/Date(')) {
    const match = value.match(/\/Date\((\d+)\)\//);
    if (match) return new Date(Number(match[1])).toISOString();
  }
  const asDate = new Date(value);
  return isNaN(asDate.getTime()) ? null : asDate.toISOString();
}

function mapRestorePointType(typeCode) {
  const types = {
    0: 'Instalação de Aplicativo',
    1: 'Remoção de Aplicativo',
    10: 'Ponto Manual',
    12: 'Atualização do Windows',
    13: 'Ponto Manual',
    14: 'Restauração Anterior'
  };
  return types[typeCode] || 'Automático';
}

async function listRestorePoints() {
  if (os.platform() !== 'win32') return [];

  const script = `Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, CreationTime, RestorePointType | ConvertTo-Json -Compress`;
  const { stdout } = await runShellCommand(script, 15000);

  const trimmed = stdout.trim();
  if (!trimmed) return [];

  const parsed = JSON.parse(trimmed);
  const list = Array.isArray(parsed) ? parsed : [parsed];

  return list
    .map((point) => ({
      id: point.SequenceNumber,
      description: point.Description,
      date: parseWmiDate(point.CreationTime),
      type: mapRestorePointType(point.RestorePointType)
    }))
    .sort((a, b) => b.id - a.id); // mais recente primeiro
}

function registerRestoreHandlers() {
  ipcMain.handle('restore:list-points', async () => {
    try {
      const points = await listRestorePoints();
      return { success: true, points };
    } catch (error) {
      console.error('[restore:list-points] Erro:', error.message);
      return {
        success: false,
        points: [],
        error: 'Não foi possível listar os pontos de restauração. A Proteção do Sistema pode estar desativada.'
      };
    }
  });

  ipcMain.handle('restore:create-point', async (_event, description) => {
    if (os.platform() !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }

    const label = (description || 'Ponto manual - C-Optimizer').replace(/"/g, '');

    // Remove o limite padrão de 24h entre criações manuais de ponto,
    // para que o botão do app sempre funcione quando o usuário clicar nele.
    const script = `
      if (-not (Test-Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore")) {
        New-Item -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore" -Force | Out-Null
      }
      Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore" -Name "SystemRestorePointCreationFrequency" -Value 0
      Checkpoint-Computer -Description "${label}" -RestorePointType "MODIFY_SETTINGS"
    `.trim();

    try {
      await runCommandSmart(script, true, 60000);
      return { success: true };
    } catch (error) {
      console.error('[restore:create-point] Erro:', error.message);
      const userCancelled = error.message.includes('1223');
      return {
        success: false,
        error: userCancelled
          ? 'Você cancelou a permissão de administrador solicitada pelo Windows.'
          : 'Falha ao criar o ponto. Verifique se a Proteção do Sistema está ativada para o disco C:.'
      };
    }
  });

  ipcMain.handle('restore:apply-point', async (_event, pointId) => {
    if (os.platform() !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }

    const script = `Restore-Computer -RestorePoint ${Number(pointId)} -Confirm:$false`;

    try {
      // A partir daqui o Windows assume o controle e reinicia sozinho.
      await runCommandSmart(script, true, 30000);
      return { success: true };
    } catch (error) {
      console.error('[restore:apply-point] Erro:', error.message);
      const userCancelled = error.message.includes('1223');
      return {
        success: false,
        error: userCancelled
          ? 'Você cancelou a permissão de administrador solicitada pelo Windows.'
          : 'Falha ao aplicar o ponto de restauração.'
      };
    }
  });

  // Limitação real do Windows: não há cmdlet para excluir um ponto específico.
  // A única exclusão nativa possível é apagar TODOS de uma vez.
  ipcMain.handle('restore:delete-all-points', async () => {
    if (os.platform() !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }

    const script = `
      Disable-ComputerRestore -Drive "C:\\"
      Enable-ComputerRestore -Drive "C:\\"
    `.trim();

    try {
      await runCommandSmart(script, true, 30000);
      return { success: true };
    } catch (error) {
      console.error('[restore:delete-all-points] Erro:', error.message);
      const userCancelled = error.message.includes('1223');
      return {
        success: false,
        error: userCancelled
          ? 'Você cancelou a permissão de administrador solicitada pelo Windows.'
          : 'Falha ao excluir os pontos de restauração.'
      };
    }
  });
}

module.exports = { registerRestoreHandlers };