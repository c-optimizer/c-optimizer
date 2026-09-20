const { exec, spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Executa um script PowerShell criando um arquivo temporário .ps1
 * para evitar falsos-positivos de antivírus com -EncodedCommand.
 */
function runPowerShellScript(scriptContent, options = {}) {
  return new Promise((resolve, reject) => {
    const tempFileName = `c_opt_${Date.now()}_${Math.random().toString(36).substring(7)}.ps1`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);

    try {
      fs.writeFileSync(tempFilePath, scriptContent, 'utf8');

      const command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tempFilePath}"`;

      exec(command, options, (error, stdout, stderr) => {
        fs.unlink(tempFilePath, () => {});

        if (error) {
          return reject(error);
        }
        resolve({ stdout: stdout ? stdout.trim() : '', stderr: stderr ? stderr.trim() : '' });
      });
    } catch (err) {
      fs.unlink(tempFilePath, () => {});
      reject(err);
    }
  });
}

/**
 * Alias para manter compatibilidade com módulos que chamam runShellCommand.
 */
function runShellCommand(scriptContent, timeoutMs = 20000) {
  return runPowerShellScript(scriptContent, { timeout: timeoutMs });
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
 * Executa o comando de forma inteligente:
 * Se exigir privilégios de Admin e o app não estiver em modo Admin, solicita UAC (runElevatedCommand).
 * Caso contrário, executa direto via runPowerShellScript.
 */
async function runCommandSmart(scriptContent, requiresAdmin = false, timeoutMs = 20000) {
  if (requiresAdmin && !isRunningAsAdmin()) {
    return await runElevatedCommand(scriptContent);
  } else {
    return await runShellCommand(scriptContent, timeoutMs);
  }
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
  runShellCommand,
  runElevatedCommand,
  runCommandSmart,
  isRunningAsAdmin
};