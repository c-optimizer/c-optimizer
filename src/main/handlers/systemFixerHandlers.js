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

function stripAnsi(str) {
  return str
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-9;?]*[ -/]*[@-~])/g, '');
}

function stripPrompt(line) {
  const idx = line.lastIndexOf('>');
  return idx >= 0 ? line.slice(idx + 1).trim() : line.trim();
}

function runSystemCommand(command, args, stepId, window) {
  return new Promise((resolve) => {
    if (!pty) {
      const msg = 'Módulo de terminal (node-pty) não disponível nesta instalação.';
      log.error(`[system-fixer] ${msg}`);
      return resolve({ stepId, success: false, error: msg });
    }

    const ptyProcess = pty.spawn('cmd.exe', [], {
      name: 'xterm',
      cols: 120,
      rows: 30,
      cwd: process.cwd(),
      env: process.env
    });

    const MARKER = '__COPT_DONE__';
    const markerRegex = new RegExp(`^${MARKER}(\\d+)$`);
    const fullCommand = `${command} ${args.join(' ')} & echo ${MARKER}%errorlevel%`;

    let buffer = '';
    let finished = false;

    ptyProcess.onData((data) => {
      buffer += data;
      const parts = buffer.split(/\r\n|\r|\n/);
      buffer = parts.pop();

      for (const part of parts) {
        const raw = stripAnsi(part).trim();
        if (!raw) continue;

        const withoutPrompt = stripPrompt(raw);

        if (withoutPrompt === 'chcp 65001' || withoutPrompt === fullCommand) continue;
        if (/^Página de código ativa: \d+$/i.test(withoutPrompt) || /^Active code page: \d+$/i.test(withoutPrompt)) continue;

        const markerMatch = withoutPrompt.match(markerRegex);
        if (markerMatch) {
          finished = true;
          const exitCode = parseInt(markerMatch[1], 10);
          ptyProcess.kill();
          resolve({ stepId, success: exitCode === 0, exitCode });
          continue;
        }

        if (window && !window.isDestroyed()) {
          window.webContents.send('system-fixer:progress', { stepId, line: raw });
        }
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      if (!finished) {
        resolve({ stepId, success: exitCode === 0, exitCode });
      }
    });

    ptyProcess.write('chcp 65001\r');
    setTimeout(() => {
      ptyProcess.write(`${fullCommand}\r`);
    }, 300);
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
 * CHKDSK dentro de um pseudo-terminal (mesma técnica do DISM/SFC).
 * Diferente de tentar abrir uma janela externa (que se mostrou pouco
 * confiável em testes reais — nem sempre aparece, dependendo da versão
 * do Windows), aqui o próprio app detecta e responde automaticamente
 * a qualquer prompt de confirmação (S/N em português, Y/N em inglês),
 * sem depender de interação externa do usuário.
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

    const ptyProcess = pty.spawn('cmd.exe', [], {
      name: 'xterm',
      cols: 120,
      rows: 30,
      cwd: process.cwd(),
      env: process.env
    });

    const MARKER = '__COPT_CHKDSK_DONE__';
    const markerRegex = new RegExp(`^${MARKER}(\\d+)$`);
    const fullCommand = `chkdsk ${driveLetter}: /f /r & echo ${MARKER}%errorlevel%`;

    let buffer = '';
    let finished = false;

    ptyProcess.onData((data) => {
      buffer += data;
      const parts = buffer.split(/\r\n|\r|\n/);
      buffer = parts.pop();

      for (const part of parts) {
        const raw = stripAnsi(part).trim();
        if (!raw) continue;

        const withoutPrompt = stripPrompt(raw);

        if (withoutPrompt === 'chcp 65001' || withoutPrompt === fullCommand) continue;
        if (/^Página de código ativa: \d+$/i.test(withoutPrompt) || /^Active code page: \d+$/i.test(withoutPrompt)) continue;

        const markerMatch = withoutPrompt.match(markerRegex);
        if (markerMatch) {
          finished = true;
          const exitCode = parseInt(markerMatch[1], 10);
          ptyProcess.kill();
          resolve({ success: exitCode === 0 || exitCode === 1 || exitCode === 2, exitCode });
          continue;
        }

        // Detecta prompts do tipo "(S/N)" ou "(Y/N)" e responde com a
        // primeira letra automaticamente (sem isso, o CHKDSK aborta com
        // "não foi possível bloquear a unidade" em vez de agendar).
        const promptMatch = raw.match(/\(([A-Za-z])\/([A-Za-z])\)\s*\??\s*$/);
        if (promptMatch) {
          ptyProcess.write(promptMatch[1] + '\r');
          continue;
        }

        if (window && !window.isDestroyed()) {
          window.webContents.send('system-fixer:progress', { stepId: 'chkdsk', line: raw });
        }
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      if (!finished) {
        resolve({ success: exitCode === 0 || exitCode === 1 || exitCode === 2, exitCode });
      }
    });

    ptyProcess.write('chcp 65001\r');
    setTimeout(() => {
      ptyProcess.write(`${fullCommand}\r`);
    }, 300);
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