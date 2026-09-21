const { ipcMain } = require('electron');
const os = require('os');
const { runShellCommand, runElevatedScriptWithOutput, isRunningAsAdmin } = require('../utils/shell');

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

  const trimmed = (stdout || '').trim();
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

/**
 * Desinstala vários pacotes de uma vez, com UM único prompt de UAC para o lote,
 * quando o app não estiver rodando elevado.
 */
async function uninstallBatch(packageFullNames) {
  const escapedList = packageFullNames
    .map((pkg) => `'${pkg.replace(/'/g, "''")}'`)
    .join(',');

  // Script que desinstala cada pacote e acumula o resultado individual
  const scriptBody = `
$results = @()
$packages = @(${escapedList})
foreach ($pkg in $packages) {
  try {
    Remove-AppxPackage -Package $pkg -AllUsers -ErrorAction Stop
    $results += [PSCustomObject]@{ Package = $pkg; Success = $true }
  } catch {
    $results += [PSCustomObject]@{ Package = $pkg; Success = $false; Error = $_.Exception.Message }
  }
}
$__resultJson = $results | ConvertTo-Json -Compress
`.trim();

  if (isRunningAsAdmin()) {
    // Já elevado: roda direto via runShellCommand, imprime o JSON no stdout
    const inlineScript = scriptBody.replace(
      '$__resultJson = $results | ConvertTo-Json -Compress',
      '$results | ConvertTo-Json -Compress'
    );
    const { stdout } = await runShellCommand(inlineScript, 40000);
    const parsed = JSON.parse((stdout || '[]').trim());
    return Array.isArray(parsed) ? parsed : [parsed];
  }

  // Não elevado: um único UAC para o lote inteiro, resultado via arquivo temporário
  const result = await runElevatedScriptWithOutput(scriptBody, 60000);
  return Array.isArray(result) ? result : [result];
}

/**
 * Traduz mensagens de erro técnicas do Windows (Remove-AppxPackage) para
 * algo compreensível pelo usuário final, em vez do HRESULT bruto.
 */
function translateUninstallError(rawError) {
  if (!rawError) return 'Motivo não informado pelo Windows.';

  const msg = rawError.toLowerCase();

  if (msg.includes('0x80073cf0') || msg.includes('cannot be uninstalled')) {
    return 'Este é um componente protegido do Windows e não pode ser removido por este método.';
  }
  if (msg.includes('0x80073d02') || msg.includes('in use')) {
    return 'O aplicativo está em uso no momento. Feche-o e tente novamente.';
  }
  if (msg.includes('dependency') || msg.includes('depend')) {
    return 'Outros componentes do sistema dependem deste aplicativo.';
  }
  if (msg.includes('access is denied') || msg.includes('acesso negado')) {
    return 'Permissão negada pelo Windows para remover este componente.';
  }

  return rawError; // fallback: mostra a mensagem original se não reconhecida
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

  ipcMain.handle('apps:uninstall-batch', async (_event, packageFullNames) => {
    if (os.platform() !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    if (!Array.isArray(packageFullNames) || packageFullNames.length === 0) {
      return { success: false, error: 'Nenhum aplicativo selecionado.' };
    }

    try {
      const results = await uninstallBatch(packageFullNames);
      const removedIds = results.filter((r) => r.Success).map((r) => r.Package);
      const failed = results.filter((r) => !r.Success);

      return {
        success: failed.length === 0,
        removedIds,
        failed: failed.map((f) => ({ id: f.Package, error: translateUninstallError(f.Error) }))
      };
    } catch (error) {
      console.error('[apps:uninstall-batch] Erro:', error.message);
      const userCancelled = error.message.includes('cancelado') || error.message.includes('Código: 1');
      return {
        success: false,
        error: userCancelled
          ? 'Você cancelou a permissão de administrador solicitada pelo Windows.'
          : 'Falha ao desinstalar os aplicativos selecionados.'
      };
    }
  });
}

module.exports = { registerAppsHandlers };