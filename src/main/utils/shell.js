const { exec } = require('child_process');
const os = require('os');
const util = require('util');

const execAsync = util.promisify(exec);

function encodePowerShellCommand(command) {
  return Buffer.from(command, 'utf16le').toString('base64');
}

/**
 * Verifica se o processo atual já está rodando com privilégios de administrador.
 */
async function isRunningAsAdmin() {
  if (os.platform() !== 'win32') return true;
  try {
    await execAsync('net session', { windowsHide: true, timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

/**
 * Executa um comando no contexto de privilégio ATUAL do processo (sem elevar).
 */
async function runShellCommand(command, timeout = 15000) {
  const platform = os.platform();

  if (platform === 'win32') {
    const encoded = encodePowerShellCommand(command);
    const psCommand = `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`;
    // maxBuffer maior: listagens (Get-AppxPackage, Get-ComputerRestorePoint) podem gerar JSON grande
    return execAsync(psCommand, { windowsHide: true, timeout, maxBuffer: 1024 * 1024 * 10 });
  }

  return execAsync(command, { shell: '/bin/bash', timeout });
}

/**
 * Executa um comando elevado via UAC nativo do Windows (Start-Process -Verb RunAs),
 * sem exigir que o app inteiro rode como Administrador.
 */
async function runElevatedCommand(command, timeout = 30000) {
  const innerEncoded = encodePowerShellCommand(command);
  const elevateScript = `Start-Process powershell -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${innerEncoded}') -Verb RunAs -Wait -WindowStyle Hidden`;
  const outerEncoded = encodePowerShellCommand(elevateScript);
  const psCommand = `powershell -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${outerEncoded}`;

  return execAsync(psCommand, { windowsHide: true, timeout });
}

/**
 * Escolhe automaticamente entre execução normal ou elevada, dependendo
 * de o comando exigir admin e o processo já estar (ou não) elevado.
 */
async function runCommandSmart(command, requiresAdmin, timeout) {
  const platform = os.platform();
  if (platform !== 'win32') {
    return runShellCommand(command, timeout);
  }

  const alreadyAdmin = await isRunningAsAdmin();
  if (requiresAdmin && !alreadyAdmin) {
    return runElevatedCommand(command, timeout);
  }
  return runShellCommand(command, timeout);
}

module.exports = {
  encodePowerShellCommand,
  isRunningAsAdmin,
  runShellCommand,
  runElevatedCommand,
  runCommandSmart
};