import { spawn } from 'child_process';

/**
 * Executa o comando de instalação do Winget e transmite o progresso via IPC.
 * @param {Electron.WebContents} sender - Canal para enviar eventos ao Renderer
 * @param {string} appId - ID do pacote Winget (ex: 'Microsoft.VCRedist.2015+.x64')
 */
export function installWingetPackage(sender, appId) {
  return new Promise((resolve, reject) => {
    // Parâmetros para instalação silenciosa e sem confirmações interativas
    const args = [
      'install',
      '--id', appId,
      '-e',
      '--silent',
      '--accept-source-agreements',
      '--accept-package-agreements'
    ];

    sender.send('winget:progress', { appId, status: 'installing', message: 'Iniciando instalação...' });

    const child = spawn('winget', args, { shell: true });

    let output = '';

    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      // Envia os logs do terminal em tempo real para a interface
      sender.send('winget:progress', { appId, status: 'installing', message: text.trim() });
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      output += text;
      sender.send('winget:progress', { appId, status: 'installing', message: text.trim() });
    });

    child.on('close', (code) => {
      if (code === 0) {
        sender.send('winget:progress', { appId, status: 'completed', message: 'Instalação concluída com sucesso!' });
        resolve({ success: true, appId });
      } else {
        // Winget costuma retornar código 0 para sucesso, ou códigos específicos do instalador
        sender.send('winget:progress', { 
          appId, 
          status: 'error', 
          message: `Falha na instalação (Código de saída: ${code})` 
        });
        resolve({ success: false, appId, code, output });
      }
    });

    child.on('error', (err) => {
      sender.send('winget:progress', { appId, status: 'error', message: err.message });
      reject(err);
    });
  });
}