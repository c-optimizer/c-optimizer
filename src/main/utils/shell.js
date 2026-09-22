const { exec, spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Executa um script PowerShell criando um arquivo temporário .ps1.
 *
 * Duas correções de encoding aqui:
 * 1. O arquivo é escrito com BOM UTF-8 ('\uFEFF' no início) — sem isso, o
 *    PowerShell 5.1 pode interpretar caracteres acentuados do PRÓPRIO
 *    SCRIPT (ex: "Segurança" dentro de uma string) usando o codepage ANSI
 *    do sistema, corrompendo-os antes mesmo da execução.
 * 2. `encoding: 'utf8'` nas opções do exec garante que o Node decodifique
 *    o stdout/stderr como UTF-8 — sem isso, mesmo um script que já emite
 *    UTF-8 corretamente (via [Console]::OutputEncoding) é relido errado
 *    pelo lado Node, reproduzindo o mesmo mojibake.
 */
function runPowerShellScript(scriptContent, options = {}) {
  return new Promise((resolve, reject) => {
    const tempFileName = `c_opt_${Date.now()}_${Math.random().toString(36).substring(7)}.ps1`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);

    try {
      fs.writeFileSync(tempFilePath, '\uFEFF' + scriptContent, 'utf8');

      const command = `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "${tempFilePath}"`;

      exec(command, { ...options, encoding: 'utf8' }, (error, stdout, stderr) => {
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

function runShellCommand(scriptContent, timeoutMs = 20000) {
  return runPowerShellScript(scriptContent, { timeout: timeoutMs });
}

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

async function runCommandSmart(scriptContent, requiresAdmin = false, timeoutMs = 20000) {
  if (requiresAdmin && !isRunningAsAdmin()) {
    return await runElevatedCommand(scriptContent);
  } else {
    return await runShellCommand(scriptContent, timeoutMs);
  }
}

function isRunningAsAdmin() {
  try {
    execSync('net session', { stdio: 'ignore' });
    return true;
  } catch (e) {
    return false;
  }
}

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
      fs.writeFileSync(scriptPath, '\uFEFF' + fullScript, 'utf8');
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

    let stderrBuffer = '';
    child.stderr?.on('data', (chunk) => {
      stderrBuffer += chunk.toString('utf8');
    });

    const timer = setTimeout(() => {
      child.kill();
      cleanup();
      reject(new Error('Tempo limite excedido ao aguardar a permissão de administrador.'));
    }, timeoutMs);

    child.on('close', (code) => {
      clearTimeout(timer);

      if (code !== 0) {
        cleanup();
        const detail = stderrBuffer.trim();
        return reject(new Error(
          `O comando elevado falhou ou foi cancelado (Código: ${code})${detail ? ` — ${detail}` : ''}`
        ));
      }

      let raw;
      try {
        raw = fs.readFileSync(outputPath, 'utf8').trim();
      } catch (err) {
        cleanup();
        return reject(new Error(
          'A permissão de administrador foi negada automaticamente pelo Windows, sem exibir o prompt. Verifique as políticas de UAC do sistema.'
        ));
      }

      cleanup();

      if (!raw) {
        return resolve([]);
      }

      let parsed;
      try {
        parsed = JSON.parse(raw);
      } catch (err) {
        return reject(new Error(`Resposta inesperada do script elevado: ${raw.slice(0, 200)}`));
      }

      if (parsed && parsed.__error) {
        return reject(new Error(parsed.__error));
      }

      resolve(parsed);
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