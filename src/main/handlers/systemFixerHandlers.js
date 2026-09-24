const { ipcMain, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const os = require('os');
const { isRunningAsAdmin } = require('../utils/shell');
const { withLicense } = require('../utils/licenseGuard');
const { log } = require('../utils/logger');

/**
 * Roda DISM ou SFC, reconstruindo a linha de progresso do console como um
 * terminal real faria: '\r' volta o cursor ao início, '\b' apaga o
 * caractere anterior, '\n' fecha a linha. Sem isso, a barra de porcentagem
 * (que o Windows anima via backspace, não \r) chega vazia ou corrompida.
 * 'chcp 65001' força o console para UTF-8 antes de rodar o comando —
 * sem isso, DISM/SFC emitem no codepage OEM local (ex: 850/1252 em
 * Windows PT-BR), corrompendo acentos mesmo com decode UTF-8 no Node.
 */
function runSystemCommand(command, args, stepId, window) {
  return new Promise((resolve) => {
    const fullCommand = `chcp 65001 >nul && ${command} ${args.join(' ')}`;
    const child = spawn(fullCommand, [], { windowsHide: true, shell: true });

    let lineBuffer = [];
    let cursor = 0;

    function emitCurrentLine() {
      const text = lineBuffer.join('').trim();
      if (text && window && !window.isDestroyed()) {
        window.webContents.send('system-fixer:progress', { stepId, line: text });
      }
    }

    function processChunk(chunk) {
      const str = chunk.toString('utf8');
      for (const ch of str) {
        if (ch === '\r') {
          cursor = 0;
        } else if (ch === '\n') {
          emitCurrentLine();
          lineBuffer = [];
          cursor = 0;
        } else if (ch === '\b') {
          cursor = Math.max(cursor - 1, 0);
        } else if (ch.charCodeAt(0) >= 0x20 || ch === '\t') {
          // ignora outros caracteres de controle não imprimíveis
          lineBuffer[cursor] = ch;
          cursor++;
        }
      }
      emitCurrentLine();
    }

    child.stdout?.on('data', processChunk);
    child.stderr?.on('data', processChunk);

    child.on('close', (code) => {
      emitCurrentLine();
      resolve({ stepId, success: code === 0, exitCode: code });
    });

    child.on('error', (err) => {
      log.error(`[system-fixer] Erro ao rodar "${stepId}":`, err.message);
      resolve({ stepId, success: false, error: err.message });
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
 * CHKDSK exige um console interativo REAL para funcionar — rodar via
 * spawn com pipes (mesmo com stdin alimentado artificialmente) faz o
 * Windows recusar com "Acesso negado", mesmo com privilégios de admin,
 * porque o processo não tem um console anexado de verdade. A solução é
 * abrir uma janela de console visível e nativa do Windows, deixando o
 * usuário responder S/N diretamente ali, se solicitado.
 */
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
      // (unidade em uso) — todos são desfechos "de sucesso" do ponto de vista
      // do usuário. 3 = falha real (não conseguiu verificar/reparar).
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