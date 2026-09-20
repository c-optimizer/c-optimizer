const { ipcMain } = require('electron');
const { runPowerShellScript, runElevatedCommand } = require('../utils/shell');

function setupRestoreHandlers() {
  // 1. Checa status e lista os pontos
  ipcMain.handle('restore:list-points', async () => {
    try {
      // Script resiliente para listar os pontos convertidos para ISO Date
      const script = `
        try {
          $points = Get-ComputerRestorePoint -ErrorAction Stop
          $result = @()
          foreach ($p in $points) {
            $typeStr = switch ($p.RestorePointType) {
              0 { "Ponto Manual" }
              10 { "Instalação de Aplicativo" }
              11 { "Remoção de Aplicativo" }
              12 { "Atualização do Windows" }
              13 { "Restauração Anterior" }
              default { "Automático" }
            }
            # Converte formato de data do WMI (WMI Date / ManagementDateTime)
            $dt = [System.Management.ManagementDateTimeConverter]::ToDateTime($p.CreationTime)
            $result += @{
              id = $p.SequenceNumber
              description = $p.Description
              type = $typeStr
              date = $dt.ToString("yyyy-MM-ddTHH:mm:ssZ")
            }
          }
          $result | ConvertTo-Json -Compress
        } catch {
          Write-Output "ERROR: $($_.Exception.Message)"
        }
      `;

      const output = await runPowerShellScript(script);

      if (!output || output.startsWith("ERROR:")) {
        return {
          success: false,
          error: output ? output.replace("ERROR: ", "") : "Não foi possível listar os pontos de restauração. A Proteção do Sistema pode estar desativada."
        };
      }

      let parsed = JSON.parse(output);
      if (!Array.isArray(parsed)) parsed = [parsed];

      return {
        success: true,
        points: parsed
      };
    } catch (error) {
      return {
        success: false,
        error: error.message || "Erro ao consultar pontos de restauração."
      };
    }
  });

  // 2. Habilita a Proteção do Sistema no Disco C:
  ipcMain.handle('restore:enable-protection', async () => {
    try {
      const script = `Enable-ComputerRestore -Drive "C:\\"`;
      await runElevatedCommand(script);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  // 3. Cria Ponto de Restauração Elevado
  ipcMain.handle('restore:create-point', async (_, description) => {
    try {
      const desc = description || "Backup de Segurança - C-Optimizer";
      const script = `Checkpoint-Computer -Description "${desc}" -RestorePointType "MODIFY_SETTINGS"`;
      await runElevatedCommand(script);
      return { success: true };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = { setupRestoreHandlers };