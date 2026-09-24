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

/**
 * Remove sequências de escape ANSI (cores, posicionamento de cursor) que
 * o pseudo-terminal pode incluir na saída — queremos só o texto legível.
 */
function stripAnsi(str) {
  return str.replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '');
}

/**
 * Roda DISM ou SFC dentro de um pseudo-terminal (PTY) real via node-pty.
 * Isso é necessário porque, quando esses comandos detectam que não estão
 * anexados a um console interativo (caso de um spawn com pipes comuns),
 * o Windows passa a bufferizar a saída em blocos grandes, só liberando
 * tudo de uma vez no final — por isso a % nunca aparecia em tempo real,
 * independente de como tratávamos o parsing do lado do Node. Um PTY faz
 * o processo "acreditar" que está num terminal de verdade, restaurando o
 * flush imediato linha a linha.
 */
function runSystemCommand(command, args, stepId, window) {
  return new Promise((resolve) => {
    if (!pty) {
      const msg = 'Módulo de terminal (node-pty) não disponível nesta instalação.';
      log.error(`[system-fixer] ${msg}`);
      return resolve({ stepId, success: false, error: msg });
    }

    const ptyProcess = pty.spawn(command, args, {
      name: 'xterm',
      cols: 120,
      rows: 30,
      cwd: process.cwd(),
      env: process.env
    });

    let buffer = '';

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
      const finalText = stripAnsi(buffer).trim();
      if (finalText && window && !window.isDestroyed()) {
        window.webContents.send('system-fixer:progress', { stepId, line: finalText });
      }
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

function runDriveCheck(driveLetter, window) {
  return new Promise((resolve) => {
    if (window && !window.isDestroyed()) {
      window.webContents.send('system-fixer:progress', {
        stepId: 'chkdsk',
        line: 'Uma janela do Windows foi aberta para o CHKDSK. Se solicitado, responda diretamente nela (S/Y para confirmar).'
      });
    }

    const { spawn } = require('child_process');
    const child = spawn('cmd.exe', ['/c', `chkdsk ${driveLetter}: /f /r`], {
      windowsHide: false,
      stdio: 'ignore'
    });

    child.on('close', (code) => {
      const success = code === 0 || code === 1 || code === 2;
      resolve({ stepId: 'chkdsk', success, exitCode: code });
    });

    child.on('error', (err) => {
      log.error('[system-fixer] Erro no chkdsk:', err.message);
      resolve({ stepId: 'chkdsk', success: false, error: err.message });
    });
  });
}

function registerSystemFixerHandlers() {
  ipcMain.handle('system-fixer:is-admin', async () => {
    try { return isRunningAsAdmin(); } catch { return false; }
  });

  ipcMain.handle('system-fixer:run-repair', withLicense(async (event) => {
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

    try {
      const results = await runFullRepair(window);
      const allSuccess = results.every((r) => r.success);
      return { success: allSuccess, results };
    } catch (error) {
      log.error('[system-fixer:run-repair]', error);
      return { success: false, error: 'Falha ao executar o reparo de sistema.' };
    }
  }));

  ipcMain.handle('system-fixer:check-drive', withLicense(async (event, driveLetter) => {
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

    try {
      const result = await runDriveCheck(driveLetter, window);
      if (!result.success) {
        return { success: false, error: `CHKDSK retornou código ${result.exitCode} (falha ao verificar/reparar).` };
      }
      return { success: true, exitCode: result.exitCode };
    } catch (error) {
      log.error('[system-fixer:check-drive]', error);
      return { success: false, error: 'Falha ao verificar a unidade.' };
    }
  }));
}

module.exports = { registerSystemFixerHandlers };