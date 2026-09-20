const { ipcMain } = require('electron');
const os = require('os');
const { runShellCommand, runCommandSmart } = require('../utils/shell');

const BLOATWARE_CATALOG = [
  { match: 'Microsoft.XboxGamingOverlay', label: 'Xbox Game Bar' },
  { match: 'Microsoft.XboxApp', label: 'Xbox Console Companion' },
  { match: 'Microsoft.XboxIdentityProvider', label: 'Xbox Identity Provider' },
  { match: 'Microsoft.XboxSpeechToTextOverlay', label: 'Xbox Speech To Text Overlay' },
  { match: 'Microsoft.549981C3F5F10', label: 'Cortana' },
  { match: 'Microsoft.MixedReality.Portal', label: 'Mixed Reality Portal' },
  { match: 'Microsoft.SkypeApp', label: 'Skype' },
  { match: 'Microsoft.MicrosoftSolitaireCollection', label: 'Microsoft Solitaire Collection' },
  { match: 'Microsoft.BingWeather', label: 'Clima' },
  { match: 'Microsoft.BingNews', label: 'Notícias' },
  { match: 'Microsoft.ZuneMusic', label: 'Groove Música' },
  { match: 'Microsoft.ZuneVideo', label: 'Filmes e TV' },
  { match: 'Microsoft.YourPhone', label: 'Vínculo ao Celular' },
  { match: 'Microsoft.GetHelp', label: 'Obter Ajuda' },
  { match: 'Microsoft.Getstarted', label: 'Dicas' },
  { match: 'Microsoft.Microsoft3DViewer', label: 'Visualizador 3D' },
  { match: 'Microsoft.MicrosoftOfficeHub', label: 'Atalho do Office' },
  { match: 'Microsoft.People', label: 'Pessoas' },
  { match: 'Microsoft.WindowsFeedbackHub', label: 'Central de Feedback' },
  { match: 'Microsoft.WindowsMaps', label: 'Mapas' },
  { match: 'Microsoft.WindowsSoundRecorder', label: 'Gravador de Voz' },
  { match: 'Microsoft.MicrosoftStickyNotes', label: 'Notas Adesivas' }
];

async function listInstalledBloatware() {
  if (os.platform() !== 'win32') return [];

  const script = `Get-AppxPackage | Select-Object Name, PackageFullName, Publisher | ConvertTo-Json -Compress`;
  const { stdout } = await runShellCommand(script, 20000);

  const trimmed = stdout.trim();
  if (!trimmed) return [];

  const parsed = JSON.parse(trimmed);
  const installed = Array.isArray(parsed) ? parsed : [parsed];
  const installedByName = new Map(installed.map((pkg) => [pkg.Name, pkg]));

  return BLOATWARE_CATALOG
    .filter((entry) => installedByName.has(entry.match))
    .map((entry) => {
      const pkg = installedByName.get(entry.match);
      const publisherRaw = pkg.Publisher || '';
      const publisherClean = publisherRaw.split(',')[0].replace('CN=', '').trim();

      return {
        id: pkg.PackageFullName,
        name: entry.label,
        publisher: publisherClean || 'Microsoft Corporation'
      };
    });
}

function registerAppsHandlers() {
  ipcMain.handle('apps:list-installed', async () => {
    try {
      const apps = await listInstalledBloatware();
      return { success: true, apps };
    } catch (error) {
      console.error('[apps:list-installed] Erro:', error.message);
      return { success: false, apps: [], error: 'Não foi possível listar os aplicativos instalados.' };
    }
  });

  ipcMain.handle('apps:uninstall', async (_event, packageFullName) => {
    if (os.platform() !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    if (!packageFullName || typeof packageFullName !== 'string') {
      return { success: false, error: 'Pacote inválido.' };
    }

    const script = `Remove-AppxPackage -Package '${packageFullName.replace(/'/g, "''")}' -AllUsers`;

    try {
      await runCommandSmart(script, true, 30000);
      return { success: true, packageFullName };
    } catch (error) {
      console.error('[apps:uninstall] Erro:', error.message);
      const userCancelled = error.message.includes('1223') || error.message.includes('cancelado');
      return {
        success: false,
        error: userCancelled
          ? 'Você cancelou a permissão de administrador solicitada pelo Windows.'
          : 'Falha ao desinstalar o aplicativo.'
      };
    }
  });
}

module.exports = { registerAppsHandlers };