const { ipcMain, BrowserWindow } = require('electron');
const os = require('os');
const { runShellCommand, isRunningAsAdmin } = require('../utils/shell');
const { withLicense } = require('../utils/licenseGuard');
const { log } = require('../utils/logger');

let pty;
try {
  pty = require('node-pty');
} catch (err) {
  log.error('[system-fixer] node-pty não pôde ser carregado:', err.message);
}

let chkdskRunning = false;
let repairRunning = false;

function stripAnsi(str) {
  return str
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-9;?]*[ -/]*[@-~])/g, '');
}

/**
 * Roda o executável DIRETAMENTE como processo do PTY (não via shell
 * persistente + marcador de texto). onExit do próprio node-pty já nos dá
 * o exitCode real, sem precisar "adivinhar" o fim pela saída de texto.
 */
function runSystemCommand(command, args, stepId, window) {
  return new Promise((resolve) => {
    if (!pty) {
      const msg = 'Módulo de terminal (node-pty) não disponível nesta instalação.';
      log.error(`[system-fixer] ${msg}`);
      return resolve({ stepId, success: false, error: msg });
    }

    let ptyProcess;
    try {
      ptyProcess = pty.spawn(command, args, {
        name: 'xterm',
        cols: 120,
        rows: 30,
        cwd: process.cwd(),
        env: { ...process.env, DISM_LOG_LEVEL: '4' }
      });
    } catch (err) {
      log.error(`[system-fixer] Falha ao iniciar "${stepId}":`, err.message);
      return resolve({ stepId, success: false, error: err.message });
    }

    let buffer = '';
    let settled = false;

    ptyProcess.onData((data) => {
      buffer += data;
      const parts = buffer.split(/\r\n|\r|\n/);
      buffer = parts.pop();
      for (const part of parts) {
        const text = stripAnsi(part).trim();
        if (text && window && !window.isDestroyed()) {
          window.webContents.send('system-fixer:progress', { stepId, line: text });
        }
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      if (settled) return;
      settled = true;
      log.info(`[system-fixer] "${stepId}" processo real encerrado com código ${exitCode}.`);
      resolve({ stepId, success: exitCode === 0, exitCode });
    });
  });
}

async function runFullRepair(window) {
  const results = [];

  log.info('[system-fixer] Iniciando DISM /RestoreHealth...');
  const dismResult = await runSystemCommand(
    'DISM.exe',
    ['/Online', '/Cleanup-Image', '/RestoreHealth'],
    'dism',
    window
  );
  results.push(dismResult);
  log.info('[system-fixer] DISM concluído:', dismResult);

  log.info('[system-fixer] Iniciando SFC /scannow...');
  const sfcResult = await runSystemCommand(
    'sfc.exe',
    ['/scannow'],
    'sfc',
    window
  );
  results.push(sfcResult);
  log.info('[system-fixer] SFC concluído:', sfcResult);

  return results;
}

/**
 * CHKDSK como processo direto do PTY.
 *
 * Para a unidade do sistema:
 *   1. Limpa qualquer dirty bit residual de tentativas anteriores do fsutil
 *      (que travava o volume permanentemente "sujo" e causava loop de
 *      verificações a cada boot).
 *   2. Consulta se já está agendado — se sim, retorna sucesso sem re-agendar.
 *   3. Usa `chkntfs /c` (agenda UMA VEZ) em vez de `fsutil dirty set`
 *      (que marcava permanentemente).
 *
 * Para unidades não-sistema: chkdsk roda em tempo real, com auto-resposta
 * de prompts (S/N, Y/N).
 */
function runDriveCheck(driveLetter, window) {
  return new Promise(async (resolve) => {
    if (!pty) {
      const msg = 'Módulo de terminal (node-pty) não disponível nesta instalação.';
      log.error(`[system-fixer] ${msg}`);
      return resolve({ success: false, error: msg });
    }

    const systemDrive = (process.env.SystemDrive || 'C:').replace(/:/g, '').toUpperCase();
    const targetDrive = String(driveLetter).replace(/:/g, '').toUpperCase();
    const isSystemDrive = systemDrive === targetDrive;

    // ------ CASO 1: unidade do sistema ------
    if (isSystemDrive) {
      if (window && !window.isDestroyed()) {
        window.webContents.send('system-fixer:progress', {
          stepId: 'chkdsk',
          line: 'Unidade do sistema detectada — verificando estado atual...'
        });
      }

      // Passo 1: limpa qualquer dirty bit residual de tentativas anteriores.
      try {
        await new Promise((resolve) => {
          const cleanup = pty.spawn('cmd.exe', ['/c', `fsutil dirty clear ${driveLetter}:`], {
            name: 'xterm', cols: 80, rows: 24, env: process.env
          });
          cleanup.onExit(() => resolve());
        });
      } catch { /* ignora falha na limpeza */ }

      // Passo 2: consulta se a unidade já está agendada para verificação.
      let alreadyScheduled = false;
      try {
        const { stdout } = await runShellCommand(`fsutil dirty query ${driveLetter}:`, 8000);
        if (/sujo|dirty/i.test(stdout || '')) {
          alreadyScheduled = true;
        }
      } catch { /* assume não agendado */ }

      // Se já estava agendada, não precisa re-agendar.
      if (alreadyScheduled) {
        if (window && !window.isDestroyed()) {
          window.webContents.send('system-fixer:progress', {
            stepId: 'chkdsk',
            line: 'A unidade já estava agendada para verificação no próximo reinício.'
          });
        }
        return resolve({ success: true, exitCode: 0, scheduled: true });
      }

      // Passo 3: agenda com chkntfs /c (uma única vez).
      let ptyProcess;
      try {
        ptyProcess = pty.spawn('cmd.exe', ['/c', `chkntfs /c ${driveLetter}:`], {
          name: 'xterm',
          cols: 120,
          rows: 30,
          cwd: process.cwd(),
          env: process.env
        });
      } catch (err) {
        log.error('[system-fixer] Falha ao iniciar chkntfs:', err.message);
        return resolve({ success: false, error: err.message });
      }

      let buffer = '';
      let settled = false;

      ptyProcess.onData((data) => {
        buffer += data;
        const parts = buffer.split(/\r\n|\r|\n/);
        buffer = parts.pop();
        for (const part of parts) {
          const text = stripAnsi(part).trim();
          if (text && window && !window.isDestroyed()) {
            window.webContents.send('system-fixer:progress', { stepId: 'chkdsk', line: text });
          }
        }
      });

      ptyProcess.onExit(({ exitCode }) => {
        if (settled) return;
        settled = true;
        if (exitCode === 0) {
          if (window && !window.isDestroyed()) {
            window.webContents.send('system-fixer:progress', {
              stepId: 'chkdsk',
              line: 'Verificação agendada com sucesso. O CHKDSK será executado UMA VEZ no próximo reinício do Windows.'
            });
          }
          return resolve({ success: true, exitCode: 0, scheduled: true });
        }
        return resolve({
          success: false,
          exitCode,
          error: `Falha ao agendar verificação (chkntfs retornou ${exitCode}).`
        });
      });

      return;
    }

    // ------ CASO 2: unidade não-sistema (chkdsk roda direto) ------
    if (window && !window.isDestroyed()) {
      window.webContents.send('system-fixer:progress', {
        stepId: 'chkdsk',
        line: 'Iniciando verificação da unidade — pode demorar bastante em discos grandes.'
      });
    }

    let ptyProcess;
    try {
      ptyProcess = pty.spawn('cmd.exe', ['/c', `chkdsk ${driveLetter}: /f /r`], {
        name: 'xterm',
        cols: 120,
        rows: 30,
        cwd: process.cwd(),
        env: process.env
      });
    } catch (err) {
      log.error('[system-fixer] Falha ao iniciar chkdsk:', err.message);
      return resolve({ success: false, error: err.message });
    }

    let buffer = '';
    let settled = false;
    let inactivityTimer = null;

    function resetWatchdog() {
      if (inactivityTimer) clearTimeout(inactivityTimer);
      inactivityTimer = setTimeout(() => {
        if (!settled) {
          log.error('[system-fixer] CHKDSK sem resposta por 30s — encerrando processo travado.');
          settled = true;
          try { ptyProcess.kill(); } catch { /* já pode ter morrido */ }
          resolve({ success: false, exitCode: -1, error: 'O processo não respondeu e foi encerrado automaticamente.' });
        }
      }, 30000);
    }

    const promptRegex = /\(([A-Za-z])\/([A-Za-z])\)/;

    function checkPromptInBuffer() {
      const match = buffer.match(promptRegex);
      if (match) {
        if (window && !window.isDestroyed()) {
          window.webContents.send('system-fixer:progress', { stepId: 'chkdsk', line: stripAnsi(buffer).trim() });
        }
        ptyProcess.write(match[1] + '\r');
        buffer = '';
        return true;
      }
      return false;
    }

    ptyProcess.onData((data) => {
      resetWatchdog();
      buffer += data;
      if (checkPromptInBuffer()) return;

      const parts = buffer.split(/\r\n|\r|\n/);
      buffer = parts.pop();

      for (const part of parts) {
        const raw = stripAnsi(part).trim();
        if (!raw) continue;

        if (/acesso negado/i.test(raw) || /access is denied/i.test(raw)) {
          if (!settled) {
            settled = true;
            if (inactivityTimer) clearTimeout(inactivityTimer);
            try { ptyProcess.kill(); } catch { /* ignora */ }
            resolve({ success: false, exitCode: -1, error: 'Acesso negado pelo Windows ao tentar verificar a unidade.' });
          }
          return;
        }

        if (window && !window.isDestroyed()) {
          window.webContents.send('system-fixer:progress', { stepId: 'chkdsk', line: raw });
        }
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      if (settled) return;
      settled = true;
      if (inactivityTimer) clearTimeout(inactivityTimer);
      resolve({ success: exitCode === 0 || exitCode === 1 || exitCode === 2, exitCode });
    });

    resetWatchdog();
  });
}

function registerSystemFixerHandlers() {
  ipcMain.handle('system-fixer:is-admin', async () => {
    try { return isRunningAsAdmin(); } catch { return false; }
  });

  ipcMain.handle('system-fixer:run-repair', withLicense(async (event) => {
    if (repairRunning) {
      return { success: false, error: 'Já existe um reparo em andamento. Aguarde ele terminar.' };
    }
    if (os.platform() !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    if (!isRunningAsAdmin()) {
      return {
        success: false,
        error: 'Este reparo exige que o C-Optimizer seja executado como Administrador. Feche o app e abra-o novamente com privilégios elevados.'
      };
    }

    const window = BrowserWindow.fromWebContents(event.sender);
    repairRunning = true;

    try {
      const results = await runFullRepair(window);
      const allSuccess = results.every((r) => r.success);
      return { success: allSuccess, results };
    } catch (error) {
      log.error('[system-fixer:run-repair]', error);
      return { success: false, error: 'Falha ao executar o reparo de sistema.' };
    } finally {
      repairRunning = false;
    }
  }));

  ipcMain.handle('system-fixer:check-drive', withLicense(async (event, driveLetter) => {
    if (chkdskRunning) {
      return { success: false, error: 'Já existe uma verificação em andamento. Aguarde ela terminar.' };
    }
    if (os.platform() !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    if (!driveLetter || typeof driveLetter !== 'string') {
      return { success: false, error: 'Unidade não informada.' };
    }
    if (!isRunningAsAdmin()) {
      return {
        success: false,
        error: 'Esta verificação exige que o C-Optimizer seja executado como Administrador.'
      };
    }

    const window = BrowserWindow.fromWebContents(event.sender);
    chkdskRunning = true;

    try {
      const result = await runDriveCheck(driveLetter, window);
      if (!result.success) {
        return { success: false, error: result.error || `CHKDSK retornou código ${result.exitCode} (falha ao verificar/reparar).` };
      }
      return { success: true, exitCode: result.exitCode };
    } catch (error) {
      log.error('[system-fixer:check-drive]', error);
      return { success: false, error: 'Falha ao verificar a unidade.' };
    } finally {
      chkdskRunning = false;
    }
  }));
}

module.exports = { registerSystemFixerHandlers };