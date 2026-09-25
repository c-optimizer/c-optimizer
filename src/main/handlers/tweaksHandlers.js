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
  risk: 'medium',
  requiresAdmin: true,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl"
$name = "Win32PrioritySeparation"
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
$path = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl"
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
New-ItemProperty -LiteralPath $path -Name "Win32PrioritySeparation" -PropertyType DWord -Value 38 -Force -ErrorAction Stop
    `
  },
  verify: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl"
try {
  $item = Get-ItemProperty -LiteralPath $path -Name "Win32PrioritySeparation" -ErrorAction Stop
  [PSCustomObject]@{ success = $true; exists = $true; value = $item.Win32PrioritySeparation } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $true; exists = $false; value = $null } | ConvertTo-Json -Compress
}
    `,
    expected: { exists: true, value: 38 }
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SYSTEM\\CurrentControlSet\\Control\\PriorityControl"
$name = "Win32PrioritySeparation"
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
  description: 'Reduz a latência de rede desativando o agrupamento de pacotes TCP pequenos em todas as interfaces de rede.',
  risk: 'medium',
  requiresAdmin: true,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
try {
  $basePath = "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces"
  $interfaces = Get-ChildItem -Path $basePath -ErrorAction SilentlyContinue
  $list = @()
  foreach ($iface in $interfaces) {
    $guid = $iface.PSChildName
    $item = Get-ItemProperty -Path $iface.PSPath -ErrorAction SilentlyContinue
    $ackFreq = if ($null -ne $item -and $item.PSObject.Properties.Name -contains "TcpAckFrequency") { $item.TcpAckFrequency } else { $null }
    $noDelay = if ($null -ne $item -and $item.PSObject.Properties.Name -contains "TCPNoDelay") { $item.TCPNoDelay } else { $null }
    $list += [PSCustomObject]@{ Guid = $guid; TcpAckFrequency = $ackFreq; TCPNoDelay = $noDelay }
  }
  [PSCustomObject]@{ success = $true; exists = ($list.Count -gt 0); value = $list } | ConvertTo-Json -Compress -Depth 6
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
  $basePath = "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces"
  $interfaces = Get-ChildItem -Path $basePath -ErrorAction SilentlyContinue
  foreach ($iface in $interfaces) {
    New-ItemProperty -Path $iface.PSPath -Name "TcpAckFrequency" -PropertyType DWord -Value 1 -Force -ErrorAction SilentlyContinue | Out-Null
    New-ItemProperty -Path $iface.PSPath -Name "TCPNoDelay" -PropertyType DWord -Value 1 -Force -ErrorAction SilentlyContinue | Out-Null
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
try {
  $basePath = "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces"
  $interfaces = Get-ChildItem -Path $basePath -ErrorAction SilentlyContinue
  $list = @()
  foreach ($iface in $interfaces) {
    $guid = $iface.PSChildName
    $item = Get-ItemProperty -Path $iface.PSPath -ErrorAction SilentlyContinue
    $ackFreq = if ($null -ne $item -and $item.PSObject.Properties.Name -contains "TcpAckFrequency") { $item.TcpAckFrequency } else { $null }
    $noDelay = if ($null -ne $item -and $item.PSObject.Properties.Name -contains "TCPNoDelay") { $item.TCPNoDelay } else { $null }
    $list += [PSCustomObject]@{ Guid = $guid; TcpAckFrequency = $ackFreq; TCPNoDelay = $noDelay }
  }
  # Verifica se TODAS as interfaces existentes agora têm os valores aplicados
  $allApplied = $true
  foreach ($entry in $list) {
    if ($entry.TcpAckFrequency -ne 1 -or $entry.TCPNoDelay -ne 1) { $allApplied = $false }
  }
  [PSCustomObject]@{ success = $true; exists = $allApplied; value = $list } | ConvertTo-Json -Compress -Depth 6
} catch {
  [PSCustomObject]@{ success = $false; exists = $false; value = $null; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
    `,
    // 'exists: true' aqui significa "todas as interfaces presentes no momento
    // do verify têm os valores aplicados" — não comparamos 'value' diretamente
    // porque o NÚMERO de interfaces pode diferir entre o apply e o verify
    // (ex: uma VPN conectou no meio do processo). expected.value é omitido
    // de propósito; só 'exists' é checado.
    expected: { exists: true }
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
try {
  $basePath = "HKLM:\\SYSTEM\\CurrentControlSet\\Services\\Tcpip\\Parameters\\Interfaces"

  if ($snapshotExists -eq $true) {
    foreach ($entry in $snapshotValue) {
      $ifacePath = Join-Path $basePath $entry.Guid
      if (-not (Test-Path $ifacePath)) { continue }

      if ($null -eq $entry.TcpAckFrequency) {
        Remove-ItemProperty -Path $ifacePath -Name "TcpAckFrequency" -ErrorAction SilentlyContinue
      } else {
        New-ItemProperty -Path $ifacePath -Name "TcpAckFrequency" -PropertyType DWord -Value $entry.TcpAckFrequency -Force -ErrorAction SilentlyContinue | Out-Null
      }

      if ($null -eq $entry.TCPNoDelay) {
        Remove-ItemProperty -Path $ifacePath -Name "TCPNoDelay" -ErrorAction SilentlyContinue
      } else {
        New-ItemProperty -Path $ifacePath -Name "TCPNoDelay" -PropertyType DWord -Value $entry.TCPNoDelay -Force -ErrorAction SilentlyContinue | Out-Null
      }
    }
  } else {
    # Nenhuma interface tinha essas propriedades antes — remove de todas as
    # interfaces que existem agora (podem ser diferentes das originais).
    $interfaces = Get-ChildItem -Path $basePath -ErrorAction SilentlyContinue
    foreach ($iface in $interfaces) {
      Remove-ItemProperty -Path $iface.PSPath -Name "TcpAckFrequency" -ErrorAction SilentlyContinue
      Remove-ItemProperty -Path $iface.PSPath -Name "TCPNoDelay" -ErrorAction SilentlyContinue
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
  id: 'network-throttling',
  category: 'Rede',
  title: 'Desativar Limitação de Rede e Priorizar Jogos (MMCSS)',
  description: 'Remove o limite de rede em segundo plano e configura o perfil MMCSS de jogos com prioridade máxima de CPU/GPU.',
  risk: 'medium',
  requiresAdmin: true,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Read-RegValue($path, $name) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  $item = Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $item -or $null -eq $item.$name) { return $null }
  return $item.$name
}

try {
  $profilePath = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile"
  $gamesPath = "$profilePath\\Tasks\\Games"

  $result = [ordered]@{
    NetworkThrottlingIndex = Read-RegValue $profilePath "NetworkThrottlingIndex"
    SystemResponsiveness   = Read-RegValue $profilePath "SystemResponsiveness"
    GpuPriority            = Read-RegValue $gamesPath "GPU Priority"
    Priority               = Read-RegValue $gamesPath "Priority"
    SchedulingCategory     = Read-RegValue $gamesPath "Scheduling Category"
  }
  $anyExists = $result.Values | Where-Object { $null -ne $_ } | Measure-Object | Select-Object -ExpandProperty Count
  [PSCustomObject]@{ success = $true; exists = ($anyExists -gt 0); value = $result } | ConvertTo-Json -Compress -Depth 5
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
  $profilePath = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile"
  if (-not (Test-Path $profilePath)) { New-Item -Path $profilePath -Force | Out-Null }
  New-ItemProperty -Path $profilePath -Name "NetworkThrottlingIndex" -PropertyType DWord -Value 0xffffffff -Force -ErrorAction Stop
  New-ItemProperty -Path $profilePath -Name "SystemResponsiveness" -PropertyType DWord -Value 0 -Force -ErrorAction Stop

  $gamesPath = "$profilePath\\Tasks\\Games"
  if (-not (Test-Path $gamesPath)) { New-Item -Path $gamesPath -Force | Out-Null }
  New-ItemProperty -Path $gamesPath -Name "GPU Priority" -PropertyType DWord -Value 8 -Force -ErrorAction Stop
  New-ItemProperty -Path $gamesPath -Name "Priority" -PropertyType DWord -Value 6 -Force -ErrorAction Stop
  New-ItemProperty -Path $gamesPath -Name "Scheduling Category" -PropertyType String -Value "High" -Force -ErrorAction Stop
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

function Read-RegValue($path, $name) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  $item = Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $item -or $null -eq $item.$name) { return $null }
  return $item.$name
}

try {
  $profilePath = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile"
  $gamesPath = "$profilePath\\Tasks\\Games"

  $result = [ordered]@{
    NetworkThrottlingIndex = Read-RegValue $profilePath "NetworkThrottlingIndex"
    SystemResponsiveness   = Read-RegValue $profilePath "SystemResponsiveness"
    GpuPriority            = Read-RegValue $gamesPath "GPU Priority"
    Priority               = Read-RegValue $gamesPath "Priority"
    SchedulingCategory     = Read-RegValue $gamesPath "Scheduling Category"
  }
  $anyExists = $result.Values | Where-Object { $null -ne $_ } | Measure-Object | Select-Object -ExpandProperty Count
  [PSCustomObject]@{ success = $true; exists = ($anyExists -gt 0); value = $result } | ConvertTo-Json -Compress -Depth 5
} catch {
  [PSCustomObject]@{ success = $false; exists = $false; value = $null; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
    `,
    expected: {
      exists: true,
      value: {
        NetworkThrottlingIndex: 4294967295,
        SystemResponsiveness: 0,
        GpuPriority: 8,
        Priority: 6,
        SchedulingCategory: 'High'
      }
    }
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Restore-RegValue($path, $name, $val, $propType) {
  if ($null -eq $val) {
    if (Test-Path -LiteralPath $path) {
      Remove-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
    }
  } else {
    if (-not (Test-Path -LiteralPath $path)) { New-Item -Path $path -Force | Out-Null }
    New-ItemProperty -LiteralPath $path -Name $name -PropertyType $propType -Value $val -Force -ErrorAction Stop
  }
}

try {
  $profilePath = "HKLM:\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Multimedia\\SystemProfile"
  $gamesPath = "$profilePath\\Tasks\\Games"

  if ($snapshotExists -eq $true) {
    Restore-RegValue $profilePath "NetworkThrottlingIndex" $snapshotValue.NetworkThrottlingIndex "DWord"
    Restore-RegValue $profilePath "SystemResponsiveness" $snapshotValue.SystemResponsiveness "DWord"
    Restore-RegValue $gamesPath "GPU Priority" $snapshotValue.GpuPriority "DWord"
    Restore-RegValue $gamesPath "Priority" $snapshotValue.Priority "DWord"
    Restore-RegValue $gamesPath "Scheduling Category" $snapshotValue.SchedulingCategory "String"
  } else {
    Remove-ItemProperty -Path $profilePath -Name "NetworkThrottlingIndex" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path $profilePath -Name "SystemResponsiveness" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path $gamesPath -Name "GPU Priority" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path $gamesPath -Name "Priority" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path $gamesPath -Name "Scheduling Category" -ErrorAction SilentlyContinue
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
  id: 'disable-telemetry',
  category: 'Privacidade',
  title: 'Desativar Telemetria do Windows',
  description: 'Interrompe o envio de dados de diagnóstico e uso para a Microsoft (política de registro).',
  risk: 'low',
  requiresAdmin: true,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection"
$name = "AllowTelemetry"
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
$path = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection"
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
New-ItemProperty -LiteralPath $path -Name "AllowTelemetry" -PropertyType DWord -Value 0 -Force -ErrorAction Stop
    `
  },
  verify: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection"
try {
  $item = Get-ItemProperty -LiteralPath $path -Name "AllowTelemetry" -ErrorAction Stop
  [PSCustomObject]@{ success = $true; exists = $true; value = $item.AllowTelemetry } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $true; exists = $false; value = $null } | ConvertTo-Json -Compress
}
    `,
    expected: { exists: true, value: 0 }
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\DataCollection"
$name = "AllowTelemetry"
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
  description: 'Ativa o plano de energia de máxima performance do Windows (Ultimate Performance ou Alto Desempenho).',
  risk: 'low',
  requiresAdmin: true,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
try {
  $output = powercfg /getactivescheme
  if ($output -match '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') {
    $guid = $matches[1]
    [PSCustomObject]@{ success = $true; exists = $true; value = $guid } | ConvertTo-Json -Compress
  } else {
    [PSCustomObject]@{ success = $true; exists = $false; value = $null } | ConvertTo-Json -Compress
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
  # GUID público padrão do "Ultimate Performance" da Microsoft.
  $ultimateGuid = "e9a42b02-d5df-448d-aa00-03f14749eb61"

  # Verifica se já existe uma cópia duplicada do Ultimate Performance
  # (evita duplicar o esquema a cada apply repetido).
  $existingSchemes = powercfg /list
  $alreadyDuplicated = $existingSchemes | Select-String -Pattern $ultimateGuid -Quiet

  if (-not $alreadyDuplicated) {
    $dupOutput = powercfg /duplicatescheme $ultimateGuid
    if ($dupOutput -match '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') {
      $newGuid = $matches[1]
    } else {
      throw "Não foi possível duplicar o esquema Ultimate Performance."
    }
  } else {
    $newGuid = $ultimateGuid
  }

  powercfg /setactive $newGuid
  if ($LASTEXITCODE -ne 0) { throw "powercfg /setactive retornou código $LASTEXITCODE" }
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
try {
  $output = powercfg /getactivescheme
  if ($output -match '([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})') {
    $guid = $matches[1]
    [PSCustomObject]@{ success = $true; exists = $true; value = $guid } | ConvertTo-Json -Compress
  } else {
    [PSCustomObject]@{ success = $true; exists = $false; value = $null } | ConvertTo-Json -Compress
  }
} catch {
  [PSCustomObject]@{ success = $false; exists = $false; value = $null; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
    `
    // Sem 'expected' fixo: o GUID do plano ativo após duplicar pode ser
    // qualquer novo GUID gerado pelo Windows, não um valor conhecido de
    // antemão. O motor aceita 'expected' ausente e só valida 'success'.
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
try {
  if ($snapshotExists -eq $true -and $null -ne $snapshotValue) {
    powercfg /setactive $snapshotValue
    if ($LASTEXITCODE -ne 0) { throw "powercfg /setactive (restore) retornou código $LASTEXITCODE" }
  } else {
    # Fallback de segurança: nunca deixa o PC sem NENHUM plano ativo.
    # Usa o GUID padrão universal do Windows para "Equilibrado".
    powercfg /setactive 381b4222-f694-41f0-9685-ff5bb260df2e
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
  id: 'visual-performance',
  category: 'Performance',
  title: 'Priorizar Desempenho Visual',
  description: 'Desativa animações de janelas, sombras e transparências, mantendo as fontes suaves (ClearType) intactas.',
  risk: 'low',
  requiresAdmin: false,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Read-RegValue($path, $name) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  $item = Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $item -or $null -eq $item.$name) { return $null }
  return $item.$name
}

try {
  $result = [ordered]@{
    MinAnimate         = Read-RegValue "HKCU:\\Control Panel\\Desktop\\WindowMetrics" "MinAnimate"
    TaskbarAnimations  = Read-RegValue "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" "TaskbarAnimations"
    ListviewAlphaSelect= Read-RegValue "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" "ListviewAlphaSelect"
    ListviewShadow     = Read-RegValue "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" "ListviewShadow"
    DragFullWindows    = Read-RegValue "HKCU:\\Control Panel\\Desktop" "DragFullWindows"
    EnableAeroPeek     = Read-RegValue "HKCU:\\Software\\Microsoft\\Windows\\DWM" "EnableAeroPeek"
  }
  $anyExists = $result.Values | Where-Object { $null -ne $_ } | Measure-Object | Select-Object -ExpandProperty Count
  [PSCustomObject]@{ success = $true; exists = ($anyExists -gt 0); value = $result } | ConvertTo-Json -Compress -Depth 5
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
  if (-not (Test-Path "HKCU:\\Control Panel\\Desktop\\WindowMetrics")) { New-Item -Path "HKCU:\\Control Panel\\Desktop\\WindowMetrics" -Force | Out-Null }
  Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop\\WindowMetrics" -Name "MinAnimate" -Value "0"

  if (-not (Test-Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced")) { New-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Force | Out-Null }
  New-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "TaskbarAnimations" -PropertyType DWord -Value 0 -Force -ErrorAction Stop
  New-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "ListviewAlphaSelect" -PropertyType DWord -Value 0 -Force -ErrorAction Stop
  New-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "ListviewShadow" -PropertyType DWord -Value 0 -Force -ErrorAction Stop

  if (-not (Test-Path "HKCU:\\Control Panel\\Desktop")) { New-Item -Path "HKCU:\\Control Panel\\Desktop" -Force | Out-Null }
  Set-ItemProperty -Path "HKCU:\\Control Panel\\Desktop" -Name "DragFullWindows" -Value "0"

  if (-not (Test-Path "HKCU:\\Software\\Microsoft\\Windows\\DWM")) { New-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\DWM" -Force | Out-Null }
  New-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\DWM" -Name "EnableAeroPeek" -PropertyType DWord -Value 0 -Force -ErrorAction Stop
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

function Read-RegValue($path, $name) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  $item = Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $item -or $null -eq $item.$name) { return $null }
  return $item.$name
}

try {
  $result = [ordered]@{
    MinAnimate         = Read-RegValue "HKCU:\\Control Panel\\Desktop\\WindowMetrics" "MinAnimate"
    TaskbarAnimations  = Read-RegValue "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" "TaskbarAnimations"
    ListviewAlphaSelect= Read-RegValue "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" "ListviewAlphaSelect"
    ListviewShadow     = Read-RegValue "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" "ListviewShadow"
    DragFullWindows    = Read-RegValue "HKCU:\\Control Panel\\Desktop" "DragFullWindows"
    EnableAeroPeek     = Read-RegValue "HKCU:\\Software\\Microsoft\\Windows\\DWM" "EnableAeroPeek"
  }
  $anyExists = $result.Values | Where-Object { $null -ne $_ } | Measure-Object | Select-Object -ExpandProperty Count
  [PSCustomObject]@{ success = $true; exists = ($anyExists -gt 0); value = $result } | ConvertTo-Json -Compress -Depth 5
} catch {
  [PSCustomObject]@{ success = $false; exists = $false; value = $null; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
    `,
    expected: {
      exists: true,
      value: {
        MinAnimate: '0',
        TaskbarAnimations: 0,
        ListviewAlphaSelect: 0,
        ListviewShadow: 0,
        DragFullWindows: '0',
        EnableAeroPeek: 0
      }
    }
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Restore-RegValue($path, $name, $val, $propType) {
  if ($null -eq $val) {
    if (Test-Path -LiteralPath $path) {
      Remove-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
    }
  } else {
    if (-not (Test-Path -LiteralPath $path)) { New-Item -Path $path -Force | Out-Null }
    New-ItemProperty -LiteralPath $path -Name $name -PropertyType $propType -Value $val -Force -ErrorAction Stop
  }
}

try {
  if ($snapshotExists -eq $true) {
    Restore-RegValue "HKCU:\\Control Panel\\Desktop\\WindowMetrics" "MinAnimate" $snapshotValue.MinAnimate "String"
    Restore-RegValue "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" "TaskbarAnimations" $snapshotValue.TaskbarAnimations "DWord"
    Restore-RegValue "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" "ListviewAlphaSelect" $snapshotValue.ListviewAlphaSelect "DWord"
    Restore-RegValue "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" "ListviewShadow" $snapshotValue.ListviewShadow "DWord"
    Restore-RegValue "HKCU:\\Control Panel\\Desktop" "DragFullWindows" $snapshotValue.DragFullWindows "String"
    Restore-RegValue "HKCU:\\Software\\Microsoft\\Windows\\DWM" "EnableAeroPeek" $snapshotValue.EnableAeroPeek "DWord"
  } else {
    Remove-ItemProperty -Path "HKCU:\\Control Panel\\Desktop\\WindowMetrics" -Name "MinAnimate" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "TaskbarAnimations" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "ListviewAlphaSelect" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced" -Name "ListviewShadow" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\\Control Panel\\Desktop" -Name "DragFullWindows" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\DWM" -Name "EnableAeroPeek" -ErrorAction SilentlyContinue
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
  risk: 'low',
  requiresAdmin: false,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Read-RegValue($path, $name) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  $item = Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $item -or $null -eq $item.$name) { return $null }
  return $item.$name
}

try {
  $result = [ordered]@{
    MouseSpeed      = Read-RegValue "HKCU:\\Control Panel\\Mouse" "MouseSpeed"
    MouseThreshold1 = Read-RegValue "HKCU:\\Control Panel\\Mouse" "MouseThreshold1"
    MouseThreshold2 = Read-RegValue "HKCU:\\Control Panel\\Mouse" "MouseThreshold2"
  }
  $anyExists = $result.Values | Where-Object { $null -ne $_ } | Measure-Object | Select-Object -ExpandProperty Count
  [PSCustomObject]@{ success = $true; exists = ($anyExists -gt 0); value = $result } | ConvertTo-Json -Compress -Depth 5
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
  if (-not (Test-Path "HKCU:\\Control Panel\\Mouse")) { New-Item -Path "HKCU:\\Control Panel\\Mouse" -Force | Out-Null }
  Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseSpeed" -Value "0"
  Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseThreshold1" -Value "0"
  Set-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseThreshold2" -Value "0"

  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseNativeApply {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, int[] pvParam, uint fWinIni);
}
"@
  $mouseParams = @(0, 0, 0)
  [MouseNativeApply]::SystemParametersInfo(0x0004, 0, $mouseParams, 0x03) | Out-Null
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

function Read-RegValue($path, $name) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  $item = Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $item -or $null -eq $item.$name) { return $null }
  return $item.$name
}

try {
  $result = [ordered]@{
    MouseSpeed      = Read-RegValue "HKCU:\\Control Panel\\Mouse" "MouseSpeed"
    MouseThreshold1 = Read-RegValue "HKCU:\\Control Panel\\Mouse" "MouseThreshold1"
    MouseThreshold2 = Read-RegValue "HKCU:\\Control Panel\\Mouse" "MouseThreshold2"
  }
  $anyExists = $result.Values | Where-Object { $null -ne $_ } | Measure-Object | Select-Object -ExpandProperty Count
  [PSCustomObject]@{ success = $true; exists = ($anyExists -gt 0); value = $result } | ConvertTo-Json -Compress -Depth 5
} catch {
  [PSCustomObject]@{ success = $false; exists = $false; value = $null; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
    `,
    expected: {
      exists: true,
      value: { MouseSpeed: '0', MouseThreshold1: '0', MouseThreshold2: '0' }
    }
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Restore-RegValue($path, $name, $val) {
  if ($null -eq $val) {
    if (Test-Path -LiteralPath $path) {
      Remove-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
    }
  } else {
    if (-not (Test-Path -LiteralPath $path)) { New-Item -Path $path -Force | Out-Null }
    Set-ItemProperty -Path $path -Name $name -Value $val
  }
}

try {
  $speed = 1
  $t1 = 6
  $t2 = 10

  if ($snapshotExists -eq $true) {
    Restore-RegValue "HKCU:\\Control Panel\\Mouse" "MouseSpeed" $snapshotValue.MouseSpeed
    Restore-RegValue "HKCU:\\Control Panel\\Mouse" "MouseThreshold1" $snapshotValue.MouseThreshold1
    Restore-RegValue "HKCU:\\Control Panel\\Mouse" "MouseThreshold2" $snapshotValue.MouseThreshold2

    if ($null -ne $snapshotValue.MouseSpeed) { $speed = [int]$snapshotValue.MouseSpeed }
    if ($null -ne $snapshotValue.MouseThreshold1) { $t1 = [int]$snapshotValue.MouseThreshold1 }
    if ($null -ne $snapshotValue.MouseThreshold2) { $t2 = [int]$snapshotValue.MouseThreshold2 }
  } else {
    Remove-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseSpeed" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseThreshold1" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\\Control Panel\\Mouse" -Name "MouseThreshold2" -ErrorAction SilentlyContinue
  }

  Add-Type @"
using System;
using System.Runtime.InteropServices;
public class MouseNativeRestore {
  [DllImport("user32.dll", SetLastError = true)]
  public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, int[] pvParam, uint fWinIni);
}
"@
  $mouseParams = @($t1, $t2, $speed)
  [MouseNativeRestore]::SystemParametersInfo(0x0004, 0, $mouseParams, 0x03) | Out-Null
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
  id: 'disable-fullscreen-opt',
  category: 'Gaming',
  title: 'Desativar Otimizações de Tela Cheia',
  description: 'Desativa Fullscreen Optimizations e a gravação do Game Bar em segundo plano, reduzindo input lag e stutter.',
  risk: 'low',
  requiresAdmin: false,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Read-RegValue($path, $name) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  $item = Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $item -or $null -eq $item.$name) { return $null }
  return $item.$name
}

try {
  $result = [ordered]@{
    GameDVR_FSEBehaviorMode              = Read-RegValue "HKCU:\\System\\GameConfigStore" "GameDVR_FSEBehaviorMode"
    GameDVR_FSEBehaviorModeUserChoice    = Read-RegValue "HKCU:\\System\\GameConfigStore" "GameDVR_FSEBehaviorModeUserChoice"
    GameDVR_DXGIHonorFSEWindowsCompatible= Read-RegValue "HKCU:\\System\\GameConfigStore" "GameDVR_DXGIHonorFSEWindowsCompatible"
    GameDVR_Enabled                      = Read-RegValue "HKCU:\\System\\GameConfigStore" "GameDVR_Enabled"
    AppCaptureEnabled                    = Read-RegValue "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" "AppCaptureEnabled"
  }
  $anyExists = $result.Values | Where-Object { $null -ne $_ } | Measure-Object | Select-Object -ExpandProperty Count
  [PSCustomObject]@{ success = $true; exists = ($anyExists -gt 0); value = $result } | ConvertTo-Json -Compress -Depth 5
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
  if (-not (Test-Path "HKCU:\\System\\GameConfigStore")) { New-Item -Path "HKCU:\\System\\GameConfigStore" -Force | Out-Null }
  New-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_FSEBehaviorMode" -PropertyType DWord -Value 2 -Force -ErrorAction Stop
  New-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_FSEBehaviorModeUserChoice" -PropertyType DWord -Value 2 -Force -ErrorAction Stop
  New-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_DXGIHonorFSEWindowsCompatible" -PropertyType DWord -Value 1 -Force -ErrorAction Stop
  New-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -PropertyType DWord -Value 0 -Force -ErrorAction Stop

  if (-not (Test-Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR")) { New-Item -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Force | Out-Null }
  New-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Name "AppCaptureEnabled" -PropertyType DWord -Value 0 -Force -ErrorAction Stop
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

function Read-RegValue($path, $name) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  $item = Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $item -or $null -eq $item.$name) { return $null }
  return $item.$name
}

try {
  $result = [ordered]@{
    GameDVR_FSEBehaviorMode              = Read-RegValue "HKCU:\\System\\GameConfigStore" "GameDVR_FSEBehaviorMode"
    GameDVR_FSEBehaviorModeUserChoice    = Read-RegValue "HKCU:\\System\\GameConfigStore" "GameDVR_FSEBehaviorModeUserChoice"
    GameDVR_DXGIHonorFSEWindowsCompatible= Read-RegValue "HKCU:\\System\\GameConfigStore" "GameDVR_DXGIHonorFSEWindowsCompatible"
    GameDVR_Enabled                      = Read-RegValue "HKCU:\\System\\GameConfigStore" "GameDVR_Enabled"
    AppCaptureEnabled                    = Read-RegValue "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" "AppCaptureEnabled"
  }
  $anyExists = $result.Values | Where-Object { $null -ne $_ } | Measure-Object | Select-Object -ExpandProperty Count
  [PSCustomObject]@{ success = $true; exists = ($anyExists -gt 0); value = $result } | ConvertTo-Json -Compress -Depth 5
} catch {
  [PSCustomObject]@{ success = $false; exists = $false; value = $null; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
    `,
    expected: {
      exists: true,
      value: {
        GameDVR_FSEBehaviorMode: 2,
        GameDVR_FSEBehaviorModeUserChoice: 2,
        GameDVR_DXGIHonorFSEWindowsCompatible: 1,
        GameDVR_Enabled: 0,
        AppCaptureEnabled: 0
      }
    }
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Restore-RegValue($path, $name, $val) {
  if ($null -eq $val) {
    if (Test-Path -LiteralPath $path) {
      Remove-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
    }
  } else {
    if (-not (Test-Path -LiteralPath $path)) { New-Item -Path $path -Force | Out-Null }
    New-ItemProperty -LiteralPath $path -Name $name -PropertyType DWord -Value $val -Force -ErrorAction Stop
  }
}

try {
  if ($snapshotExists -eq $true) {
    Restore-RegValue "HKCU:\\System\\GameConfigStore" "GameDVR_FSEBehaviorMode" $snapshotValue.GameDVR_FSEBehaviorMode
    Restore-RegValue "HKCU:\\System\\GameConfigStore" "GameDVR_FSEBehaviorModeUserChoice" $snapshotValue.GameDVR_FSEBehaviorModeUserChoice
    Restore-RegValue "HKCU:\\System\\GameConfigStore" "GameDVR_DXGIHonorFSEWindowsCompatible" $snapshotValue.GameDVR_DXGIHonorFSEWindowsCompatible
    Restore-RegValue "HKCU:\\System\\GameConfigStore" "GameDVR_Enabled" $snapshotValue.GameDVR_Enabled
    Restore-RegValue "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" "AppCaptureEnabled" $snapshotValue.AppCaptureEnabled
  } else {
    Remove-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_FSEBehaviorMode" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_FSEBehaviorModeUserChoice" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_DXGIHonorFSEWindowsCompatible" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\\System\\GameConfigStore" -Name "GameDVR_Enabled" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\GameDVR" -Name "AppCaptureEnabled" -ErrorAction SilentlyContinue
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
  id: 'background-apps',
  category: 'Performance',
  title: 'Suspender Apps em Segundo Plano',
  description: 'Impede que aplicativos UWP consumam CPU quando minimizados.',
  risk: 'low',
  requiresAdmin: false,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications"
$name = "GlobalUserDisabled"
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
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications"
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
New-ItemProperty -LiteralPath $path -Name "GlobalUserDisabled" -PropertyType DWord -Value 1 -Force -ErrorAction Stop
    `
  },
  verify: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications"
try {
  $item = Get-ItemProperty -LiteralPath $path -Name "GlobalUserDisabled" -ErrorAction Stop
  [PSCustomObject]@{ success = $true; exists = $true; value = $item.GlobalUserDisabled } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $true; exists = $false; value = $null } | ConvertTo-Json -Compress
}
    `,
    expected: { exists: true, value: 1 }
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\BackgroundAccessApplications"
$name = "GlobalUserDisabled"
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
    id: 'disable-accessibility-keys',
    category: 'Gaming',
    title: 'Desativar Teclas de Acessibilidade',
    description: 'Desativa Sticky Keys, Filter Keys e Toggle Keys — atalhos que podem atrapalhar em jogos.',
    risk: 'low',
    requiresAdmin: false,
    createsBackup: true,
    engine: 'snapshot',
    read: {
      script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Read-RegValue($path, $name) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  $item = Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $item -or $null -eq $item.$name) { return $null }
  return $item.$name
}

try {
function To-IntOrNull($v) {
  if ($null -eq $v) { return $null }
  return [int]$v
}  
$result = [ordered]@{
  StickyKeys = To-IntOrNull (Read-RegValue "HKCU:\\Control Panel\\Accessibility\\StickyKeys" "Flags")
  FilterKeys = To-IntOrNull (Read-RegValue "HKCU:\\Control Panel\\Accessibility\\FilterKeys" "Flags")
  ToggleKeys = To-IntOrNull (Read-RegValue "HKCU:\\Control Panel\\Accessibility\\ToggleKeys" "Flags")
}
  $anyExists = $result.Values | Where-Object { $null -ne $_ } | Measure-Object | Select-Object -ExpandProperty Count
  [PSCustomObject]@{ success = $true; exists = ($anyExists -gt 0); value = $result } | ConvertTo-Json -Compress -Depth 5
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
  $paths = @{
    StickyKeys = "HKCU:\\Control Panel\\Accessibility\\StickyKeys"
    FilterKeys = "HKCU:\\Control Panel\\Accessibility\\FilterKeys"
    ToggleKeys = "HKCU:\\Control Panel\\Accessibility\\ToggleKeys"
  }
  $values = @{ StickyKeys = 506; FilterKeys = 122; ToggleKeys = 58 }
  foreach ($key in $paths.Keys) {
    $p = $paths[$key]
    if (-not (Test-Path $p)) { New-Item -Path $p -Force | Out-Null }
    New-ItemProperty -LiteralPath $p -Name "Flags" -PropertyType DWord -Value $values[$key] -Force -ErrorAction Stop | Out-Null
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

function Read-RegValue($path, $name) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  $item = Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $item -or $null -eq $item.$name) { return $null }
  return $item.$name
}

try {
  function To-IntOrNull($v) {
  if ($null -eq $v) { return $null }
  return [int]$v
}
$result = [ordered]@{
  StickyKeys = To-IntOrNull (Read-RegValue "HKCU:\\Control Panel\\Accessibility\\StickyKeys" "Flags")
  FilterKeys = To-IntOrNull (Read-RegValue "HKCU:\\Control Panel\\Accessibility\\FilterKeys" "Flags")
  ToggleKeys = To-IntOrNull (Read-RegValue "HKCU:\\Control Panel\\Accessibility\\ToggleKeys" "Flags")
}
  $anyExists = $result.Values | Where-Object { $null -ne $_ } | Measure-Object | Select-Object -ExpandProperty Count
  [PSCustomObject]@{ success = $true; exists = ($anyExists -gt 0); value = $result } | ConvertTo-Json -Compress -Depth 5
} catch {
  [PSCustomObject]@{ success = $false; exists = $false; value = $null; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
      `,
      expected: {
        exists: true,
        value: { StickyKeys: 506, FilterKeys: 122, ToggleKeys: 58 }
      }
    },
    restore: {
      script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

function Restore-RegValue($path, $name, $val, $propType) {
  if ($null -eq $val) {
    if (Test-Path -LiteralPath $path) {
      Remove-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
    }
  } else {
    if (-not (Test-Path -LiteralPath $path)) { New-Item -Path $path -Force | Out-Null }
    New-ItemProperty -LiteralPath $path -Name $name -PropertyType $propType -Value $val -Force -ErrorAction Stop | Out-Null
  }
}

try {
  if ($snapshotExists -eq $true) {
    Restore-RegValue "HKCU:\\Control Panel\\Accessibility\\StickyKeys" "Flags" $snapshotValue.StickyKeys "DWord"
    Restore-RegValue "HKCU:\\Control Panel\\Accessibility\\FilterKeys" "Flags" $snapshotValue.FilterKeys "DWord"
    Restore-RegValue "HKCU:\\Control Panel\\Accessibility\\ToggleKeys" "Flags" $snapshotValue.ToggleKeys "DWord"
  } else {
    Remove-ItemProperty -Path "HKCU:\\Control Panel\\Accessibility\\StickyKeys" -Name "Flags" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\\Control Panel\\Accessibility\\FilterKeys" -Name "Flags" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "HKCU:\\Control Panel\\Accessibility\\ToggleKeys" -Name "Flags" -ErrorAction SilentlyContinue
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
  id: 'hide-action-center',
  category: 'Performance',
  title: 'Ocultar Central de Ações',
  description: 'Remove o ícone da Central de Ações/Notificações da barra de tarefas.',
  risk: 'low',
  requiresAdmin: false,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer"
$name = "DisableNotificationCenter"
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
$path = "HKCU:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer"
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
New-ItemProperty -LiteralPath $path -Name "DisableNotificationCenter" -PropertyType DWord -Value 1 -Force -ErrorAction Stop
    `
  },
  verify: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer"
try {
  $item = Get-ItemProperty -LiteralPath $path -Name "DisableNotificationCenter" -ErrorAction Stop
  [PSCustomObject]@{ success = $true; exists = $true; value = $item.DisableNotificationCenter } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $true; exists = $false; value = $null } | ConvertTo-Json -Compress
}
    `,
    expected: { exists: true, value: 1 }
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Policies\\Microsoft\\Windows\\Explorer"
$name = "DisableNotificationCenter"
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
  id: 'hide-people-icon',
  category: 'Performance',
  title: 'Ocultar Ícone de Contatos (People)',
  description: 'Remove o ícone de contatos/People da barra de tarefas.',
  risk: 'low',
  requiresAdmin: false,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced\\People"
$name = "PeopleBand"
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
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced\\People"
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
New-ItemProperty -LiteralPath $path -Name "PeopleBand" -PropertyType DWord -Value 0 -Force -ErrorAction Stop
    `
  },
  verify: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced\\People"
try {
  $item = Get-ItemProperty -LiteralPath $path -Name "PeopleBand" -ErrorAction Stop
  [PSCustomObject]@{ success = $true; exists = $true; value = $item.PeopleBand } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $true; exists = $false; value = $null } | ConvertTo-Json -Compress
}
    `,
    expected: { exists: true, value: 0 }
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced\\People"
$name = "PeopleBand"
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
  id: 'remove-shortcut-suffix',
  category: 'Performance',
  title: 'Remover Sufixo "- Atalho" de Novos Atalhos',
  description: 'Novos atalhos criados no Windows não terão mais o sufixo "- Atalho" no nome.',
  risk: 'low',
  requiresAdmin: false,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer"
$name = "link"
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
  # 'link' é um valor binário — convertemos para array de bytes para poder
  # serializar em JSON e comparar de forma confiável.
  $bytes = [byte[]]$item.$name
  [PSCustomObject]@{ success = $true; exists = $true; value = ($bytes -join ',') } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $false; exists = $false; value = $null; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
    `
  },
  apply: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer"
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
# Valor binário 00 00 00 00 remove o sufixo padrão " - Atalho"/" - Shortcut"
$bytes = [byte[]](0,0,0,0)
New-ItemProperty -LiteralPath $path -Name "link" -PropertyType Binary -Value $bytes -Force -ErrorAction Stop
    `
  },
  verify: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer"
try {
  $item = Get-ItemProperty -LiteralPath $path -Name "link" -ErrorAction Stop
  $bytes = [byte[]]$item.link
  [PSCustomObject]@{ success = $true; exists = $true; value = ($bytes -join ',') } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $true; exists = $false; value = $null } | ConvertTo-Json -Compress
}
    `,
    expected: { exists: true, value: '0,0,0,0' }
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer"
$name = "link"
if ($snapshotExists -eq $true) {
  if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
  $bytes = [byte[]]($snapshotValue -split ',' | ForEach-Object { [byte]$_ })
  New-ItemProperty -LiteralPath $path -Name $name -PropertyType Binary -Value $bytes -Force -ErrorAction Stop
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
  id: 'taskbar-transparency',
  category: 'Performance',
  title: 'Aumentar Transparência da Barra de Tarefas',
  description: 'Deixa a barra de tarefas mais transparente, sem afetar a transparência geral do sistema.',
  risk: 'low',
  requiresAdmin: false,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced"
$name = "UseOLEDTaskbarTransparency"
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
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced"
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
New-ItemProperty -LiteralPath $path -Name "UseOLEDTaskbarTransparency" -PropertyType DWord -Value 1 -Force -ErrorAction Stop
    `
  },
  verify: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced"
try {
  $item = Get-ItemProperty -LiteralPath $path -Name "UseOLEDTaskbarTransparency" -ErrorAction Stop
  [PSCustomObject]@{ success = $true; exists = $true; value = $item.UseOLEDTaskbarTransparency } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $true; exists = $false; value = $null } | ConvertTo-Json -Compress
}
    `,
    expected: { exists: true, value: 1 }
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced"
$name = "UseOLEDTaskbarTransparency"
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
  id: 'explorer-compact-mode',
  category: 'Performance',
  title: 'Modo Compacto do Explorador de Arquivos',
  description: 'Reduz o espaçamento entre itens no Explorador de Arquivos, mostrando mais itens na tela.',
  risk: 'low',
  requiresAdmin: false,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced"
$name = "UseCompactMode"
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
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced"
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
New-ItemProperty -LiteralPath $path -Name "UseCompactMode" -PropertyType DWord -Value 1 -Force -ErrorAction Stop
    `
  },
  verify: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced"
try {
  $item = Get-ItemProperty -LiteralPath $path -Name "UseCompactMode" -ErrorAction Stop
  [PSCustomObject]@{ success = $true; exists = $true; value = $item.UseCompactMode } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success = $true; exists = $false; value = $null } | ConvertTo-Json -Compress
}
    `,
    expected: { exists: true, value: 1 }
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Explorer\\Advanced"
$name = "UseCompactMode"
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
  id: 'disable-insider',
  category: 'Privacidade',
  title: 'Bloquear Windows Insider',
  description: 'Impede o download de atualizações não estáveis (pré-lançamento) do Windows Insider Program.',
  risk: 'low',
  requiresAdmin: true,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
function Read-RegValue($path, $name) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  $item = Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $item -or $null -eq $item.$name) { return $null }
  return $item.$name
}
try {
  $path = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\PreviewBuilds"
  $result = [ordered]@{
    AllowBuildPreview      = Read-RegValue $path "AllowBuildPreview"
    EnableConfigFlighting  = Read-RegValue $path "EnableConfigFlighting"
    EnableExperimentation  = Read-RegValue $path "EnableExperimentation"
  }
  $anyExists = $result.Values | Where-Object { $null -ne $_ } | Measure-Object | Select-Object -ExpandProperty Count
  [PSCustomObject]@{ success = $true; exists = ($anyExists -gt 0); value = $result } | ConvertTo-Json -Compress -Depth 5
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
  $path = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\PreviewBuilds"
  if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
  New-ItemProperty -LiteralPath $path -Name "AllowBuildPreview" -PropertyType DWord -Value 0 -Force -ErrorAction Stop | Out-Null
  New-ItemProperty -LiteralPath $path -Name "EnableConfigFlighting" -PropertyType DWord -Value 0 -Force -ErrorAction Stop | Out-Null
  New-ItemProperty -LiteralPath $path -Name "EnableExperimentation" -PropertyType DWord -Value 0 -Force -ErrorAction Stop | Out-Null
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
function Read-RegValue($path, $name) {
  if (-not (Test-Path -LiteralPath $path)) { return $null }
  $item = Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $item -or $null -eq $item.$name) { return $null }
  return $item.$name
}
try {
  $path = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\PreviewBuilds"
  $result = [ordered]@{
    AllowBuildPreview      = Read-RegValue $path "AllowBuildPreview"
    EnableConfigFlighting  = Read-RegValue $path "EnableConfigFlighting"
    EnableExperimentation  = Read-RegValue $path "EnableExperimentation"
  }
  $anyExists = $result.Values | Where-Object { $null -ne $_ } | Measure-Object | Select-Object -ExpandProperty Count
  [PSCustomObject]@{ success = $true; exists = ($anyExists -gt 0); value = $result } | ConvertTo-Json -Compress -Depth 5
} catch {
  [PSCustomObject]@{ success = $false; exists = $false; value = $null; error = $_.Exception.Message } | ConvertTo-Json -Compress
}
    `,
    expected: {
      exists: true,
      value: { AllowBuildPreview: 0, EnableConfigFlighting: 0, EnableExperimentation: 0 }
    }
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
function Restore-RegValue($path, $name, $val) {
  if ($null -eq $val) {
    if (Test-Path -LiteralPath $path) { Remove-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue }
  } else {
    if (-not (Test-Path -LiteralPath $path)) { New-Item -Path $path -Force | Out-Null }
    New-ItemProperty -LiteralPath $path -Name $name -PropertyType DWord -Value $val -Force -ErrorAction Stop | Out-Null
  }
}
try {
  $path = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\Windows\\WindowsUpdate\\PreviewBuilds"
  if ($snapshotExists -eq $true) {
    Restore-RegValue $path "AllowBuildPreview" $snapshotValue.AllowBuildPreview
    Restore-RegValue $path "EnableConfigFlighting" $snapshotValue.EnableConfigFlighting
    Restore-RegValue $path "EnableExperimentation" $snapshotValue.EnableExperimentation
  } else {
    Remove-ItemProperty -Path $path -Name "AllowBuildPreview" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path $path -Name "EnableConfigFlighting" -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path $path -Name "EnableExperimentation" -ErrorAction SilentlyContinue
  }
} catch {
  Write-Error $_.Exception.Message
  exit 1
}
    `
  },
  commands: { linux: { apply: `echo "simulado"`, revert: `echo "simulado"` } }
},
{
  id: 'disable-chrome-autoupdate',
  category: 'Privacidade',
  title: 'Desativar Atualização Automática do Chrome',
  description: 'Impede que o Google Chrome se atualize automaticamente em segundo plano.',
  risk: 'low',
  requiresAdmin: true,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SOFTWARE\\Policies\\Google\\Update"
$name = "UpdateDefault"
try {
  if (-not (Test-Path -LiteralPath $path)) { [PSCustomObject]@{ success=$true; exists=$false; value=$null } | ConvertTo-Json -Compress; exit 0 }
  $item = Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $item -or $null -eq $item.$name) { [PSCustomObject]@{ success=$true; exists=$false; value=$null } | ConvertTo-Json -Compress; exit 0 }
  [PSCustomObject]@{ success=$true; exists=$true; value=$item.$name } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success=$false; exists=$false; value=$null; error=$_.Exception.Message } | ConvertTo-Json -Compress
}
    `
  },
  apply: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SOFTWARE\\Policies\\Google\\Update"
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
New-ItemProperty -LiteralPath $path -Name "UpdateDefault" -PropertyType DWord -Value 0 -Force -ErrorAction Stop
    `
  },
  verify: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SOFTWARE\\Policies\\Google\\Update"
try {
  $item = Get-ItemProperty -LiteralPath $path -Name "UpdateDefault" -ErrorAction Stop
  [PSCustomObject]@{ success=$true; exists=$true; value=$item.UpdateDefault } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success=$true; exists=$false; value=$null } | ConvertTo-Json -Compress
}
    `,
    expected: { exists: true, value: 0 }
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SOFTWARE\\Policies\\Google\\Update"
$name = "UpdateDefault"
if ($snapshotExists -eq $true) {
  if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
  New-ItemProperty -LiteralPath $path -Name $name -PropertyType DWord -Value $snapshotValue -Force -ErrorAction Stop
} else {
  Remove-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
}
    `
  },
  commands: { linux: { apply: `echo "simulado"`, revert: `echo "simulado"` } }
},
{
  id: 'disable-edge-autoupdate',
  category: 'Privacidade',
  title: 'Desativar Atualização Automática do Edge',
  description: 'Impede que o Microsoft Edge se atualize automaticamente em segundo plano.',
  risk: 'low',
  requiresAdmin: true,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\EdgeUpdate"
$name = "UpdateDefault"
try {
  if (-not (Test-Path -LiteralPath $path)) { [PSCustomObject]@{ success=$true; exists=$false; value=$null } | ConvertTo-Json -Compress; exit 0 }
  $item = Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $item -or $null -eq $item.$name) { [PSCustomObject]@{ success=$true; exists=$false; value=$null } | ConvertTo-Json -Compress; exit 0 }
  [PSCustomObject]@{ success=$true; exists=$true; value=$item.$name } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success=$false; exists=$false; value=$null; error=$_.Exception.Message } | ConvertTo-Json -Compress
}
    `
  },
  apply: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\EdgeUpdate"
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
New-ItemProperty -LiteralPath $path -Name "UpdateDefault" -PropertyType DWord -Value 0 -Force -ErrorAction Stop
    `
  },
  verify: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\EdgeUpdate"
try {
  $item = Get-ItemProperty -LiteralPath $path -Name "UpdateDefault" -ErrorAction Stop
  [PSCustomObject]@{ success=$true; exists=$true; value=$item.UpdateDefault } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success=$true; exists=$false; value=$null } | ConvertTo-Json -Compress
}
    `,
    expected: { exists: true, value: 0 }
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SOFTWARE\\Policies\\Microsoft\\EdgeUpdate"
$name = "UpdateDefault"
if ($snapshotExists -eq $true) {
  if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
  New-ItemProperty -LiteralPath $path -Name $name -PropertyType DWord -Value $snapshotValue -Force -ErrorAction Stop
} else {
  Remove-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
}
    `
  },
  commands: { linux: { apply: `echo "simulado"`, revert: `echo "simulado"` } }
},
{
  id: 'disable-firefox-autoupdate',
  category: 'Privacidade',
  title: 'Desativar Atualização Automática do Firefox',
  description: 'Impede que o Mozilla Firefox se atualize automaticamente em segundo plano.',
  risk: 'low',
  requiresAdmin: true,
  createsBackup: true,
  engine: 'snapshot',
  read: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SOFTWARE\\Policies\\Mozilla\\Firefox"
$name = "DisableAppUpdate"
try {
  if (-not (Test-Path -LiteralPath $path)) { [PSCustomObject]@{ success=$true; exists=$false; value=$null } | ConvertTo-Json -Compress; exit 0 }
  $item = Get-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
  if ($null -eq $item -or $null -eq $item.$name) { [PSCustomObject]@{ success=$true; exists=$false; value=$null } | ConvertTo-Json -Compress; exit 0 }
  [PSCustomObject]@{ success=$true; exists=$true; value=$item.$name } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success=$false; exists=$false; value=$null; error=$_.Exception.Message } | ConvertTo-Json -Compress
}
    `
  },
  apply: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SOFTWARE\\Policies\\Mozilla\\Firefox"
if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
New-ItemProperty -LiteralPath $path -Name "DisableAppUpdate" -PropertyType DWord -Value 1 -Force -ErrorAction Stop
    `
  },
  verify: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SOFTWARE\\Policies\\Mozilla\\Firefox"
try {
  $item = Get-ItemProperty -LiteralPath $path -Name "DisableAppUpdate" -ErrorAction Stop
  [PSCustomObject]@{ success=$true; exists=$true; value=$item.DisableAppUpdate } | ConvertTo-Json -Compress
} catch {
  [PSCustomObject]@{ success=$true; exists=$false; value=$null } | ConvertTo-Json -Compress
}
    `,
    expected: { exists: true, value: 1 }
  },
  restore: {
    script: `
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8
$path = "HKLM:\\SOFTWARE\\Policies\\Mozilla\\Firefox"
$name = "DisableAppUpdate"
if ($snapshotExists -eq $true) {
  if (-not (Test-Path $path)) { New-Item -Path $path -Force | Out-Null }
  New-ItemProperty -LiteralPath $path -Name $name -PropertyType DWord -Value $snapshotValue -Force -ErrorAction Stop
} else {
  Remove-ItemProperty -LiteralPath $path -Name $name -ErrorAction SilentlyContinue
}
    `
  },
  commands: { linux: { apply: `echo "simulado"`, revert: `echo "simulado"` } }
},

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
 * Verify → Clean. Recusa reverter sem snapshot salvo OU com snapshot
 * corrompido/malformado (proteção contra dados inconsistentes em disco).
 */
async function revertWithSnapshot(tweak) {
  const snapshot = getSnapshot(tweak.id);

  const isValidSnapshot =
    snapshot &&
    snapshot.previousState &&
    typeof snapshot.previousState === 'object' &&
    'exists' in snapshot.previousState;

  if (!isValidSnapshot) {
    log.error(`[snapshot-engine] Snapshot ausente ou malformado para "${tweak.id}" — reversão recusada.`, snapshot);

    // Snapshot corrompido não serve para mais nada — remove para não
    // ficar travado tentando reverter contra um dado inválido para sempre.
    if (snapshot) removeSnapshot(tweak.id);

    return {
      success: false, tweakId: tweak.id,
      error: 'Nenhum estado original válido foi encontrado para este ajuste. O registro de segurança foi limpo — você pode ativar o ajuste novamente para criar um novo snapshot correto.'
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