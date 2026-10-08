const { ipcMain } = require('electron');
const os = require('os');
const { runShellCommand, runCommandSmart, runElevatedScriptWithOutput } = require('../utils/shell');
const { withLicense } = require('../utils/licenseGuard');
const { log } = require('../utils/logger');

function parseWmiDate(wmiDateStr) {
  if (!wmiDateStr || typeof wmiDateStr !== 'string') return new Date().toISOString();
  const match = wmiDateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (match) {
    const [, year, month, day, hour, min, sec] = match;
    const date = new Date(`${year}-${month}-${day}T${hour}:${min}:${sec}`);
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  const parsedDate = new Date(wmiDateStr);
  if (!isNaN(parsedDate.getTime())) return parsedDate.toISOString();
  return new Date().toISOString();
}

function mapPointType(typeNum) {
  switch (Number(typeNum)) {
    case 0: case 10: case 12: return 'Ponto Manual';
    case 1: return 'Instalação de Aplicativo';
    case 2: return 'Remoção de Aplicativo';
    case 18: return 'Atualização do Windows';
    default: return 'Automático';
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
 * Remove acentos/diacríticos. Necessário porque a API do Windows que
 * grava a descrição de pontos de restauração (Checkpoint-Computer) usa
 * internamente rotinas antigas baseadas em ANSI em algumas versões do
 * Windows (builds mais antigas do Windows 10 confirmadas em teste real) —
 * isso corrompe caracteres acentuados DEPOIS que nosso script já entrega
 * o texto correto, então a única correção confiável é evitar acentos na
 * descrição, garantindo compatibilidade em qualquer versão do Windows.
 */
function toAsciiSafe(str) {
  return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function listRestorePoints() {
  const script = `Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, CreationTime, RestorePointType | ConvertTo-Json -Compress`;
  const { stdout } = await runShellCommand(script, 20000);
  const trimmed = (stdout || '').trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  const rawPoints = Array.isArray(parsed) ? parsed : [parsed];
  return formatPoints(rawPoints);
}

async function listRestorePointsElevated() {
  const scriptBody = `
$points = Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, CreationTime, RestorePointType
$__resultJson = $points | ConvertTo-Json -Compress
`.trim();
  const raw = await runElevatedScriptWithOutput(scriptBody, 30000);
  const rawPoints = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return formatPoints(rawPoints);
}

async function createRestorePoint(description = 'Backup de Seguranca - C-Optimizer') {
  if (os.platform() !== 'win32') {
    return { success: false, error: 'Disponível apenas no Windows.' };
  }

  const safeDescription = toAsciiSafe(description).replace(/'/g, "''");

  // O Windows impõe um intervalo mínimo de 24h entre pontos de restauração
  // (SystemRestorePointCreationFrequency = 1440 minutos). Se já houve um
  // ponto nas últimas 24h, `Checkpoint-Computer` retorna sucesso mas NÃO
  // cria nada — silenciosamente. Isso faz parecer que a criação falhou.
  //
  // Solução: salvar o valor atual, definir como 0 temporariamente, criar o
  // ponto, e restaurar o valor original. Assim o usuário sempre consegue
  // criar um ponto manualmente quando pedir.
  const script = `
$ErrorActionPreference = 'Stop'

$regPath = 'HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\SystemRestore'
$regName = 'SystemRestorePointCreationFrequency'

# Salva o valor original (pode não existir)
$originalValue = $null
try {
  $originalValue = (Get-ItemProperty -Path $regPath -Name $regName -ErrorAction Stop).$regName
  $hadValue = $true
} catch {
  $hadValue = $false
}

try {
  # Desabilita o limite de frequência
  if (-not (Test-Path $regPath)) { New-Item -Path $regPath -Force | Out-Null }
  Set-ItemProperty -Path $regPath -Name $regName -Value 0 -Type DWord -Force -ErrorAction Stop

  # Cria o ponto de restauração
  Checkpoint-Computer -Description '${safeDescription}' -RestorePointType 'MODIFY_SETTINGS' -ErrorAction Stop

  [PSCustomObject]@{ success = $true } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
} finally {
  # Restaura o valor original
  try {
    if ($hadValue) {
      Set-ItemProperty -Path $regPath -Name $regName -Value $originalValue -Type DWord -Force -ErrorAction SilentlyContinue
    } else {
      Remove-ItemProperty -Path $regPath -Name $regName -ErrorAction SilentlyContinue
    }
  } catch { /* ignora */ }
}
`.trim();

  try {
    await runCommandSmart(script, true, 90000);
    return { success: true };
  } catch (error) {
    log.error('[restore:create-point] Erro:', error.message);
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
    log.error('[restore:enable-protection] Erro:', error.message);
    return { success: false, error: 'Falha ao ativar a Proteção do Sistema.' };
  }
}

/**
 * Abre o wizard de restauração do Windows (rstrui.exe) com privilégios
 * elevados. NÃO aplicamos a restauração programaticamente porque:
 * 1) Não há rollback se o processo falhar no meio.
 * 2) A API WMI SystemRestore.Restore() é pouco documentada e não recomendada.
 * 3) O wizard nativo já oferece: escolha de "manter arquivos pessoais",
 *    confirmação final antes de reiniciar, aviso sobre programas que serão
 *    desinstalados e cancelamento antes do ponto de não-retorno.
 */
async function openRestoreWizard() {
  if (os.platform() !== 'win32') {
    return { success: false, error: 'Disponível apenas no Windows.' };
  }

  const script = `
$ErrorActionPreference = 'Stop'
try {
  Start-Process 'rstrui.exe' -Verb RunAs -ErrorAction Stop
  [PSCustomObject]@{ success = $true } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`.trim();

  try {
    const { stdout } = await runShellCommand(script, 15000);
    const parsed = JSON.parse((stdout || '{}').trim());
    if (!parsed.success) {
      return { success: false, error: parsed.error || 'Falha ao abrir o wizard de restauração.' };
    }
    return { success: true };
  } catch (error) {
    log.error('[restore:apply-point] Erro:', error.message);
    const userCancelled = error.message.includes('1223') || error.message.includes('cancelado');
    return {
      success: false,
      error: userCancelled
        ? 'Você cancelou a permissão de administrador.'
        : 'Não foi possível abrir o wizard de restauração.'
    };
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
      log.error('[restore:list-points] Erro:', error.message);
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
      log.error('[restore:list-points-elevated] Erro:', error.message);
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

  ipcMain.handle('restore:create-point', withLicense(async (_event, description) => {
    return await createRestorePoint(description);
  }));

  ipcMain.handle('restore:enable-protection', withLicense(async () => {
    return await enableSystemRestore();
  }));

    ipcMain.handle('restore:apply-point', withLicense(async () => {
    return await openRestoreWizard();
  }));
}

module.exports = { registerRestoreHandlers };