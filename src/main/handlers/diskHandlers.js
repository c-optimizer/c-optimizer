const { ipcMain } = require('electron');
const os = require('os');
const { runShellCommand, runCommandSmart } = require('../utils/shell');
const { withLicense } = require('../utils/licenseGuard');

function mapMediaType(raw) {
  const value = String(raw).toUpperCase();
  if (value === '4' || value === 'SSD') return 'SSD';
  if (value === '3' || value === 'HDD') return 'HDD';
  return 'Desconhecido';
}

async function listVolumes() {
  if (os.platform() !== 'win32') return [];

  const script = `
$disks = Get-PhysicalDisk | Select-Object DeviceId, MediaType
$partitions = Get-Partition | Where-Object { $_.DriveLetter -match '[A-Za-z]' } | Select-Object DiskNumber, DriveLetter
$result = @()
foreach ($p in $partitions) {
  $disk = $disks | Where-Object { $_.DeviceId -eq [string]$p.DiskNumber }
  $result += [PSCustomObject]@{ DriveLetter = $p.DriveLetter; MediaType = if ($disk) { $disk.MediaType } else { 'Unspecified' } }
}
$result | ConvertTo-Json -Compress
`.trim();

  const { stdout } = await runShellCommand(script, 20000);
  const trimmed = (stdout || '').trim();
  if (!trimmed) return [];

  const parsed = JSON.parse(trimmed);
  const list = Array.isArray(parsed) ? parsed : [parsed];
  return list.map((v) => ({ driveLetter: v.DriveLetter, type: mapMediaType(v.MediaType) }));
}

async function optimizeDrive(driveLetter, type) {
  const script = type === 'SSD'
    ? `Optimize-Volume -DriveLetter ${driveLetter} -ReTrim`
    : `Optimize-Volume -DriveLetter ${driveLetter} -Defrag`;
  await runCommandSmart(script, true, 600000);
}

function registerDiskHandlers() {
  ipcMain.handle('disk:list-volumes', async () => {
    try {
      const volumes = await listVolumes();
      return { success: true, volumes };
    } catch (error) {
      console.error('[disk:list-volumes] Erro:', error.message);
      return { success: false, volumes: [], error: 'Não foi possível listar os discos.' };
    }
  });

  ipcMain.handle('disk:optimize', withLicense(async (_event, { driveLetter, type }) => {
    if (!driveLetter) return { success: false, error: 'Unidade não informada.' };
    try {
      await optimizeDrive(driveLetter, type);
      return { success: true };
    } catch (error) {
      console.error('[disk:optimize] Erro:', error.message);
      const userCancelled = error.message.includes('1223') || error.message.includes('cancelado');
      return {
        success: false,
        error: userCancelled
          ? 'Você cancelou a permissão de administrador solicitada pelo Windows.'
          : 'Falha ao otimizar a unidade.'
      };
    }
  }));
}

module.exports = { registerDiskHandlers };