const { ipcMain, BrowserWindow } = require('electron');
const os = require('os');
const { isRunningAsAdmin } = require('../utils/shell');
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
 * o exitCode real, sem precisar "adivinhar" o fim pela saída de texto —
 * essa era a causa do bug anterior: o marcador de texto podia ser
 * confundido/detectado cedo demais, resolvendo a Promise enquanto o
 * DISM/SFC real continuava rodando em segundo plano como processo órfão.
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
 * CHKDSK como processo direto do PTY. Prompts de confirmação (S/N, Y/N)
 * são detectados na saída e respondidos automaticamente via ptyProcess.write.
 */
function runDriveCheck(driveLetter, window) {
  return new Promise((resolve) => {
    if (!pty) {
      const msg = 'Módulo de terminal (node-pty) não disponível nesta instalação.';
      log.error(`[system-fixer] ${msg}`);
      return resolve({ success: false, error: msg });
    }

    if (window && !window.isDestroyed()) {
      window.webContents.send('system-fixer:progress', {
        stepId: 'chkdsk',
        line: 'Iniciando verificação da unidade — pode demorar bastante em discos grandes.'
      });
    }

    let ptyProcess;
    try {
      ptyProcess = pty.spawn('chkdsk.exe', [`${driveLetter}:`, '/f', '/r'], {
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

    // Regex sem âncora de fim de string — o prompt pode não vir com \n,
    // ficando incompleto no buffer, então precisa ser detectado mesmo
    // dentro de um trecho parcial, não só em linhas já fechadas.
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

      // Responde imediatamente se o prompt já estiver no buffer, mesmo
      // sem quebra de linha (era isso que travava o processo antes).
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