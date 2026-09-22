const { ipcMain } = require('electron');
const os = require('os');
const store = require('../store');
const { runCommandSmart, runShellCommand, runElevatedScriptWithOutput, isRunningAsAdmin } = require('../utils/shell');
const { withLicense } = require('../utils/licenseGuard');
const { log } = require('../utils/logger');
const { saveSnapshot, getSnapshot, removeSnapshot } = require('../utils/snapshotManager');

/**
 * Catálogo de tweaks. Cada item pode ser:
 * - LEGADO (padrão atual): tem `commands.win.apply/revert` — aplica/reverte
 *   "cego", sem checar estado real. Continua funcionando como sempre.
 * - MOTOR DE SNAPSHOT (novo, `engine: 'snapshot'`): tem `registry` em vez
 *   de commands.win — o motor lê o valor real antes de aplicar, salva num
 *   snapshot, aplica, e verifica. `commands.linux` continua existindo como
 *   fallback simulado fora do Windows.
 */
const TWEAKS_CATALOG = [
  {
    id: 'gaming-priority',
    category: 'Gaming',
    title: 'Prioridade de CPU para Jogos',
    description: 'Ajusta o agendador do Windows para priorizar processos de jogos em primeiro plano.',
    requiresAdmin: true,
    commands: {
      win: {
        apply: `if (-not (Test-Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl")) { New-Item -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" -Force | Out-Null }; Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" -Name "Win32PrioritySeparation" -Value 38`,
        revert: `if (-not (Test-Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl")) { New-Item -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" -Force | Out-Null }; Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl" -Name "Win32PrioritySeparation" -Value 2`
      },
      linux: { apply: `echo "simulado"`, revert: `echo "simulado"` }
    }
  },
  {
    // MIGRADO PARA O MOTOR DE SNAPSHOT — primeiro tweak da Fase 2.
    // Antes: apply fixava sempre 2, revert fixava sempre 1 — assumindo que
    // "1" era o valor original de qualquer máquina, o que é falso (pode
    // nunca ter existido, ou já estar em 2 antes de qualquer ação nossa).
    id: 'gpu-scheduling',
    category: 'GPU',
    title: 'Hardware-Accelerated GPU Scheduling',
    description: 'Ativa o agendamento de GPU via hardware (HAGS) para reduzir latência de renderização.',
    requiresAdmin: true,
    engine: 'snapshot',
    registry: {
      path: 'HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers',
      name: 'HwSchMode',
      applyValue: 2,
      type: 'DWord'
    },
    commands: {
      linux: { apply: `echo "simulado"`, revert: `echo "simulado"` }
    }
  },
  {
    id: 'network-nagle',
    category: 'Rede',
    title: 'Desativar Algoritmo de Nagle',
    description: 'Reduz a latência de rede desativando o agrupamento de pacotes TCP pequenos.',
    requiresAdmin: true,
    commands: {
      win: {
        apply: `Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces" | ForEach-Object { Set-ItemProperty -Path $_.PSPath -Name "TcpAckFrequency" -Value 1 -ErrorAction SilentlyContinue; Set-ItemProperty -Path $_.PSPath -Name "TCPNoDelay" -Value 1 -ErrorAction SilentlyContinue }`,
        revert: `Get-ChildItem "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces" | ForEach-Object { Remove-ItemProperty -Path $_.PSPath -Name "TcpAckFrequency" -ErrorAction SilentlyContinue; Remove-ItemProperty -Path $_.PSPath -Name "TCPNoDelay" -ErrorAction SilentlyContinue }`
      },
      linux: { apply: `echo "simulado"`, revert: `echo "simulado"` }
    }
  },
  {
    id: 'network-throttling',
    category: 'Rede',
    title: 'Desativar Limitação de Rede e Priorizar Jogos (MMCSS)',
    description: 'Remove o limite de rede em segundo plano e configura o perfil MMCSS de jogos com prioridade máxima de CPU/GPU.',
    requiresAdmin: true,
    commands: {
      win: {
        apply: `
$profilePath = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile"
if (-not (Test-Path $profilePath)) { New-Item -Path $profilePath -Force | Out-Null }
Set-ItemProperty -Path $profilePath -Name "NetworkThrottlingIndex" -Value 0xffffffff
Set-ItemProperty -Path $profilePath -Name "SystemResponsiveness" -Value 0
$gamesPath = "$profilePath\\Tasks\\Games"
if (-not (Test-Path $gamesPath)) { New-Item -Path $gamesPath -Force | Out-Null }
Set-ItemProperty -Path $gamesPath -Name "GPU Priority" -Value 8
Set-ItemProperty -Path $gamesPath -Name "Priority" -Value 6
Set-ItemProperty -Path $gamesPath -Name "Scheduling Category" -Value "High"
        `.trim(),
        revert: `
$profilePath = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile"
Set-ItemProperty -Path $profilePath -Name "NetworkThrottlingIndex" -Value 10 -ErrorAction SilentlyContinue
Set-ItemProperty -Path $profilePath -Name "SystemResponsiveness" -Value 20 -ErrorAction SilentlyContinue
$gamesPath = "$profilePath\\Tasks\\Games"
Set-ItemProperty -Path $gamesPath -Name "GPU Priority" -Value 8 -ErrorAction SilentlyContinue
Set-ItemProperty -Path $gamesPath -Name "Priority" -Value 2 -ErrorAction SilentlyContinue
Set-ItemProperty -Path $gamesPath -Name "Scheduling Category" -Value "Medium" -ErrorAction SilentlyContinue
        `.trim()
      },
      linux: { apply: `echo "simulado"`, revert: `echo "simulado"` }
    }
  },
  {
    id: 'disable-telemetry',
    category: 'Privacidade',
    title: 'Desativar Telemetria do Windows',
    description: 'Interrompe o envio de dados de diagnóstico e uso para a Microsoft.',
    requiresAdmin: true,
    commands: {
      win: {
        apply: `if (-not (Test-Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection")) { New-Item -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" -Force | Out-Null }; Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" -Name "AllowTelemetry" -Value 0`,
        revert: `Set-ItemProperty -Path "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection" -Name "AllowTelemetry" -Value 1 -ErrorAction SilentlyContinue`
      },
      linux: { apply: `echo "simulado"`, revert: `echo "simulado"` }
    }
  },
  {
    id: 'power-plan',
    category: 'Performance',
    title: 'Plano de Energia Ultimate',
    description: 'Habilita o plano de energia oculto de máxima performance do Windows.',
    requiresAdmin: true,
    commands: {
      win: {
        apply: `powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61; powercfg -setactive e9a42b02-d5df-448d-aa00-03f14749eb61`,
        revert: `powercfg -setactive 381b4222-f694-41f0-9685-ff5bb260df2e`
      },
      linux: { apply: `echo "simulado"`, revert: `echo "simulado"` }
    }
  },
  {
    id: 'visual-performance',
    category: 'Performance',
    title: 'Priorizar Desempenho Visual',
    description: 'Desativa animações de janelas, sombras e transparências, mantendo as fontes suaves (ClearType) intactas.',
    requiresAdmin: false,
    commands: {
      win: {
        apply: `Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop\\WindowMetrics" -Name "MinAnimate" -Value "0" -ErrorAction SilentlyContinue; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "TaskbarAnimations" -Value 0 -ErrorAction SilentlyContinue; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "ListviewAlphaSelect" -Value 0 -ErrorAction SilentlyContinue; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "ListviewShadow" -Value 0 -ErrorAction SilentlyContinue; Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop" -Name "DragFullWindows" -Value "0" -ErrorAction SilentlyContinue; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\DWM" -Name "EnableAeroPeek" -Value 0 -ErrorAction SilentlyContinue`,
        revert: `Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop\\WindowMetrics" -Name "MinAnimate" -Value "1" -ErrorAction SilentlyContinue; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "TaskbarAnimations" -Value 1 -ErrorAction SilentlyContinue; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "ListviewAlphaSelect" -Value 1 -ErrorAction SilentlyContinue; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "ListviewShadow" -Value 1 -ErrorAction SilentlyContinue; Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop" -Name "DragFullWindows" -Value "1" -ErrorAction SilentlyContinue; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\DWM" -Name "EnableAeroPeek" -Value 1 -ErrorAction SilentlyContinue`
      },
      linux: { apply: `echo "simulado"`, revert: `echo "simulado"` }
    }
  },
  {
    id: 'disable-hpet',
    category: 'Performance',
    title: 'Desativar HPET (Timer de Alta Precisão)',
    description: 'Reduz o overhead de sincronização de timer do Windows, diminuindo o input lag em jogos competitivos.',
    requiresAdmin: true,
    requiresReboot: true,
    commands: {
      win: {
        apply: `bcdedit /deletevalue useplatformclock 2>$null; bcdedit /set disabledynamictick yes 2>$null; exit 0`,
        revert: `bcdedit /deletevalue useplatformclock 2>$null; bcdedit /deletevalue disabledynamictick 2>$null; exit 0`
      },
      linux: { apply: `echo "simulado"`, revert: `echo "simulado"` }
    }
  },
  {
    id: 'disable-mouse-accel',
    category: 'Gaming',
    title: 'Desativar Aceleração do Mouse',
    description: 'Garante resposta 1:1 do ponteiro (Precision Pointer), essencial para mira precisa em jogos FPS.',
    requiresAdmin: false,
    commands: {
      win: {
        apply: `
Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseSpeed" -Value "0"
Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseThreshold1" -Value "0"
Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseThreshold2" -Value "0"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseNative {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, int[] pvParam, uint fWinIni);
}
"@
$mouseParams = @(0, 0, 0)
[MouseNative]::SystemParametersInfo(0x0004, 0, $mouseParams, 0x03) | Out-Null
        `.trim(),
        revert: `
Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseSpeed" -Value "1"
Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseThreshold1" -Value "6"
Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseThreshold2" -Value "10"
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseNativeRevert {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, int[] pvParam, uint fWinIni);
}
"@
$mouseParams = @(6, 10, 1)
[MouseNativeRevert]::SystemParametersInfo(0x0004, 0, $mouseParams, 0x03) | Out-Null
        `.trim()
      },
      linux: { apply: `echo "simulado"`, revert: `echo "simulado"` }
    }
  },
  {
    id: 'disable-fullscreen-opt',
    category: 'Gaming',
    title: 'Desativar Otimizações de Tela Cheia',
    description: 'Desativa Fullscreen Optimizations e a gravação do Game Bar em segundo plano, reduzindo input lag e stutter.',
    requiresAdmin: false,
    commands: {
      win: {
        apply: `if (-not (Test-Path "HKCU:\\System\\GameConfigStore")) { New-Item -Path "HKCU:\\System\\GameConfigStore" -Force | Out-Null }; Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_FSEBehaviorMode" -Value 2; Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_FSEBehaviorModeUserChoice" -Value 2; Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_DXGIHonorFSEWindowsCompatible" -Value 1; Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -Value 0; if (-not (Test-Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR")) { New-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Force | Out-Null }; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Name "AppCaptureEnabled" -Value 0`,
        revert: `Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_FSEBehaviorMode" -Value 0 -ErrorAction SilentlyContinue; Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_FSEBehaviorModeUserChoice" -Value 0 -ErrorAction SilentlyContinue; Set-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -Value 1 -ErrorAction SilentlyContinue; Set-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Name "AppCaptureEnabled" -Value 1 -ErrorAction SilentlyContinue`
      },
      linux: { apply: `echo "simulado"`, revert: `echo "simulado"` }
    }
  },
  {
    id: 'background-apps',
    category: 'Performance',
    title: 'Suspender Apps em Segundo Plano',
    description: 'Impede que aplicativos UWP consumam CPU quando minimizados.',
    requiresAdmin: false,
    commands: {
      win: {
        apply: `Set-ItemProperty -Path "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" -Name "GlobalUserDisabled" -Value 1 -ErrorAction SilentlyContinue`,
        revert: `Set-ItemProperty -Path "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications" -Name "GlobalUserDisabled" -Value 0 -ErrorAction SilentlyContinue`
      },
      linux: { apply: `echo "simulado"`, revert: `echo "simulado"` }
    }
  }
];

function getPublicCatalog() {
  const appliedState = store.get('tweaksApplied', {});
  return TWEAKS_CATALOG.map(({ id, category, title, description, requiresAdmin, requiresReboot }) => ({
    id, category, title, description, requiresAdmin,
    requiresReboot: !!requiresReboot,
    enabled: appliedState[id] || false
  }));
}

function setTweakState(tweakId, enabled) {
  const appliedState = store.get('tweaksApplied', {});
  appliedState[tweakId] = enabled;
  store.set('tweaksApplied', appliedState);
}

function computeOptimizationScore() {
  const appliedState = store.get('tweaksApplied', {});
  const total = TWEAKS_CATALOG.length;
  const activeCount = TWEAKS_CATALOG.filter((t) => appliedState[t.id]).length;
  const score = total > 0 ? Math.round((activeCount / total) * 100) : 0;
  return { score, activeCount, total };
}

// --------------------------------------------------------------------
// Motor de Snapshot: gera scripts PowerShell genéricos a partir de
// `registry` — nenhum tweak precisa escrever seu próprio PS de leitura.
// --------------------------------------------------------------------

function buildRegistryReadScript(registry) {
  return `
$path = "${registry.path}"
$name = "${registry.name}"
$pathExists = Test-Path $path
$propExists = $false
$value = $null
if ($pathExists) {
  $item = Get-ItemProperty -Path $path -Name $name -ErrorAction SilentlyContinue
  if ($null -ne $item -and ($item.PSObject.Properties.Name -contains $name)) {
    $propExists = $true
    $value = $item.$name
  }
}
[PSCustomObject]@{ PathExists = $pathExists; PropertyExists = $propExists; Value = $value } | ConvertTo-Json -Compress
`.trim();
}

function buildRegistryApplyScript(registry) {
  return `
$path = "${registry.path}"
$name = "${registry.name}"
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
$existing = Get-ItemProperty -Path $path -Name $name -ErrorAction SilentlyContinue
if ($null -ne $existing -and ($existing.PSObject.Properties.Name -contains $name)) {
  Set-ItemProperty -Path $path -Name $name -Value ${registry.applyValue}
} else {
  New-ItemProperty -Path $path -Name $name -Value ${registry.applyValue} -PropertyType ${registry.type} -Force | Out-Null
}
`.trim();
}

/**
 * Restaura EXATAMENTE o estado salvo no snapshot: se a propriedade não
 * existia antes, ela é removida (não "zerada"); se existia com um valor
 * específico, esse valor exato é reescrito.
 */
function buildRegistryRestoreScript(registry, previousState) {
  const regPath = registry.path;
  const name = registry.name;

  if (!previousState || !previousState.propertyExists) {
    return `
if (Test-Path "${regPath}") {
  Remove-ItemProperty -Path "${regPath}" -Name "${name}" -ErrorAction SilentlyContinue
}
`.trim();
  }

  return `
if (-not (Test-Path "${regPath}")) { New-Item -Path "${regPath}" -Force | Out-Null }
Set-ItemProperty -Path "${regPath}" -Name "${name}" -Value ${previousState.value}
`.trim();
}

async function readRegistryState(registry) {
  const { stdout } = await runShellCommand(buildRegistryReadScript(registry), 10000);
  const trimmed = (stdout || '').trim();
  if (!trimmed) return { pathExists: false, propertyExists: false, value: null };
  const parsed = JSON.parse(trimmed);
  return {
    pathExists: !!parsed.PathExists,
    propertyExists: !!parsed.PropertyExists,
    value: parsed.Value
  };
}

/**
 * Fluxo completo: Read → Snapshot → Apply → Verify.
 * Só marca o tweak como ativo se a verificação confirmar o valor real.
 */
async function applyWithSnapshot(tweak) {
  const { registry } = tweak;

  try {
    log.info(`[snapshot-engine] READ "${tweak.id}" antes de aplicar...`);
    const before = await readRegistryState(registry);
    log.info(`[snapshot-engine] Estado atual de "${tweak.id}":`, before);

    saveSnapshot(tweak.id, before);

    log.info(`[snapshot-engine] APPLY "${tweak.id}"...`);
    await runCommandSmart(buildRegistryApplyScript(registry), tweak.requiresAdmin, 15000);

    log.info(`[snapshot-engine] VERIFY "${tweak.id}"...`);
    const after = await readRegistryState(registry);
    const verified = after.propertyExists && Number(after.value) === Number(registry.applyValue);

    if (!verified) {
      log.error(`[snapshot-engine] Verificação falhou para "${tweak.id}". Esperado ${registry.applyValue}, obtido ${after.value}.`);
      return { success: false, tweakId: tweak.id, error: 'A alteração não pôde ser confirmada após aplicada. Nada foi marcado como ativo.' };
    }

    setTweakState(tweak.id, true);
    log.info(`[snapshot-engine] "${tweak.id}" aplicado e verificado com sucesso.`);
    return { success: true, tweakId: tweak.id, enabled: true };
  } catch (error) {
    log.error(`[snapshot-engine] Erro ao aplicar "${tweak.id}":`, error.message);
    const userCancelled = error.message.includes('1223') || error.message.includes('cancelado');
    return {
      success: false, tweakId: tweak.id,
      error: userCancelled ? 'Você cancelou a permissão de administrador solicitada pelo Windows.' : 'Falha ao aplicar este ajuste.'
    };
  }
}

/**
 * Fluxo completo: Restore (do snapshot) → Verify → Clean.
 * Recusa reverter se não existir snapshot — não "adivinha" um padrão.
 */
async function revertWithSnapshot(tweak) {
  const snapshot = getSnapshot(tweak.id);

  if (!snapshot) {
    log.error(`[snapshot-engine] Nenhum snapshot encontrado para "${tweak.id}" — reversão recusada.`);
    return {
      success: false, tweakId: tweak.id,
      error: 'Nenhum estado original salvo para este ajuste. Não é possível reverter com segurança.'
    };
  }

  const { registry } = tweak;

  try {
    log.info(`[snapshot-engine] RESTORE "${tweak.id}" para o estado original...`, snapshot.previousState);
    await runCommandSmart(buildRegistryRestoreScript(registry, snapshot.previousState), tweak.requiresAdmin, 15000);

    log.info(`[snapshot-engine] VERIFY (restore) "${tweak.id}"...`);
    const after = await readRegistryState(registry);

    const expectedExists = snapshot.previousState.propertyExists;
    const restored = expectedExists
      ? (after.propertyExists && Number(after.value) === Number(snapshot.previousState.value))
      : !after.propertyExists;

    if (!restored) {
      log.error(`[snapshot-engine] Falha ao verificar restauração de "${tweak.id}".`, after);
      return { success: false, tweakId: tweak.id, error: 'Não foi possível confirmar a restauração do valor original. O snapshot foi mantido.' };
    }

    removeSnapshot(tweak.id);
    setTweakState(tweak.id, false);
    log.info(`[snapshot-engine] "${tweak.id}" restaurado e verificado com sucesso.`);
    return { success: true, tweakId: tweak.id, enabled: false };
  } catch (error) {
    log.error(`[snapshot-engine] Erro ao restaurar "${tweak.id}":`, error.message);
    const userCancelled = error.message.includes('1223') || error.message.includes('cancelado');
    return {
      success: false, tweakId: tweak.id,
      error: userCancelled ? 'Você cancelou a permissão de administrador solicitada pelo Windows.' : 'Falha ao restaurar este ajuste.'
    };
  }
}

function registerTweaksHandlers() {
  ipcMain.handle('tweaks:get-catalog', async () => getPublicCatalog());
  ipcMain.handle('tweaks:get-applied-state', async () => store.get('tweaksApplied', {}));

  ipcMain.handle('tweaks:apply', withLicense(async (_event, tweakId) => {
    const tweak = TWEAKS_CATALOG.find((t) => t.id === tweakId);
    if (!tweak) return { success: false, error: `Tweak "${tweakId}" não encontrado.` };

    // Motor novo: só no Windows, já que registry não existe em outros SOs.
    if (tweak.engine === 'snapshot' && os.platform() === 'win32') {
      return applyWithSnapshot(tweak);
    }

    // Caminho legado (inalterado) — cobre todos os outros tweaks e o
    // fallback simulado do próprio HAGS fora do Windows.
    const commandSet = os.platform() === 'win32' ? tweak.commands.win : tweak.commands.linux;
    try {
      await runCommandSmart(commandSet.apply, tweak.requiresAdmin, 15000);
      setTweakState(tweakId, true);
      return { success: true, tweakId, enabled: true };
    } catch (error) {
      log.error(`[tweaks:apply] "${tweakId}":`, error.message);
      const userCancelled = error.message.includes('1223') || error.message.includes('cancelado');
      return {
        success: false, tweakId,
        error: userCancelled ? 'Você cancelou a permissão de administrador solicitada pelo Windows.' : 'Falha ao aplicar este ajuste.'
      };
    }
  }));

  ipcMain.handle('tweaks:revert', withLicense(async (_event, tweakId) => {
    const tweak = TWEAKS_CATALOG.find((t) => t.id === tweakId);
    if (!tweak) return { success: false, error: `Tweak "${tweakId}" não encontrado.` };

    if (tweak.engine === 'snapshot' && os.platform() === 'win32') {
      return revertWithSnapshot(tweak);
    }

    const commandSet = os.platform() === 'win32' ? tweak.commands.win : tweak.commands.linux;
    try {
      await runCommandSmart(commandSet.revert, tweak.requiresAdmin, 15000);
      setTweakState(tweakId, false);
      return { success: true, tweakId, enabled: false };
    } catch (error) {
      log.error(`[tweaks:revert] "${tweakId}":`, error.message);
      const userCancelled = error.message.includes('1223') || error.message.includes('cancelado');
      return {
        success: false, tweakId,
        error: userCancelled ? 'Você cancelou a permissão de administrador solicitada pelo Windows.' : 'Falha ao reverter este ajuste.'
      };
    }
  }));

  ipcMain.handle('tweaks:revert-all', withLicense(async () => {
    try {
      return await revertAllTweaks();
    } catch (error) {
      log.error('[tweaks:revert-all]', error);
      return { success: false, error: 'Falha ao restaurar as otimizações.' };
    }
  }));
}

/**
 * Reversão em lote (já existente da rodada anterior). Tweaks com motor de
 * snapshot são revertidos individualmente ANTES do lote legado, cada um
 * com seu próprio Verify — não entram no script elevado agrupado, porque
 * precisam ler o snapshot específico de cada um, não apenas "desfazer cego".
 */
async function revertAllTweaks() {
  const platform = os.platform();
  const appliedState = store.get('tweaksApplied', {});
  const activeTweaks = TWEAKS_CATALOG.filter((t) => appliedState[t.id]);

  if (activeTweaks.length === 0) {
    return { success: true, reverted: [], failed: [] };
  }

  const reverted = [];
  const failed = [];

  const snapshotTweaks = activeTweaks.filter((t) => t.engine === 'snapshot' && platform === 'win32');
  const legacyUserTweaks = activeTweaks.filter((t) => !(t.engine === 'snapshot' && platform === 'win32') && !t.requiresAdmin);
  const legacyAdminTweaks = activeTweaks.filter((t) => !(t.engine === 'snapshot' && platform === 'win32') && t.requiresAdmin);

  // Tweaks com snapshot: revertidos um por um, com seu próprio Verify.
  for (const tweak of snapshotTweaks) {
    const result = await revertWithSnapshot(tweak);
    if (result.success) reverted.push(tweak.id);
    else failed.push({ id: tweak.id, error: result.error });
  }

  // Legado sem admin: revertido direto, sem UAC.
  for (const tweak of legacyUserTweaks) {
    const cmd = platform === 'win32' ? tweak.commands.win.revert : tweak.commands.linux.revert;
    try {
      await runShellCommand(cmd, 15000);
      reverted.push(tweak.id);
    } catch (error) {
      log.error(`[tweaks:revert-all] Falha ao reverter "${tweak.id}" (sem admin):`, error.message);
      failed.push({ id: tweak.id, error: error.message });
    }
  }

  // Legado com admin: agrupados em um único script elevado (um só UAC).
  if (legacyAdminTweaks.length > 0) {
    if (platform !== 'win32') {
      for (const tweak of legacyAdminTweaks) {
        try {
          await runShellCommand(tweak.commands.linux.revert, 15000);
          reverted.push(tweak.id);
        } catch (error) {
          failed.push({ id: tweak.id, error: error.message });
        }
      }
    } else if (isRunningAsAdmin()) {
      for (const tweak of legacyAdminTweaks) {
        try {
          await runShellCommand(tweak.commands.win.revert, 15000);
          reverted.push(tweak.id);
        } catch (error) {
          log.error(`[tweaks:revert-all] Falha ao reverter "${tweak.id}" (já admin):`, error.message);
          failed.push({ id: tweak.id, error: error.message });
        }
      }
    } else {
      const scriptBody = legacyAdminTweaks.map((tweak) => `
try {
${tweak.commands.win.revert}
$results += [PSCustomObject]@{ Id = '${tweak.id}'; Success = $true }
} catch {
$results += [PSCustomObject]@{ Id = '${tweak.id}'; Success = $false; Error = $_.Exception.Message }
}
`).join('\n');

      const fullScript = `
$results = @()
${scriptBody}
$__resultJson = $results | ConvertTo-Json -Compress
`.trim();

      try {
        const raw = await runElevatedScriptWithOutput(fullScript, 60000);
        const list = Array.isArray(raw) ? raw : [raw];
        list.forEach((r) => {
          if (r.Success) reverted.push(r.Id);
          else failed.push({ id: r.Id, error: r.Error });
        });
      } catch (error) {
        log.error('[tweaks:revert-all] Falha no lote elevado:', error.message);
        const userCancelled = error.message.includes('cancelado') || error.message.includes('Código:');
        legacyAdminTweaks.forEach((t) => failed.push({
          id: t.id,
          error: userCancelled ? 'Permissão de administrador cancelada.' : error.message
        }));
      }
    }
  }

  const newState = { ...appliedState };
  reverted.forEach((id) => { newState[id] = false; });
  store.set('tweaksApplied', newState);

  log.info(`[tweaks:revert-all] ${reverted.length} revertido(s), ${failed.length} falha(s).`);

  return { success: failed.length === 0, reverted, failed };
}

module.exports = { registerTweaksHandlers, computeOptimizationScore };