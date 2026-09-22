const { ipcMain } = require('electron');
const os = require('os');
const store = require('../store');
const { runCommandSmart } = require('../utils/shell');
const { withLicense } = require('../utils/licenseGuard');

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
    id: 'gpu-scheduling',
    category: 'GPU',
    title: 'Hardware-Accelerated GPU Scheduling',
    description: 'Ativa o agendamento de GPU via hardware (HAGS) para reduzir latência de renderização.',
    requiresAdmin: true,
    commands: {
      win: {
        apply: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" -Name "HwSchMode" -Value 2`,
        revert: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" -Name "HwSchMode" -Value 1`
      },
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

/**
 * Calcula o score real de otimização: proporção de tweaks ativos em
 * relação ao total do catálogo. Usado pelo Dashboard (via systemHandlers).
 */
function computeOptimizationScore() {
  const appliedState = store.get('tweaksApplied', {});
  const total = TWEAKS_CATALOG.length;
  const activeCount = TWEAKS_CATALOG.filter((t) => appliedState[t.id]).length;
  const score = total > 0 ? Math.round((activeCount / total) * 100) : 0;
  return { score, activeCount, total };
}

function registerTweaksHandlers() {
  ipcMain.handle('tweaks:get-catalog', async () => getPublicCatalog());
  ipcMain.handle('tweaks:get-applied-state', async () => store.get('tweaksApplied', {}));

  ipcMain.handle('tweaks:apply', withLicense(async (_event, tweakId) => {
    const tweak = TWEAKS_CATALOG.find((t) => t.id === tweakId);
    if (!tweak) return { success: false, error: `Tweak "${tweakId}" não encontrado.` };
    const commandSet = os.platform() === 'win32' ? tweak.commands.win : tweak.commands.linux;
    try {
      await runCommandSmart(commandSet.apply, tweak.requiresAdmin, 15000);
      setTweakState(tweakId, true);
      return { success: true, tweakId, enabled: true };
    } catch (error) {
      console.error(`[tweaks:apply] "${tweakId}":`, error.message);
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
    const commandSet = os.platform() === 'win32' ? tweak.commands.win : tweak.commands.linux;
    try {
      await runCommandSmart(commandSet.revert, tweak.requiresAdmin, 15000);
      setTweakState(tweakId, false);
      return { success: true, tweakId, enabled: false };
    } catch (error) {
      console.error(`[tweaks:revert] "${tweakId}":`, error.message);
      const userCancelled = error.message.includes('1223') || error.message.includes('cancelado');
      return {
        success: false, tweakId,
        error: userCancelled ? 'Você cancelou a permissão de administrador solicitada pelo Windows.' : 'Falha ao reverter este ajuste.'
      };
    }
  }));
}

module.exports = { registerTweaksHandlers, computeOptimizationScore };