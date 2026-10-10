/**
 * Limpa as pastas de cache do Electron antes de rodar `npm run dev`.
 *
 * Motivo: quando o Electron é encerrado abruptamente (crash, Ctrl+C, kill),
 * pastas como GPUCache e Cache ficam "travadas" com handles abertos pelo
 * processo anterior. Na próxima inicialização, o Chromium tenta movê-las
 * para recriar, falha com "Unable to move the cache: Acesso negado", e o
 * renderer morre — deixando a janela preta.
 *
 * Este script roda ANTES do Electron iniciar (portanto sem handles abertos)
 * e limpa as pastas com segurança. Não afeta produção — só dev.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// Pastas de cache que o Electron cria no userData. Seguro deletar — o
// Chromium as recria vazias na próxima execução.
const CACHE_FOLDERS = [
  'Cache',
  'Code Cache',
  'GPUCache',
  'DawnCache',
  'DawnGraphiteCache',
  'DawnWebGPUCache',
  'ShaderCache',
  'GrShaderCache',
];

function getElectronUserDataDir() {
  // Em dev, o Electron usa %APPDATA%\<productName> por padrão — mas o
  // userData exato depende de `app.getName()`. Tentamos os dois nomes
  // mais prováveis, sem depender do Electron (não está pronto ainda).
  const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');

  const candidates = [
    path.join(appData, 'c-optimizer'),
    path.join(appData, 'C-Optimizer'),
    path.join(appData, 'Cestari Tech'), // caso o author vire o nome do dir
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0]; // retorna o mais provável mesmo se não existir
}

function rimrafSync(target) {
  if (!fs.existsSync(target)) return false;
  try {
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
    return true;
  } catch (err) {
    // Ignora erros individuais — cache pode estar em uso residual.
    // O próximo dev ainda funciona; só não limpa 100%.
    if (process.env.DEBUG) console.warn(`[clean-cache] Falha em ${target}: ${err.message}`);
    return false;
  }
}

function cleanTempElectronResidues() {
  // Resíduos do Chromium no %TEMP% — scoped_dir*, electron-* etc.
  const tmp = os.tmpdir();
  let cleaned = 0;

  let entries;
  try { entries = fs.readdirSync(tmp); }
  catch { return 0; }

  for (const name of entries) {
    if (!/^(scoped_dir|electron-|chrome_|\.org\.chromium)/i.test(name)) continue;
    const full = path.join(tmp, name);
    try {
      fs.rmSync(full, { recursive: true, force: true, maxRetries: 2, retryDelay: 50 });
      cleaned++;
    } catch { /* ignora */ }
  }
  return cleaned;
}

function main() {
  const userDataDir = getElectronUserDataDir();

  if (!fs.existsSync(userDataDir)) {
    console.log('[clean-cache] Nenhum cache anterior encontrado (primeira execução).');
    return;
  }

  let cleaned = 0;
  for (const folder of CACHE_FOLDERS) {
    const full = path.join(userDataDir, folder);
    if (rimrafSync(full)) cleaned++;
  }

  const tmpCleaned = cleanTempElectronResidues();

  if (cleaned > 0 || tmpCleaned > 0) {
    console.log(`[clean-cache] ${cleaned} pasta(s) de cache e ${tmpCleaned} resíduo(s) em %TEMP% removidos.`);
  } else {
    console.log('[clean-cache] Nada a limpar.');
  }
}

main();