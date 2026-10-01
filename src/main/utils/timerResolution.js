const { spawn, execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { log } = require('./logger');

/**
 * Daemon que segura o timer do Windows em 0.5ms via NtSetTimerResolution.
 *
 * Por que um processo separado:
 *   NtSetTimerResolution é PER-PROCESS. Um dos processos precisa ficar vivo
 *   segurando a requisição enquanto o usuário quer 0.5ms. O OS usa a maior
 *   resolução solicitada por qualquer processo ativo — matar o daemon
 *   reverte automaticamente para o padrão do sistema.
 *
 * Por que PowerShell e não native addon:
 *   Zero dependência de build tools. Compila o C# inline (Add-Type) e
 *   mantém o processo vivo com Start-Sleep em loop.
 *
 * Não requer admin — NtSetTimerResolution é acessível a usuários comuns.
 */

const HOLD_SCRIPT = `
$signature = @"
using System;
using System.Runtime.InteropServices;
public class COptTimer {
    [DllImport("ntdll.dll")]
    public static extern int NtSetTimerResolution(uint DesiredResolution, bool SetResolution, out uint CurrentResolution);
}
"@

try {
    Add-Type -TypeDefinition $signature -ErrorAction Stop
    $current = [uint32]0
    # 5000 = 0.5ms em unidades de 100ns.
    $status = [COptTimer]::NtSetTimerResolution(5000, $true, [ref]$current)
    if ($status -ne 0) {
        Write-Output "ERROR:NtSetTimerResolution retornou $status"
        exit 1
    }
    Write-Output "READY:$current"
} catch {
    Write-Output "ERROR:$($_.Exception.Message)"
    exit 1
}

while ($true) { Start-Sleep -Seconds 60 }
`;

const QUERY_SCRIPT = `
$signature = @"
using System;
using System.Runtime.InteropServices;
public class COptTimerQuery {
    [DllImport("ntdll.dll")]
    public static extern int NtQueryTimerResolution(out uint MinimumResolution, out uint MaximumResolution, out uint CurrentResolution);
}
"@

try {
    Add-Type -TypeDefinition $signature -ErrorAction Stop
    $min = [uint32]0; $max = [uint32]0; $cur = [uint32]0
    [COptTimerQuery]::NtQueryTimerResolution([ref]$min, [ref]$max, [ref]$cur) | Out-Null
    [PSCustomObject]@{ success = $true; min = $min; max = $max; current = $cur } | ConvertTo-Json -Compress
} catch {
    [PSCustomObject]@{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
`;

let daemonProcess = null;
let daemonStartPromise = null;

function writeTempScript(content, prefix) {
  const name = `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.ps1`;
  const filePath = path.join(os.tmpdir(), name);
  fs.writeFileSync(filePath, '\uFEFF' + content, 'utf8');
  return filePath;
}

function startDaemon() {
  if (daemonProcess && !daemonProcess.killed) {
    return Promise.resolve({ success: true, alreadyRunning: true });
  }
  if (daemonStartPromise) return daemonStartPromise;

  daemonStartPromise = new Promise((resolve) => {
    let scriptPath;
    try {
      scriptPath = writeTempScript(HOLD_SCRIPT, 'copt_timer_hold');
    } catch (err) {
      daemonStartPromise = null;
      return resolve({ success: false, error: `Falha ao gravar script: ${err.message}` });
    }

    const child = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath
    ], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

    daemonProcess = child;
    let stdoutBuf = '';
    let resolved = false;

    function finish(result) {
      if (resolved) return;
      resolved = true;
      daemonStartPromise = null;
      try { fs.unlink(scriptPath, () => {}); } catch {}
      resolve(result);
    }

    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString('utf8');
      if (stdoutBuf.includes('READY:')) {
        const m = stdoutBuf.match(/READY:(\d+)/);
        const current = m ? parseInt(m[1], 10) : null;
        log.info(`[timerResolution] Daemon iniciado. current=${current}`);
        finish({ success: true, current });
      } else if (stdoutBuf.includes('ERROR:')) {
        const msg = stdoutBuf.split('ERROR:')[1].trim();
        log.error('[timerResolution] Daemon reportou erro:', msg);
        try { child.kill(); } catch {}
        daemonProcess = null;
        finish({ success: false, error: msg });
      }
    });

    child.on('exit', (code) => {
      log.info(`[timerResolution] Daemon encerrado (código ${code}).`);
      daemonProcess = null;
      finish({ success: false, error: `PowerShell encerrou com código ${code} antes de confirmar.` });
    });

    child.on('error', (err) => {
      log.error('[timerResolution] Erro no spawn:', err.message);
      daemonProcess = null;
      finish({ success: false, error: err.message });
    });

    setTimeout(() => {
      if (!resolved) {
        try { child.kill(); } catch {}
        daemonProcess = null;
        finish({ success: false, error: 'Timeout aguardando confirmação do daemon.' });
      }
    }, 10000);
  });

  return daemonStartPromise;
}

function stopDaemon() {
  if (!daemonProcess || daemonProcess.killed) {
    daemonProcess = null;
    return { success: true, alreadyStopped: true };
  }
  const pid = daemonProcess.pid;
  try {
    // PowerShell não tem filhos — kill() basta. Fallback via taskkill se falhar.
    daemonProcess.kill();
    log.info(`[timerResolution] Daemon (PID ${pid}) encerrado.`);
  } catch (err) {
    log.warn(`[timerResolution] kill() falhou para PID ${pid}, tentando taskkill:`, err.message);
    try {
      execSync(`taskkill /F /PID ${pid}`, { stdio: 'ignore' });
    } catch (tkErr) {
      log.error('[timerResolution] taskkill também falhou:', tkErr.message);
      return { success: false, error: tkErr.message };
    }
  }
  daemonProcess = null;
  return { success: true };
}

function isDaemonRunning() {
  return !!(daemonProcess && !daemonProcess.killed);
}

function registerShutdownHandlers() {
  const { app } = require('electron');
  app.on('before-quit', () => {
    if (isDaemonRunning()) {
      log.info('[timerResolution] Encerrando daemon antes de sair.');
      stopDaemon();
    }
  });
  process.on('exit', () => {
    if (daemonProcess && !daemonProcess.killed) {
      try { daemonProcess.kill(); } catch {}
    }
  });
}

module.exports = {
  QUERY_SCRIPT,
  startDaemon,
  stopDaemon,
  isDaemonRunning,
  registerShutdownHandlers,
};