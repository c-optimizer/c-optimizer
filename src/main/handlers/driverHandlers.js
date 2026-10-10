const { ipcMain, shell } = require('electron');
const os = require('os');
const { runShellCommand } = require('../utils/shell');
const { withLicense } = require('../utils/licenseGuard');
const { log } = require('../utils/logger');

/**
 * Prefixo UTF-8 para todos os scripts. Sem isso, o ConvertTo-Json
 * serializa caracteres acentuados no codepage ANSI do sistema, corrompendo
 * "ã" em "?" e por aí vai.
 */
const PS_UTF8_HEADER = `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8`;

/**
 * Dispositivos que o próprio app pode desabilitar como efeito colateral
 * de tweaks. São filtrados da lista de "problemas" porque o usuário os
 * desabilitou intencionalmente.
 */
const SELF_DISABLED_DEVICE_PREFIXES = [
  'ACPI\\PNP0103', // High Precision Event Timer (HPET) — via disable-hpet
];

function isSelfDisabledDevice(deviceId, errorCode) {
  if (!deviceId || errorCode !== 22) return false;
  const upper = deviceId.toUpperCase();
  return SELF_DISABLED_DEVICE_PREFIXES.some((prefix) => upper.startsWith(prefix.toUpperCase()));
}

const DEVICE_ERROR_MESSAGES = {
  1: 'Dispositivo não configurado corretamente.',
  3: 'Driver corrompido ou sem memória suficiente.',
  10: 'O dispositivo não consegue iniciar.',
  12: 'Recursos insuficientes para o dispositivo.',
  14: 'É necessário reiniciar o computador para concluir.',
  16: 'O dispositivo não está totalmente configurado.',
  18: 'Reinstale os drivers deste dispositivo.',
  19: 'Registro corrompido. Reinstale o driver.',
  21: 'O Windows está removendo o dispositivo.',
  22: 'O dispositivo está desabilitado.',
  24: 'O dispositivo não está presente ou não funciona.',
  28: 'Drivers não instalados para este dispositivo.',
  29: 'O dispositivo está desabilitado por firmware.',
  31: 'O Windows não consegue carregar os drivers necessários.',
  32: 'Driver de inicialização desabilitado.',
  37: 'O Windows não consegue inicializar o driver.',
  39: 'Driver corrompido ou ausente.',
  43: 'O driver reportou falha.',
  45: 'Dispositivo não conectado no momento.',
};

const MANUFACTURER_URLS = {
  'nvidia': 'https://www.nvidia.com/Download/index.aspx',
  'advanced micro devices': 'https://www.amd.com/en/support',
  'amd': 'https://www.amd.com/en/support',
  'intel': 'https://www.intel.com/content/www/us/en/support/detect.html',
  'realtek': 'https://www.realtek.com/en/component/content/category/24-pc-audio',
  'qualcomm': 'https://www.qualcomm.com/support',
  'broadcom': 'https://www.broadcom.com/support',
  'mediatek': 'https://www.mediatek.com/products/broadband-wifi',
  'atheros': 'https://www.atheros-drivers.com/',
  'logitech': 'https://support.logi.com/hc/en-us',
  'razer': 'https://www.razer.com/synapse-3',
  'corsair': 'https://www.corsair.com/us/en/s/downloads',
  'canon': 'https://www.usa.canon.com/support',
  'hp': 'https://support.hp.com/us-en/drivers',
  'hewlett-packard': 'https://support.hp.com/us-en/drivers',
  'dell': 'https://www.dell.com/support/home',
  'lenovo': 'https://support.lenovo.com/',
  'asus': 'https://www.asus.com/support/Download-Center/',
  'acer': 'https://www.acer.com/us-en/support',
  'samsung': 'https://www.samsung.com/us/support/downloads/',
  'microsoft': 'https://www.microsoft.com/en-us/download',
  'sony': 'https://www.sony.com/electronics/support',
};

function getManufacturerUrl(manufacturer) {
  if (!manufacturer) return null;
  const key = manufacturer.toLowerCase();
  for (const [name, url] of Object.entries(MANUFACTURER_URLS)) {
    if (key.includes(name)) return url;
  }
  return null;
}

function mapDeviceClass(deviceClass) {
  if (!deviceClass) return 'Outros';
  const cls = deviceClass.toLowerCase();
  if (cls.includes('display')) return 'Placa de Vídeo';
  if (cls.includes('net')) return 'Rede';
  if (cls.includes('media') || cls.includes('audio')) return 'Áudio';
  if (cls.includes('bluetooth')) return 'Bluetooth';
  if (cls.includes('usb')) return 'USB';
  if (cls.includes('printer')) return 'Impressora';
  if (cls.includes('system')) return 'Chipset';
  if (cls.includes('hdc') || cls.includes('disk')) return 'Armazenamento';
  if (cls.includes('keyboard')) return 'Teclado';
  if (cls.includes('mouse')) return 'Mouse';
  if (cls.includes('camera') || cls.includes('image')) return 'Câmera / Webcam';
  return 'Outros';
}

async function listDevicesWithProblems() {
  const script = `
${PS_UTF8_HEADER}

$devices = Get-CimInstance Win32_PnPEntity -ErrorAction SilentlyContinue |
  Where-Object { $_.ConfigManagerErrorCode -ne 0 } |
  Select-Object Name, DeviceID, ConfigManagerErrorCode, Manufacturer, Status

$devices | ConvertTo-Json -Compress -Depth 4
`.trim();

  const { stdout } = await runShellCommand(script, 25000);
  const trimmed = (stdout || '').trim();
  if (!trimmed) return [];

  const parsed = JSON.parse(trimmed);
  const list = Array.isArray(parsed) ? parsed : [parsed];

  return list
    .filter((d) => !isSelfDisabledDevice(d.DeviceID, Number(d.ConfigManagerErrorCode)))
    .map((d) => ({
      name: d.Name || 'Dispositivo desconhecido',
      deviceId: d.DeviceID || '',
      errorCode: Number(d.ConfigManagerErrorCode) || 0,
      errorMessage: DEVICE_ERROR_MESSAGES[Number(d.ConfigManagerErrorCode)] || 'Erro desconhecido.',
      manufacturer: d.Manufacturer || 'Desconhecido',
      status: d.Status || 'Unknown',
      officialUrl: getManufacturerUrl(d.Manufacturer),
    }));
}

async function listDrivers() {
  const script = `
${PS_UTF8_HEADER}

$drivers = Get-CimInstance Win32_PnPSignedDriver -ErrorAction SilentlyContinue |
  Where-Object { $_.DeviceName -and $_.DriverVersion } |
  Select-Object DeviceName, DriverVersion, DriverDate, Manufacturer, DeviceClass

$drivers | ConvertTo-Json -Compress -Depth 4
`.trim();

  const { stdout } = await runShellCommand(script, 40000);
  const trimmed = (stdout || '').trim();
  if (!trimmed) return [];

  const parsed = JSON.parse(trimmed);
  const list = Array.isArray(parsed) ? parsed : [parsed];

  return list
    .filter((d) => d.DeviceName && d.DeviceName.trim() !== '')
    .map((d) => {
      let dateIso = null;
      if (d.DriverDate) {
        const m = String(d.DriverDate).match(/^(\d{4})(\d{2})(\d{2})/);
        if (m) {
          dateIso = `${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`;
        } else {
          const parsedDate = new Date(d.DriverDate);
          if (!isNaN(parsedDate.getTime())) dateIso = parsedDate.toISOString();
        }
      }

      return {
        deviceName: d.DeviceName,
        version: d.DriverVersion || '—',
        date: dateIso,
        manufacturer: d.Manufacturer || 'Desconhecido',
        category: mapDeviceClass(d.DeviceClass),
        officialUrl: getManufacturerUrl(d.Manufacturer),
      };
    });
}

const MANUFACTURER_UPDATE_APPS = {
  'nvidia': { id: 'Nvidia.GeForceExperience', name: 'NVIDIA GeForce Experience' },
  'advanced micro devices': { id: 'AMD.AMDSoftware', name: 'AMD Software (Adrenalin)' },
  'amd': { id: 'AMD.AMDSoftware', name: 'AMD Software (Adrenalin)' },
  'intel': { id: 'Intel.IntelDriverAndSupportAssistant', name: 'Intel Driver & Support Assistant' },
};

function detectUpdateAppFromManufacturer(manufacturer) {
  if (!manufacturer) return null;
  const key = manufacturer.toLowerCase();
  for (const [name, app] of Object.entries(MANUFACTURER_UPDATE_APPS)) {
    if (key.includes(name)) return app;
  }
  return null;
}

async function detectGpuManufacturer() {
  const script = `
${PS_UTF8_HEADER}

$gpus = Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue |
  Select-Object Name, AdapterCompatibility
$gpus | ConvertTo-Json -Compress
`.trim();

  try {
    const { stdout } = await runShellCommand(script, 12000);
    const trimmed = (stdout || '').trim();
    if (!trimmed) return [];
    const parsed = JSON.parse(trimmed);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list.map((g) => ({
      name: g.Name || '—',
      manufacturer: g.AdapterCompatibility || '—',
      updateApp: detectUpdateAppFromManufacturer(g.AdapterCompatibility),
    }));
  } catch {
    return [];
  }
}

function registerDriverHandlers() {
  ipcMain.handle('drivers:list-problems', withLicense(async () => {
    if (os.platform() !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    try {
      const devices = await listDevicesWithProblems();
      return { success: true, devices };
    } catch (error) {
      log.error('[drivers:list-problems] Erro:', error.message);
      return { success: false, error: 'Não foi possível listar os dispositivos com problema.' };
    }
  }));

  ipcMain.handle('drivers:list-all', withLicense(async () => {
    if (os.platform() !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    try {
      const drivers = await listDrivers();
      return { success: true, drivers };
    } catch (error) {
      log.error('[drivers:list-all] Erro:', error.message);
      return { success: false, error: 'Não foi possível listar os drivers instalados.' };
    }
  }));

  ipcMain.handle('drivers:get-gpus', withLicense(async () => {
    if (os.platform() !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    try {
      const gpus = await detectGpuManufacturer();
      return { success: true, gpus };
    } catch (error) {
      log.error('[drivers:get-gpus] Erro:', error.message);
      return { success: false, error: 'Não foi possível detectar as placas de vídeo.' };
    }
  }));

  ipcMain.handle('drivers:open-url', withLicense(async (_event, url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) {
      return { success: false, error: 'URL inválida.' };
    }
    try {
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      log.error('[drivers:open-url] Erro:', error.message);
      return { success: false, error: 'Não foi possível abrir o link.' };
    }
  }));

  ipcMain.handle('drivers:open-device-manager', withLicense(async () => {
    if (os.platform() !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    const { spawn } = require('child_process');
    try {
      spawn('cmd.exe', ['/c', 'start devmgmt.msc'], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
      return { success: true };
    } catch (error) {
      log.error('[drivers:open-device-manager] Erro:', error.message);
      return { success: false, error: 'Não foi possível abrir o Gerenciador de Dispositivos.' };
    }
  }));

  ipcMain.handle('drivers:open-windows-update', withLicense(async () => {
    if (os.platform() !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    const { spawn } = require('child_process');
    try {
      spawn('cmd.exe', ['/c', 'start ms-settings:windowsupdate'], { windowsHide: true, detached: true, stdio: 'ignore' }).unref();
      return { success: true };
    } catch (error) {
      log.error('[drivers:open-windows-update] Erro:', error.message);
      return { success: false, error: 'Não foi possível abrir o Windows Update.' };
    }
  }));
}

module.exports = { registerDriverHandlers };