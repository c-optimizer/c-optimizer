const { ipcMain } = require('electron');
const { runPowerShellScript, runElevatedCommand } = require('../utils/shell');

function setupRestoreHandlers() {
  // Checa o status do serviço de restauração no disco C:
  ipcMain.handle('restore:check-status', async () => {
    try {
      const script = `
        $status = Get-WmiObject -Namespace root\\default -Class SystemRestoreConfig | Where-Object { $_.scriptingEnabled -ne $null }
        $driveC = Get-ComputerRestorePoint -ErrorAction SilentlyContinue
        $protection = (Get-WmiObject -Namespace root\\default -Class SystemRestore).Disable
        if ($protection -eq 0 -or $protection -eq $null) {
          Write-Output "ENABLED"
        } else {
          Write-Output "DISABLED"
        }
      `;
      const output = await runPowerShellScript(script);
      return { isEnabled: output.includes("ENABLED") };
    } catch (error) {
      return { isEnabled: false, error: error.message };
    }
  });

  // Lista os pontos de restauração
  ipcMain.handle('restore:list-points', async () => {
    try {
      const script = `
        Get-ComputerRestorePoint | Select-Object SequenceNumber, Description, RestorePointType, CreationTime | ConvertTo-Json
      `;
      const output = await runPowerShellScript(script);
      if (!output) return [];
      
      const parsed = JSON.parse(output);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      return [];
    }
  });

  // Habilita a Proteção do Sistema no disco C: via PowerShell elevado
  ipcMain.handle('restore:enable-protection', async () => {
    try {
      const script = `Enable-ComputerRestore -Drive "C:\\"`;
      await runElevatedCommand(script);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // Cria um Ponto de Restauração elevado
  ipcMain.handle('restore:create-point', async (_, description) => {
    try {
      const desc = description || "C-Optimizer Auto Backup";
      const script = `Checkpoint-Computer -Description "${desc}" -RestorePointType "MODIFY_SETTINGS"`;
      await runElevatedCommand(script);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { setupRestoreHandlers };