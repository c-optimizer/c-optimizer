const { ipcMain } = require('electron');
const os = require('os');
const store = require('../store');
const { runCommandSmart, runShellCommand, runElevatedScriptWithOutput, isRunningAsAdmin } = require('../utils/shell');
const { withLicense } = require('../utils/licenseGuard');
const { log } = require('../utils/logger');
const { saveSnapshot, getSnapshot, removeSnapshot } = require('../utils/snapshotManager');

/**
 * Catálogo de tweaks. Cada item pode ser:
 * - LEGADO: tem `commands.win.apply/revert` — aplica/reverte "cego".
 * - MOTOR AGNÓSTICO (`engine: 'snapshot'`): tem `read`, `apply`, `verify`,
 *   `restore`, cada um com seu próprio `.script` PowerShell. Todos os
 *   scripts read/verify retornam o mesmo contrato { success, exists, value }
 *   — read e verify devem ser IDÊNTICOS em formato, pois a comparação usa
 *   deepEqual entre eles (necessário para valores em objeto, não só
 *   primitivos).
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
    id: 'gpu-scheduling',
    category: 'GPU',
    title: 'Hardware-Accelerated GPU Scheduling',
    description: 'Ativa o agendamento de GPU via hardware (HAGS) para reduzir latência de renderização.',
    risk: 'medium',
    requiresAdmin: true,
    createsBackup: true,
    requiresReboot: true,
    engine: 'snapshot',
    read: {
      script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers"
$name = "HwSchMode"
try {
  if (-not (Test-Path -LiteralPath $path)) {
    [PSCustomObject]@{ success = $true; exists = $false; value = $null } | ConvertTo-Json -Compress
    exit 0
  }
  $item = Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $item -or $null -eq $item.$name) {
    [PSCustomObject]@{ success = $true; exists = $false; value = $null } | ConvertTo-Json -Compress
    exit 0
  }
  [PSCustomObject]@{ success = $true; exists = $true; value = $item.$name } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $false; exists = $false; value = $null; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
      `
    },
    apply: {
      script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers"
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
New-ItemProperty -LiteralPath $path -Name "HwSchMode" -PropertyType DWord -Value 2 -Force -ErrorAction Stop
      `
    },
    verify: {
      script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers"
try {
  $item = Get-ItemProperty -LiteralPath $path -Name "HwSchMode" -ErrorAction Stop
  [PSCustomObject]@{ success = $true; exists = $true; value = $item.HwSchMode } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $true; exists = $false; value = $null } | ConvertTo-Json -Compress
}
      `,
      expected: { exists: true, value: 2 }
    },
    restore: {
      script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\GraphicsDrivers"
$name = "HwSchMode"
if ($snapshotExists -eq $true) {
  if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
  New-ItemProperty -LiteralPath $path -Name $name -PropertyType DWord -Value $snapshotValue -Force -ErrorAction Stop
} else {
  Remove-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
}
      `
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
    description: 'Interrompe o envio de dados de diagnóstico e uso para a Microsoft (política de registro).',
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
    // NOVO — mecanismo diferente do tweak acima (que mexe em política de
    // registro): este para e desativa os serviços de telemetria em si.
    id: 'disable-telemetry-services',
    category: 'Privacidade',
    title: 'Desativar Serviços de Rastreamento (DiagTrack)',
    description: 'Para e desativa os serviços de Experiências do Usuário Conectado e Telemetria (DiagTrack) e dmwappushservice.',
    risk: 'medium',
    requiresAdmin: true,
    createsBackup: true,
    engine: 'snapshot',
    read: {
      script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
function Convert-StartMode($mode) {
  switch ($mode) {
    'Auto' { 'Automatic' }
    'Manual' { 'Manual' }
    'Disabled' { 'Disabled' }
    default { 'Manual' }
  }
}
try {
  $serviceNames = @('DiagTrack','dmwappushservice')
  $result = [ordered]@{}
  $allExist = $true
  foreach ($name in $serviceNames) {
    $svc = Get-CimInstance Win32_Service -Filter "Name='$name'" -ErrorAction SilentlyContinue
    if ($null -eq $svc) {
      $allExist = $false
      $result[$name] = $null
    } else {
      $result[$name] = [ordered]@{ WasRunning = ($svc.State -eq 'Running'); StartupType = (Convert-StartMode $svc.StartMode) }
    }
  }
  [PSCustomObject]@{ success = $true; exists = $allExist; value = $result } | ConvertTo-Json -Compress -Depth 5
} catch {
  [PSCustomObject]@{ success = $false; exists = $false; value = $null; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
      `
    },
    apply: {
      script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
try {
  $serviceNames = @('DiagTrack','dmwappushservice')
  foreach ($name in $serviceNames) {
    $svc = Get-Service -Name $name -ErrorAction SilentlyContinue
    if ($null -ne $svc) {
      if ($svc.Status -ne 'Stopped') { Stop-Service -Name $name -Force -ErrorAction SilentlyContinue }
      Set-Service -Name $name -StartupType Disabled -ErrorAction Stop
    }
  }
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
      `
    },
    verify: {
      script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
function Convert-StartMode($mode) {
  switch ($mode) {
    'Auto' { 'Automatic' }
    'Manual' { 'Manual' }
    'Disabled' { 'Disabled' }
    default { 'Manual' }
  }
}
try {
  $serviceNames = @('DiagTrack','dmwappushservice')
  $result = [ordered]@{}
  $allExist = $true
  foreach ($name in $serviceNames) {
    $svc = Get-CimInstance Win32_Service -Filter "Name='$name'" -ErrorAction SilentlyContinue
    if ($null -eq $svc) {
      $allExist = $false
      $result[$name] = $null
    } else {
      $result[$name] = [ordered]@{ WasRunning = ($svc.State -eq 'Running'); StartupType = (Convert-StartMode $svc.StartMode) }
    }
  }
  [PSCustomObject]@{ success = $true; exists = $allExist; value = $result } | ConvertTo-Json -Compress -Depth 5
} catch {
  [PSCustomObject]@{ success = $false; exists = $false; value = $null; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
      `,
      expected: {
        exists: true,
        value: {
          DiagTrack: { WasRunning: false, StartupType: 'Disabled' },
          dmwappushservice: { WasRunning: false, StartupType: 'Disabled' }
        }
      }
    },
    restore: {
      script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
try {
  if ($snapshotExists -eq $true) {
    $serviceNames = @('DiagTrack','dmwappushservice')
    foreach ($name in $serviceNames) {
      $original = $snapshotValue.$name
      if ($null -ne $original) {
        Set-Service -Name $name -StartupType $original.StartupType -ErrorAction SilentlyContinue
        if ($original.WasRunning -eq $true) {
          Start-Service -Name $name -ErrorAction SilentlyContinue
        } else {
          Stop-Service -Name $name -Force -ErrorAction SilentlyContinue
        }
      }
    }
  }
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
      `
    },
    commands: {
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
    // MIGRADO PARA O MOTOR AGNÓSTICO nesta rodada.
    // Rastreia apenas 'useplatformclock' via bcdedit. Atenção: em Windows
    // localizados (ex: PT-BR), bcdedit pode retornar "Sim"/"Não" em vez
    // de "Yes"/"No" — se o teste em máquina PT-BR falhar na verificação,
    // ajustar o `expected.value` ou normalizar a string no read/verify.
 id: 'disable-hpet',
  category: 'Performance',
  title: 'Desativar HPET (Timer de Alta Precisão)',
  description: 'Reduz o overhead de sincronização de timer do Windows, diminuindo o input lag em jogos competitivos.',
  risk: 'medium',
  requiresAdmin: true,
  createsBackup: true,
  requiresReboot: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
function Normalize-BcdBool($raw) {
  if ($raw -match '(?i)^(yes|true|sim|verdadeiro)$') { return 'No'; }
  if ($raw -match '(?i)^(no|false|não|nao|falso)$') { return 'No'; }
  return $raw
}
try {
  $output = bcdedit /enum '{current}' 2>$null
  $line = $output | Where-Object { $_ -match 'useplatformclock' }
  if ($null -eq $line) {
    [PSCustomObject]@{ success = $true; exists = $false; value = $null } | ConvertTo-Json -Compress
  } else {
    $rawValue = (($line -split '\\s{2,}')[1]).Trim()
    $normalized = if ($rawValue -match '(?i)^(yes|true|sim|verdadeiro)$') { 'Yes' }
                  elseif ($rawValue -match '(?i)^(no|false|não|nao|falso)$') { 'No' }
                  else { $rawValue }
    [PSCustomObject]@{ success = $true; exists = $true; value = $normalized } | ConvertTo-Json -Compress
  }
} catch {
  [PSCustomObject]@{ success = $false; exists = $false; value = $null; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
    `
  },
  apply: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
try {
  bcdedit /set useplatformclock false | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "bcdedit retornou código $LASTEXITCODE" }
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
    `
  },
  verify: {
    // Idêntico ao read.script, com a mesma normalização — garante que a
    // comparação via deepEqual nunca dependa do idioma do Windows.
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
try {
  $output = bcdedit /enum '{current}' 2>$null
  $line = $output | Where-Object { $_ -match 'useplatformclock' }
  if ($null -eq $line) {
    [PSCustomObject]@{ success = $true; exists = $false; value = $null } | ConvertTo-Json -Compress
  } else {
    $rawValue = (($line -split '\\s{2,}')[1]).Trim()
    $normalized = if ($rawValue -match '(?i)^(yes|true|sim|verdadeiro)$') { 'Yes' }
                  elseif ($rawValue -match '(?i)^(no|false|não|nao|falso)$') { 'No' }
                  else { $rawValue }
    [PSCustomObject]@{ success = $true; exists = $true; value = $normalized } | ConvertTo-Json -Compress
  }
} catch {
  [PSCustomObject]@{ success = $false; exists = $false; value = $null; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
    `,
    expected: { exists: true, value: 'No' }
  },
  restore: {
    // $snapshotValue chega como $null quando a propriedade não existia
    // (seu caso) — o -match nunca é avaliado contra $null de forma
    // problemática porque $snapshotExists já decide o ramo primeiro.
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
try {
  if ($snapshotExists -eq $true) {
    $boolValue = if ($snapshotValue -match '(?i)^(yes|true|sim|verdadeiro)$') { 'true' } else { 'false' }
    bcdedit /set useplatformclock $boolValue | Out-Null
  } else {
    bcdedit /deletevalue useplatformclock | Out-Null
  }
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
    `
  },
  commands: {
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
  return TWEAKS_CATALOG.map(({ id, category, title, description, requiresAdmin, requiresReboot, risk, createsBackup }) => ({
    id, category, title, description, requiresAdmin,
    requiresReboot: !!requiresReboot,
    risk: risk || 'low',
    createsBackup: !!createsBackup,
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
// Motor agnóstico: executa qualquer script read/verify que siga o
// contrato { success, exists, value, error? }.
// --------------------------------------------------------------------

/**
 * Comparação profunda, insensível à ordem de chaves — necessária porque
 * tweaks como o de serviços retornam objetos aninhados (não primitivos),
 * onde String(objeto) sempre vira "[object Object]" e quebraria a
 * comparação de verificação.
 */
function deepEqual(a, b) {
  if (a === b) return true;
  if (a === null || b === null || a === undefined || b === undefined) return a === b;
  if (typeof a !== typeof b) return false;
  if (typeof a !== 'object') return String(a) === String(b);

  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => deepEqual(a[k], b[k]));
}

/**
 * Converte um valor JS em literal PowerShell seguro para injeção no script
 * de restore. Objetos são injetados como JSON + ConvertFrom-Json, permitindo
 * navegação via $snapshotValue.NomeDoServico.Campo dentro do script.
 */
function formatPsLiteral(value) {
  if (value === null || value === undefined) return '$null';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '$true' : '$false';
  if (typeof value === 'object') {
    const json = JSON.stringify(value).replace(/'/g, "''");
    return `('${json}' | ConvertFrom-Json)`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function runScriptAndParse(script, timeoutMs = 15000) {
  const { stdout } = await runShellCommand(script, timeoutMs);
  const trimmed = (stdout || '').trim();
  if (!trimmed) {
    throw new Error('O script não retornou nenhuma saída.');
  }

  let parsed;
  try {
    parsed = JSON.parse(trimmed);
  } catch (err) {
    throw new Error(`Saída inesperada do script: ${trimmed.slice(0, 200)}`);
  }

  if (parsed.success === false) {
    throw new Error(parsed.error || 'O script reportou uma falha.');
  }

  return parsed;
}

/**
 * Fluxo: Read → Snapshot → Apply → Verify.
 * Só marca como ativo se o Verify confirmar o valor esperado.
 */
async function applyWithSnapshot(tweak) {
  try {
    log.info(`[snapshot-engine] READ "${tweak.id}"...`);
    const before = await runScriptAndParse(tweak.read.script);
    log.info(`[snapshot-engine] Estado atual de "${tweak.id}":`, before);

    saveSnapshot(tweak.id, { exists: !!before.exists, value: before.value ?? null });

    log.info(`[snapshot-engine] APPLY "${tweak.id}"...`);
    await runCommandSmart(tweak.apply.script, tweak.requiresAdmin, 20000);

    log.info(`[snapshot-engine] VERIFY "${tweak.id}"...`);
    const after = await runScriptAndParse(tweak.verify.script);

    const expected = tweak.verify.expected || {};
    const existsOk = expected.exists === undefined || !!after.exists === !!expected.exists;
    const valueOk = expected.value === undefined || deepEqual(after.value, expected.value);

    if (!existsOk || !valueOk) {
      log.error(`[snapshot-engine] Verificação falhou para "${tweak.id}". Esperado:`, expected, 'Obtido:', after);
      return {
        success: false, tweakId: tweak.id,
        error: 'A alteração não pôde ser confirmada após aplicada. Nada foi marcado como ativo.'
      };
    }

    setTweakState(tweak.id, true);
    log.info(`[snapshot-engine] "${tweak.id}" aplicado e verificado com sucesso.`);
    return { success: true, tweakId: tweak.id, enabled: true };
  } catch (error) {
    log.error(`[snapshot-engine] Erro ao aplicar "${tweak.id}":`, error.message);
    const userCancelled = error.message.includes('1223') || error.message.includes('cancelado');
    return {
      success: false, tweakId: tweak.id,
      error: userCancelled
        ? 'Você cancelou a permissão de administrador solicitada pelo Windows.'
        : `Falha ao aplicar este ajuste: ${error.message}`
    };
  }
}

/**
 * Fluxo: Restore (do snapshot, injetando $snapshotExists/$snapshotValue) →
 * Verify → Clean. Recusa reverter sem snapshot salvo.
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

  const { exists, value } = snapshot.previousState;

  const injectedVars = `
$snapshotExists = ${exists ? '$true' : '$false'}
$snapshotValue = ${formatPsLiteral(value)}
`.trim();

  const restoreScript = `${injectedVars}\n${tweak.restore.script}`;

  try {
    log.info(`[snapshot-engine] RESTORE "${tweak.id}"...`, snapshot.previousState);
    await runCommandSmart(restoreScript, tweak.requiresAdmin, 20000);

    log.info(`[snapshot-engine] VERIFY (restore) "${tweak.id}"...`);
    const after = await runScriptAndParse(tweak.verify.script);

    const restored = (!!after.exists === !!exists) && deepEqual(after.value, value);

    if (!restored) {
      log.error(`[snapshot-engine] Falha ao verificar restauração de "${tweak.id}".`, after);
      return {
        success: false, tweakId: tweak.id,
        error: 'Não foi possível confirmar a restauração do valor original. O snapshot foi mantido.'
      };
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
      error: userCancelled
        ? 'Você cancelou a permissão de administrador solicitada pelo Windows.'
        : `Falha ao restaurar este ajuste: ${error.message}`
    };
  }
}

function registerTweaksHandlers() {
  ipcMain.handle('tweaks:get-catalog', async () => getPublicCatalog());
  ipcMain.handle('tweaks:get-applied-state', async () => store.get('tweaksApplied', {}));

  ipcMain.handle('tweaks:apply', withLicense(async (_event, tweakId) => {
    const tweak = TWEAKS_CATALOG.find((t) => t.id === tweakId);
    if (!tweak) return { success: false, error: `Tweak "${tweakId}" não encontrado.` };

    if (tweak.engine === 'snapshot' && os.platform() === 'win32') {
      return applyWithSnapshot(tweak);
    }

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
 * Reversão em lote: tweaks com motor de snapshot são revertidos
 * individualmente (cada um com seu próprio Verify); tweaks legados sem
 * admin revertem direto; tweaks legados com admin são agrupados em um
 * único script elevado (um só UAC para o lote inteiro).
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

  for (const tweak of snapshotTweaks) {
    const result = await revertWithSnapshot(tweak);
    if (result.success) reverted.push(tweak.id);
    else failed.push({ id: tweak.id, error: result.error });
  }

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