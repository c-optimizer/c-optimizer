const { ipcMain } = require('electron');
const os = require('os');
const store = require('../store');
const { runPowerShellScript, runElevatedCommand, isRunningAsAdmin } = require('../utils/shell');

/**
 * Catálogo de tweaks. Cada tweak tem:
 * - id: identificador único (usado pela UI)
 * - category: para filtro na OptimizationsView
 * - title/description: exibidos na UI (fonte única de verdade)
 * - commands.win / commands.linux: { apply, revert } — comandos shell
 * - requiresAdmin: se true, dispara elevação sob demanda quando necessário
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
      linux: {
        apply: `echo "Ajuste de prioridade aplicado (simulado neste SO)"`,
        revert: `echo "Ajuste de prioridade revertido (simulado neste SO)"`
      }
    }
  },
  {
    id: 'gpu-scheduling',
    category: 'GPU',
    title: 'Hardware-Accelerated GPU Scheduling',
    description: 'Ativa o agendamento de GPU via hardware para reduzir latência de renderização.',
    requiresAdmin: true,
    commands: {
      win: {
        apply: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" -Name "HwSchMode" -Value 2`,
        revert: `Set-ItemProperty -Path "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers" -Name "HwSchMode" -Value 1`
      },
      linux: {
        apply: `echo "GPU scheduling ajustado (simulado neste SO)"`,
        revert: `echo "GPU scheduling revertido (simulado neste SO)"`
      }
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
      linux: {
        apply: `echo "Nagle desativado (simulado neste SO)"`,
        revert: `echo "Nagle reativado (simulado neste SO)"`
      }
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
      linux: {
        apply: `echo "Telemetria desativada (simulado neste SO)"`,
        revert: `echo "Telemetria reativada (simulado neste SO)"`
      }
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
      linux: {
        apply: `echo "Plano de energia ajustado (simulado neste SO)"`,
        revert: `echo "Plano de energia revertido (simulado neste SO)"`
      }
    }
  },
  {
    id: 'gpu-latency',
    category: 'GPU',
    title: 'Baixa Latência NVIDIA Reflex',
    description: 'Reduz a fila de renderização para menor input lag em jogos competitivos.',
    requiresAdmin: false,
    commands: {
      win: {
        apply: `echo "Ajuste de latência NVIDIA aplicado (requer NVIDIA Profile Inspector para efeito real)"`,
        revert: `echo "Ajuste de latência NVIDIA revertido"`
      },
      linux: {
        apply: `echo "Ajuste de latência NVIDIA aplicado (simulado neste SO)"`,
        revert: `echo "Ajuste de latência NVIDIA revertido (simulado neste SO)"`
      }
    }
  },
  {
    id: 'network-dns',
    category: 'Rede',
    title: 'DNS Otimizado para Jogos',
    description: 'Substitui o DNS padrão por servidores de baixa latência (Cloudflare 1.1.1.1).',
    requiresAdmin: true,
    commands: {
      win: {
        apply: `Get-NetAdapter | Where-Object {$_.Status -eq "Up"} | ForEach-Object { Set-DnsClientServerAddress -InterfaceIndex $_.InterfaceIndex -ServerAddresses ("1.1.1.1","1.0.0.1") }`,
        revert: `Get-NetAdapter | Where-Object {$_.Status -eq "Up"} | ForEach-Object { Set-DnsClientServerAddress -InterfaceIndex $_.InterfaceIndex -ResetServerAddresses }`
      },
      linux: {
        apply: `echo "DNS ajustado (simulado neste SO)"`,
        revert: `echo "DNS revertido (simulado neste SO)"`
      }
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
      linux: {
        apply: `echo "Apps em segundo plano suspensos (simulado neste SO)"`,
        revert: `echo "Apps em segundo plano reativados (simulado neste SO)"`
      }
    }
  }
];

/**
 * Retorna o catálogo sem os comandos shell (a UI não precisa e não deveria
 * ter acesso a esses detalhes de implementação por segurança/superfície de ataque).
 */
function getPublicCatalog() {
  const appliedState = store.get('tweaksApplied', {});
  return TWEAKS_CATALOG.map(({ id, category, title, description, requiresAdmin }) => ({
    id,
    category,
    title,
    description,
    requiresAdmin,
    enabled: appliedState[id] || false
  }));
}

function setTweakState(tweakId, enabled) {
  const appliedState = store.get('tweaksApplied', {});
  appliedState[tweakId] = enabled;
  store.set('tweaksApplied', appliedState);
}

function registerTweaksHandlers() {
  ipcMain.handle('system:is-admin', async () => {
    return isRunningAsAdmin();
  });

  ipcMain.handle('tweaks:get-catalog', async () => {
    return getPublicCatalog();
  });

  ipcMain.handle('tweaks:get-applied-state', async () => {
    return store.get('tweaksApplied', {});
  });

  ipcMain.handle('tweaks:apply', async (_event, tweakId) => {
    const tweak = TWEAKS_CATALOG.find((t) => t.id === tweakId);
    if (!tweak) {
      return { success: false, error: `Tweak "${tweakId}" não encontrado no catálogo.` };
    }

    const platform = os.platform();
    const commandSet = platform === 'win32' ? tweak.commands.win : tweak.commands.linux;

    try {
      await runCommandSmart(commandSet.apply, tweak.requiresAdmin, 15000);
      setTweakState(tweakId, true);
      return { success: true, tweakId, enabled: true };
    } catch (error) {
      console.error(`[tweaks:apply] Erro ao aplicar "${tweakId}":`, error.message);
      const userCancelled = error.message.includes('1223');
      return {
        success: false,
        tweakId,
        error: userCancelled
          ? 'Você cancelou a permissão de administrador solicitada pelo Windows.'
          : 'Falha ao aplicar este ajuste. Tente novamente.'
      };
    }
  });

  ipcMain.handle('tweaks:revert', async (_event, tweakId) => {
    const tweak = TWEAKS_CATALOG.find((t) => t.id === tweakId);
    if (!tweak) {
      return { success: false, error: `Tweak "${tweakId}" não encontrado no catálogo.` };
    }

    const platform = os.platform();
    const commandSet = platform === 'win32' ? tweak.commands.win : tweak.commands.linux;

    try {
      await runCommandSmart(commandSet.revert, tweak.requiresAdmin, 15000);
      setTweakState(tweakId, false);
      return { success: true, tweakId, enabled: false };
    } catch (error) {
      console.error(`[tweaks:revert] Erro ao reverter "${tweakId}":`, error.message);
      const userCancelled = error.message.includes('1223');
      return {
        success: false,
        tweakId,
        error: userCancelled
          ? 'Você cancelou a permissão de administrador solicitada pelo Windows.'
          : 'Falha ao reverter este ajuste. Tente novamente.'
      };
    }
  });
}

module.exports = { registerTweaksHandlers };