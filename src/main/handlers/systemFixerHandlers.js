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
 * Roda DISM ou SFC dentro de um pseudo-terminal (PTY) real via node-pty,
 * resolvendo a bufferização de saída do Windows. Mas o PTY nasce com o
 * codepage OEM padrão do sistema (ex: 850 em Windows PT-BR) — por isso
 * rodamos 'chcp 65001' DENTRO do próprio terminal, antes do comando real,
 * para forçar UTF-8 na sessão. Diferente de tentar 'chcp' fora de um PTY
 * (que não tem efeito sobre DISM/SFC), aqui funciona porque o processo
 * realmente enxerga um console interativo.
 */
function runSystemCommand(command, args, stepId, window) {
  return new Promise((resolve) => {
    if (!pty) {
      const msg = 'Módulo de terminal (node-pty) não disponível nesta instalação.';
      log.error(`[system-fixer] ${msg}`);
      return resolve({ stepId, success: false, error: msg });
    }

    // cmd.exe como shell interativo do PTY (sem /c) — permanece vivo,
    // permitindo escrever múltiplos comandos na mesma sessão em vez de
    // aninhar processos, o que mantém DISM/SFC como filhos diretos do
    // pseudo-terminal (preserva o flush imediato de progresso).
    const ptyProcess = pty.spawn('cmd.exe', [], {
      name: 'xterm',
      cols: 120,
      rows: 30,
      cwd: process.cwd(),
      env: process.env
    });

    let buffer = '';
    let finished = false;

    const MARKER = '__COPT_DONE__';

    ptyProcess.onData((data) => {
      buffer += data;
      const parts = buffer.split(/\r\n|\r|\n/);
      buffer = parts.pop();
      for (const part of parts) {
        const text = stripAnsi(part).trim();
        if (!text) continue;

        if (text.includes(MARKER)) {
          finished = true;
          const codeMatch = text.match(new RegExp(`${MARKER}(\\d+)`));
          const exitCode = codeMatch ? parseInt(codeMatch[1], 10) : 0;
          ptyProcess.kill();
          resolve({ stepId, success: exitCode === 0, exitCode });
          continue;
        }

        if (window && !window.isDestroyed()) {
          window.webContents.send('system-fixer:progress', { stepId, line: text });
        }
      }
    });

    ptyProcess.onExit(({ exitCode }) => {
      if (!finished) {
        resolve({ stepId, success: exitCode === 0, exitCode });
      }
    });

    // Roda chcp na sessão (sem gerar processo aninhado), depois o comando
    // real, e ao final imprime um marcador com o código de saída para
    // sabermos exatamente quando o comando terminou dentro da sessão viva.
    ptyProcess.write('chcp 65001\r');
    setTimeout(() => {
      ptyProcess.write(`${command} ${args.join(' ')} & echo ${MARKER}%errorlevel%\r`);
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