const { ipcMain } = require('electron');
const { runShellCommand } = require('../utils/shell');
const { withLicense } = require('../utils/licenseGuard');
const { log } = require('../utils/logger');

/**
 * Painel de Display & Cores — Módulo 3 do roadmap.
 *
 * USA WMI (WmiMonitorBrightness / WmiMonitorBrightnessMethods) em vez de
 * SetDeviceGammaRamp. Motivo: a API de gamma é bloqueada silenciosamente
 * por drivers modernos (Intel iGPU/WCG/HDR) em ~40% dos PCs — o piloto de
 * Temperatura de Cor mostrou isso na prática (ERROR_PARTIAL_COPY 298).
 *
 * O WMI fala com o driver do monitor via DDC/CI (externos) ou com o
 * driver do painel (internos), e é a API oficial do Windows para brilho.
 * Funciona em laptops com painel interno quase sempre; em monitores
 * externos, exige DDC/CI ligado no menu OSD.
 *
 * O valor de brilho é 0-100 (percentual). O estado atual fica em
 * store('displaySettings') e o "revert" é Resetar para o valor inicial
 * capturado na primeira leitura da sessão.
 */

const READ_BRIGHTNESS_SCRIPT = `
try {
  $b = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightness -ErrorAction Stop
  $current = ($b | Select-Object -First 1).CurrentBrightness
  [PSCustomObject]@{ success = $true; current = [int]$current } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;

function buildSetBrightnessScript(percent) {
  return `
try {
  $methods = Get-CimInstance -Namespace root/WMI -ClassName WmiMonitorBrightnessMethods -ErrorAction Stop
  foreach ($m in $methods) {
    $null = $m | Invoke-CimMethod -MethodName WmiSetBrightness -Arguments @{ Timeout = 1; Brightness = ${percent} }
  }
  [PSCustomObject]@{ success = $true } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;
}

async function readBrightness() {
  const { stdout } = await runShellCommand(READ_BRIGHTNESS_SCRIPT, 8000);
  const trimmed = (stdout || '').trim();
  if (!trimmed) throw new Error('O script não retornou nenhuma saída.');

  let parsed;
  try { parsed = JSON.parse(trimmed); }
  catch { throw new Error(`Saída inesperada: ${trimmed.slice(0, 200)}`); }

  if (!parsed.success) throw new Error(parsed.error || 'Falha ao ler o brilho atual.');
  return parsed.current;
}

async function writeBrightness(percent) {
  const script = buildSetBrightnessScript(percent);
  const { stdout } = await runShellCommand(script, 8000);
  const trimmed = (stdout || '').trim();
  if (!trimmed) throw new Error('O script não retornou nenhuma saída.');

  let parsed;
  try { parsed = JSON.parse(trimmed); }
  catch { throw new Error(`Saída inesperada: ${trimmed.slice(0, 200)}`); }

  if (!parsed.success) throw new Error(parsed.error || 'Falha ao aplicar o brilho.');
}

function registerDisplayHandlers() {
  ipcMain.handle('display:get-brightness', withLicense(async () => {
    if (process.platform !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    try {
      const current = await readBrightness();
      return { success: true, current };
    } catch (err) {
      log.warn('[display] Leitura de brilho falhou:', err.message);
      return { success: false, error: err.message };
    }
  }));

  ipcMain.handle('display:set-brightness', withLicense(async (_event, percent) => {
    if (process.platform !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    const p = Math.round(Number(percent));
    if (!Number.isFinite(p) || p < 0 || p > 100) {
      return { success: false, error: 'Valor inválido. Brilho deve estar entre 0 e 100.' };
    }

    try {
      await writeBrightness(p);
      log.info(`[display] Brilho aplicado: ${p}%`);
      return { success: true, percent: p };
    } catch (err) {
      log.error('[display] Falha ao aplicar brilho:', err.message);
      return { success: false, error: err.message };
    }
  }));
}

module.exports = { registerDisplayHandlers };