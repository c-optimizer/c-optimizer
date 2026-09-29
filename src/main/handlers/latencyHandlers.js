const { ipcMain, BrowserWindow } = require('electron');
const { runShellCommand, isRunningAsAdmin } = require('../utils/shell');
const { withLicense } = require('../utils/licenseGuard');
const { log } = require('../utils/logger');
const si = require('systeminformation');

/**
 * Script PowerShell que limpa a Standby List do Windows.
 *
 * Usa SystemMemoryListInformation (0x50) + MemoryPurgeStandbyList (4) e
 * habilita SeProfileSingleProcessPrivilege via RtlAdjustPrivilege antes.
 *
 * NOTA: o purge agressivo trimma working sets de processos em segundo
 * plano — incluindo o renderer do Electron, que pode ir para tela preta.
 * O handler faz um webContents.reload() após 1s para recriar o renderer.
 */
const STANDBY_CLEAN_SCRIPT = `
$signature = @"
using System;
using System.Runtime.InteropServices;

public class COptStandbyCleaner {
    [DllImport("ntdll.dll")]
    public static extern uint RtlAdjustPrivilege(int Privilege, bool Enable, bool CurrentThread, out bool Enabled);

    [DllImport("ntdll.dll")]
    public static extern uint NtSetSystemInformation(int InfoClass, ref int Info, int Length);

    public const int SE_PROFILE_SINGLE_PROCESS_PRIVILEGE = 13;
    public const int SystemMemoryListInformation = 0x50;
    public const int MemoryPurgeStandbyList = 4;

    public static bool EnablePrivilege() {
        bool enabled;
        uint status = RtlAdjustPrivilege(SE_PROFILE_SINGLE_PROCESS_PRIVILEGE, true, false, out enabled);
        return status == 0;
    }

    public static int PurgeStandbyList() {
        int command = MemoryPurgeStandbyList;
        return (int)NtSetSystemInformation(SystemMemoryListInformation, ref command, sizeof(int));
    }
}
"@

try {
    Add-Type -TypeDefinition $signature -ErrorAction Stop
    if (-not [COptStandbyCleaner]::EnablePrivilege()) {
        [PSCustomObject]@{ success = $false; error = "Falha ao habilitar SeProfileSingleProcessPrivilege." } | ConvertTo-Json -Compress
        return
    }
    $result = [COptStandbyCleaner]::PurgeStandbyList()
    if ($result -eq 0) {
        [PSCustomObject]@{ success = $true } | ConvertTo-Json -Compress
    } else {
        $hex = '0x' + $result.ToString('X8')
        [PSCustomObject]@{ success = $false; error = "NtSetSystemInformation retornou $hex" } | ConvertTo-Json -Compress
    }
} catch {
    [PSCustomObject]@{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;

function registerLatencyHandlers() {
  ipcMain.handle('latency:is-admin', async () => {
    try { return isRunningAsAdmin(); } catch { return false; }
  });

  ipcMain.handle('latency:clean-standby', withLicense(async (event) => {
    if (process.platform !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    if (!isRunningAsAdmin()) {
      return {
        success: false,
        error: 'Esta operação exige privilégios de administrador. Reinicie o C-Optimizer como Administrador.'
      };
    }

    try {
      log.info('[latency] Purging standby list...');

      // Lê o "buffcache" — é o que o systeminformation expõe mais próximo
      // da Standby List (cache de arquivos + standby).
      const beforeMem = await si.mem();
      const beforeBuffCache = beforeMem.buffcache || 0;

      const { stdout } = await runShellCommand(STANDBY_CLEAN_SCRIPT, 15000);
      const trimmed = (stdout || '').trim();

      if (!trimmed) {
        return { success: false, error: 'O script não retornou nenhuma saída.' };
      }

      let parsed;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return { success: false, error: `Saída inesperada do script: ${trimmed.slice(0, 200)}` };
      }

      if (!parsed || parsed.success !== true) {
        return {
          success: false,
          error: parsed?.error || 'Falha desconhecida ao limpar memória em espera.'
        };
      }

      // Pequena espera para o Windows consolidar o novo estado de memória
      // antes de medirmos de novo.
      await new Promise((r) => setTimeout(r, 500));
      const afterMem = await si.mem();
      const afterBuffCache = afterMem.buffcache || 0;

      const freedBytes = Math.max(0, beforeBuffCache - afterBuffCache);
      log.info(`[latency] Standby list purged. Liberado: ${freedBytes} bytes.`);

      // Reload do renderer após purge agressivo (bug conhecido: trimma
      // working sets de processos em segundo plano, incluindo o Electron).
      const win = BrowserWindow.fromWebContents(event.sender);
      if (win && !win.isDestroyed()) {
        setTimeout(() => {
          if (!win.isDestroyed()) {
            log.info('[latency] Recarregando renderer após purge de standby.');
            win.webContents.reload();
          }
        }, 1200);
      }

      return { success: true, freedBytes };
    } catch (err) {
      log.error('[latency] Falha ao limpar standby list:', err.message);
      return { success: false, error: `Falha ao limpar memória em espera: ${err.message}` };
    }
  }));
}

module.exports = { registerLatencyHandlers };