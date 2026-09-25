const { ipcMain, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const os = require('os');
const { isRunningAsAdmin } = require('../utils/shell');
const { withLicense } = require('../utils/licenseGuard');
const { log } = require('../utils/logger');
const { notifyIfEnabled } = require('./notificationHandlers');

let pty;
try {
  pty = require('node-pty');
} catch (err) {
  log.error('[system-fixer] node-pty não pôde ser carregado:', err.message);
}

/**
 * Remove sequências de escape do terminal (cores, posicionamento de cursor,
 * títulos de janela) que o node-pty inclui na saída bruta.
 */
function stripAnsi(str) {
  return str
    // Sequências OSC (ex: título de janela — geravam lixo tipo
    // "0;C:\WINDOWS\SYSTEM32\cmd.exe" aparecendo como texto visível)
    .replace(/\x1B\][^\x07\x1B]*(?:\x07|\x1B\\)/g, '')
    // Sequências CSI padrão (cores, cursor)
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-9;?]*[ -/]*[@-~])/g, '');
}

/**
 * Remove o prefixo de prompt (ex: "C:\Users\Caio\...>") de uma linha
 * ecoada pelo console, deixando só o texto que foi digitado/enviado.
 */
function stripPrompt(line) {
  const idx = line.lastIndexOf('>');
  return idx >= 0 ? line.slice(idx + 1).trim() : line.trim();
}

/**
 * Roda DISM ou SFC dentro de um pseudo-terminal (PTY) real via node-pty —
 * necessário porque, fora de um PTY, o Windows bufferiza a saída inteira
 * desses comandos e só libera tudo no final (nenhuma % aparece em tempo
 * real). Dentro de um PTY, porém, cada texto que ESCREVEMOS no terminal
 * é ecoado de volta como se tivesse sido digitado — por isso distinguimos
 * "linha ecoada do comando que enviamos" de "linha real de saída" usando
 * uma âncora estrita no marcador de conclusão: a linha ecoada contém o
 * comando inteiro (com "& echo __COPT_DONE__%errorlevel%" como texto
 * literal, não resolvido), enquanto a linha real de conclusão é só
 * "__COPT_DONE__<número>", nada mais.
 */
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

        // Linha ecoada do que nós mesmos digitamos (chcp ou o comando
        // completo) — não é saída real, descarta silenciosamente.
        if (withoutPrompt === 'chcp 65001' || withoutPrompt === fullCommand) {
          continue;
        }

        // Confirmação de troca de codepage — ruído inofensivo, mas sem
        // valor para o usuário; também descartamos.
        if (/^Página de código ativa: \d+$/i.test(withoutPrompt) || /^Active code page: \d+$/i.test(withoutPrompt)) {
          continue;
        }

        // Só bate aqui na linha de saída REAL do echo final, nunca na
        // linha ecoada do comando (que tem texto extra ao redor do marker).
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

function runDriveCheck(driveLetter, window) {
  return new Promise((resolve) => {
    if (window && !window.isDestroyed()) {
      window.webContents.send('system-fixer:progress', {
        stepId: 'chkdsk',
        line: 'Uma janela do Windows foi aberta para o CHKDSK. Se solicitado, responda diretamente nela (S/Y para confirmar).'
      });
    }

    const child = spawn('cmd.exe', ['/c', `chkdsk ${driveLetter}: /f /r`], {
      windowsHide: false,
      stdio: 'ignore'
    });

    child.on('close', (code) => {
      // 0 = sem erros | 1 = erros corrigidos | 2 = agendado para o próximo boot
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
      notifyIfEnabled(
        allSuccess ? 'Reparo concluído' : 'Reparo com falhas',
        allSuccess ? 'DISM e SFC finalizaram com sucesso.' : 'O reparo terminou com problemas. Verifique o app.'
      );
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