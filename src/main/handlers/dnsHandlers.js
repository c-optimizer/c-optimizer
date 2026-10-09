const { ipcMain } = require('electron');
const os = require('os');
const { runShellCommand, runCommandSmart, isRunningAsAdmin } = require('../utils/shell');
const { withLicense } = require('../utils/licenseGuard');
const { log } = require('../utils/logger');

/**
 * Catálogo de provedores DNS públicos. Cada provedor tem primário e
 * secundário. Os IPs são fixos e conhecidos — a latência depende da
 * rota da operadora até o servidor, por isso é medida em tempo real.
 */
const DNS_PROVIDERS = [
  { id: 'cloudflare', name: 'Cloudflare', primary: '1.1.1.1', secondary: '1.0.0.1', description: 'Foco em privacidade e velocidade' },
  { id: 'google', name: 'Google', primary: '8.8.8.8', secondary: '8.8.4.4', description: 'Confiável, amplamente usado' },
  { id: 'quad9', name: 'Quad9', primary: '9.9.9.9', secondary: '149.112.112.112', description: 'Bloqueia domínios maliciosos' },
  { id: 'adguard', name: 'AdGuard', primary: '94.140.14.14', secondary: '94.140.15.15', description: 'Bloqueia anúncios e rastreadores' },
  { id: 'opendns', name: 'OpenDNS', primary: '208.67.222.222', secondary: '208.67.220.220', description: 'Proteção contra phishing' },
  { id: 'cloudflare-family', name: 'Cloudflare Family', primary: '1.1.1.2', secondary: '1.0.0.2', description: 'Bloqueia conteúdo adulto e malware' },
  { id: 'opendns-family', name: 'OpenDNS FamilyShield', primary: '208.67.222.123', secondary: '208.67.220.123', description: 'Bloqueia conteúdo adulto' },
];

/**
 * Lista adaptadores de rede ativos (up), excluindo loopback e virtuais.
 */
async function listAdapters() {
  const script = `
$adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object {
  $_.Status -eq 'Up' -and $_.InterfaceDescription -notlike '*Loopback*'
} | Select-Object Name, InterfaceIndex, InterfaceDescription, LinkSpeed, MacAddress
$adapters | ConvertTo-Json -Compress
`.trim();

  const { stdout } = await runShellCommand(script, 15000);
  const trimmed = (stdout || '').trim();
  if (!trimmed) return [];
  const parsed = JSON.parse(trimmed);
  const list = Array.isArray(parsed) ? parsed : [parsed];

  // Enriquecer com o DNS atual de cada adaptador.
  const enriched = [];
  for (const ad of list) {
    let currentDns = [];
    let isDhcp = true;
    try {
      const dnsScript = `
$servers = Get-DnsClientServerAddress -InterfaceIndex ${ad.InterfaceIndex} -AddressFamily IPv4 -ErrorAction SilentlyContinue
if ($null -ne $servers) {
  $servers | Select-Object -ExpandProperty ServerAddresses | ConvertTo-Json -Compress
}
`.trim();
      const dnsResult = await runShellCommand(dnsScript, 8000);
      const dnsTrimmed = (dnsResult.stdout || '').trim();
      if (dnsTrimmed) {
        const dnsParsed = JSON.parse(dnsTrimmed);
        currentDns = Array.isArray(dnsParsed) ? dnsParsed : [dnsParsed];
        isDhcp = currentDns.length === 0;
      }
    } catch { /* mantém vazio (DHCP) */ }

    enriched.push({
      name: ad.Name,
      index: ad.InterfaceIndex,
      description: ad.InterfaceDescription,
      linkSpeed: ad.LinkSpeed,
      mac: ad.MacAddress,
      currentDns,
      isDhcp,
    });
  }

  return enriched;
}

/**
 * Testa a latência de cada provedor DNS. Para cada um, faz 3 consultas
 * ao Google e usa a média como métrica. Timeout curto (QuickTimeout) para
 * não travar em servidores inacessíveis.
 */
async function testDnsServers() {
  const serversJson = JSON.stringify(DNS_PROVIDERS.map((p) => ({ Name: p.name, Primary: p.primary })));

  const script = `
$servers = '${serversJson.replace(/'/g, "''")}' | ConvertFrom-Json
$results = @()

foreach ($s in $servers) {
  $samples = @()
  for ($i = 0; $i -lt 3; $i++) {
    try {
      $t = Measure-Command {
        Resolve-DnsName -Name 'google.com' -Server $s.Primary -DnsOnly -QuickTimeout -ErrorAction Stop | Out-Null
      }
      $samples += $t.TotalMilliseconds
    } catch { }
  }
  if ($samples.Count -gt 0) {
    $avg = ($samples | Measure-Object -Average).Average
    $results += [PSCustomObject]@{
      Name = $s.Name
      LatencyMs = [Math]::Round($avg, 1)
      Success = $true
    }
  } else {
    $results += [PSCustomObject]@{
      Name = $s.Name
      LatencyMs = $null
      Success = $false
    }
  }
}

$results | ConvertTo-Json -Compress
`.trim();

  const { stdout } = await runShellCommand(script, 60000);
  const trimmed = (stdout || '').trim();
  if (!trimmed) return [];

  const parsed = JSON.parse(trimmed);
  const list = Array.isArray(parsed) ? parsed : [parsed];

  // Combinar com o catálogo (name → id + secondary + description)
  return DNS_PROVIDERS.map((provider) => {
    const tested = list.find((r) => r.Name === provider.name);
    return {
      id: provider.id,
      name: provider.name,
      primary: provider.primary,
      secondary: provider.secondary,
      description: provider.description,
      latencyMs: tested?.Success ? tested.LatencyMs : null,
      reachable: !!tested?.Success,
    };
  });
}

/**
 * Aplica DNS específico no adaptador. Requer admin.
 */
async function applyDns(adapterIndex, primary, secondary) {
  if (!isRunningAsAdmin()) {
    return { success: false, error: 'Aplicar DNS exige privilégios de administrador.' };
  }

  const script = `
Set-DnsClientServerAddress -InterfaceIndex ${Number(adapterIndex)} -ServerAddresses @('${primary}', '${secondary}') -ErrorAction Stop
`.trim();

  try {
    await runCommandSmart(script, true, 15000);
    return { success: true };
  } catch (error) {
    log.error('[dns:apply] Erro:', error.message);
    const cancelled = error.message.includes('1223') || error.message.includes('cancelado');
    return {
      success: false,
      error: cancelled ? 'Permissão de administrador cancelada.' : 'Falha ao aplicar o DNS.',
    };
  }
}

/**
 * Reseta o DNS do adaptador para DHCP (automático). Requer admin.
 */
async function resetDns(adapterIndex) {
  if (!isRunningAsAdmin()) {
    return { success: false, error: 'Restaurar DNS exige privilégios de administrador.' };
  }

  const script = `
Set-DnsClientServerAddress -InterfaceIndex ${Number(adapterIndex)} -ResetServerAddresses -ErrorAction Stop
ipconfig /flushdns | Out-Null
`.trim();

  try {
    await runCommandSmart(script, true, 15000);
    return { success: true };
  } catch (error) {
    log.error('[dns:reset] Erro:', error.message);
    const cancelled = error.message.includes('1223') || error.message.includes('cancelado');
    return {
      success: false,
      error: cancelled ? 'Permissão de administrador cancelada.' : 'Falha ao restaurar o DNS.',
    };
  }
}

function registerDnsHandlers() {
  ipcMain.handle('dns:list-adapters', withLicense(async () => {
    if (os.platform() !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    try {
      const adapters = await listAdapters();
      return { success: true, adapters };
    } catch (error) {
      log.error('[dns:list-adapters] Erro:', error.message);
      return { success: false, error: 'Não foi possível listar os adaptadores de rede.' };
    }
  }));

  ipcMain.handle('dns:test-servers', withLicense(async () => {
    if (os.platform() !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    try {
      const servers = await testDnsServers();
      return { success: true, servers };
    } catch (error) {
      log.error('[dns:test-servers] Erro:', error.message);
      return { success: false, error: 'Falha ao testar os servidores DNS.' };
    }
  }));

  ipcMain.handle('dns:apply', withLicense(async (_event, adapterIndex, primary, secondary) => {
    if (os.platform() !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    if (!adapterIndex || !primary || !secondary) {
      return { success: false, error: 'Parâmetros inválidos.' };
    }
    return applyDns(adapterIndex, primary, secondary);
  }));

  ipcMain.handle('dns:reset', withLicense(async (_event, adapterIndex) => {
    if (os.platform() !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }
    if (!adapterIndex) {
      return { success: false, error: 'Adaptador não informado.' };
    }
    return resetDns(adapterIndex);
  }));
}

module.exports = { registerDnsHandlers };