const { exec, spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Executa um script PowerShell criando um arquivo temporário .ps1
 * para evitar falsos-positivos de antivirus com -EncodedCommand.
 */
function runPowerShellScript(scriptContent, options = {}) {
  return new Promise((resolve, reject) => {
    // Cria um nome de arquivo temporário único
    const tempFileName = `c_opt_${Date.now()}_${Math.random().toString(36).substring(7)}.ps1`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);

    try {
      // Escreve o script no arquivo .ps1 com codificação UTF8
      fs.writeFileSync(tempFilePath, scriptContent, 'utf8');

      const command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tempFilePath}"`;

      exec(command, options, (error, stdout, stderr) => {
        // Garante a remoção do arquivo temporário após execução
        fs.unlink(tempFilePath, () => {});

        if (error) {
          return reject(error);
        }
        resolve(stdout ? stdout.trim() : '');
      });
    } catch (err) {
      fs.unlink(tempFilePath, () => {});
      reject(err);
    }
  });
}

/**
 * Executa comando elevado via UAC criando também um script temporário
 */
function runElevatedCommand(scriptContent) {
  return new Promise((resolve, reject) => {
    const tempFileName = `c_opt_elev_${Date.now()}_${Math.random().toString(36).substring(7)}.ps1`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);

    try {
      fs.writeFileSync(tempFilePath, scriptContent, 'utf8');

      // Executa o script temporário via RunAs (UAC)
      const psArgs = [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-Command',
        `Start-Process powershell.exe -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "${tempFilePath}"' -Verb RunAs -Wait`
      ];

      const child = spawn('powershell.exe', psArgs, { windowsHide: true });

      child.on('close', (code) => {
        fs.unlink(tempFilePath, () => {});
        if (code === 0) {
          resolve({ success: true });
        } else {
          // Trata código de erro 1223 (Cancelado pelo usuário no UAC)
          reject(new Error(`O comando elevado falhou ou foi cancelado (Código: ${code})`));
        }
      });

      child.on('error', (err) => {
        fs.unlink(tempFilePath, () => {});
        reject(err);
      });
    } catch (err) {
      fs.unlink(tempFilePath, () => {});
      reject(err);
    }
  });
}

/**
 * Verifica se a aplicação está sendo executada como Administrador
 */
function isRunningAsAdmin() {
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  runPowerShellScript,
  runElevatedCommand,
  isRunningAsAdmin
};