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
      fs.writeFileSync(tempFilePath, '\uFEFF' + scriptContent, 'utf8');

      const command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tempFilePath}"`;

      exec(command, {...options, encoding: 'utf8' }, (error, stdout, stderr) => {
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
 * Executa comando elevado via UAC criando também um script temporário.
 *
 * IMPORTANTE: propositalmente NÃO usamos -WindowStyle Hidden aqui.
 * Um processo elevado, sem assinatura digital, com janela oculta e que
 * modifica o registro do Windows é um padrão comportamental clássico de
 * heurísticas de antivírus (gerou falso positivo "Trojan:Win32/Commando.A!ml"
 * em testes reais). A janela do PowerShell aparecer brevemente é só estética;
 * escondê-la aumenta a chance de o app inteiro ser sinalizado como malware.
 */
function runElevatedCommand(scriptContent) {
  return new Promise((resolve, reject) => {
    const tempFileName = `c_opt_elev_${Date.now()}_${Math.random().toString(36).substring(7)}.ps1`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);

    try {
      fs.writeFileSync(tempFilePath, '\uFEFF' + scriptContent, 'utf8');

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

/**
 * Executa um script elevado (um único UAC) e retorna o resultado que o
 * próprio script grava em arquivo — necessário porque Start-Process -Verb RunAs
 * não devolve stdout ao processo pai.
 *
 * Mesma observação do runElevatedCommand: sem -WindowStyle Hidden, de propósito.
 */
function runElevatedScriptWithOutput(scriptBody, timeoutMs = 40000) {
  return new Promise((resolve, reject) => {
    const id = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const scriptPath = path.join(os.tmpdir(), `c_opt_out_${id}.ps1`);
    const outputPath = path.join(os.tmpdir(), `c_opt_out_${id}_result.json`);

    const fullScript = `
$ErrorActionPreference = 'Continue'
${scriptBody}
$__resultJson | Out-File -FilePath '${outputPath}' -Encoding UTF8
`.trim();

    function cleanup() {
      fs.unlink(scriptPath, () => {});
      fs.unlink(outputPath, () => {});
    }

    try {
      fs.writeFileSync(tempFilePath, '\uFEFF' + scriptContent, 'utf8');
    } catch (err) {
      return reject(err);
    }

    const psArgs = [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-Command',
      `Start-Process powershell.exe -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File "${scriptPath}"' -Verb RunAs -Wait`
    ];

    const child = spawn('powershell.exe', psArgs, { windowsHide: true });

    const timer = setTimeout(() => {
      child.kill();
      cleanup();
      reject(new Error('Tempo limite excedido ao aguardar a permissão de administrador.'));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        cleanup();
        return reject(new Error(`O comando elevado falhou ou foi cancelado (Código: ${code})`));
      }
      try {
        const raw = fs.readFileSync(outputPath, 'utf8');
        cleanup();
        resolve(JSON.parse(raw.trim()));
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      cleanup();
      reject(err);
    });
  });
}

module.exports = {
  runPowerShellScript,
  runShellCommand,
  runElevatedCommand,
  runElevatedScriptWithOutput,
  runCommandSmart,
  isRunningAsAdmin
};