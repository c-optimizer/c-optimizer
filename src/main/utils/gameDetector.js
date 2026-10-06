const { exec } = require('child_process');
const { log } = require('./logger');

/**
 * Lista curada de executáveis de jogos conhecidos. Quando um deles estiver
 * rodando, o Game Mode considera "jogo ativo". Case-insensitive.
 *
 * NÃO incluir executáveis ambíguos como javaw.exe (compartilhado com outros
 * apps Java) para evitar falsos positivos.
 */
const KNOWN_GAME_PROCESSES = new Set([
  // FPS / Battle Royale
  'cs2.exe', 'valorant.exe', 'r5apex.exe', 'tslgame.exe', 'fortniteclient-win64-shipping.exe',
  'modernwarfare.exe', 'cod.exe', 'bf2042.exe', 'rainbowsix.exe', 'rainbowsix_dx11.exe',
  'escapefromtarkov.exe', 'helldivers2.exe', 'overwatch.exe', 'paladins.exe',
  // MOBA
  'leagueclient.exe', 'league of legends.exe', 'dota2.exe', 'lol.launcher.exe',
  // MMO
  'pathofexile.exe', 'lostark.exe', 'wow.exe', 'finalfantasyxiv_dx11.exe',
  // Open World / RPG
  'gta5.exe', 'rdr2.exe', 'cyberpunk2077.exe', 'eldenring.exe', 'starfield.exe',
  'hogwartslegacy.exe', 'bg3.exe', 'dragonageinquisition.exe',
  // Sandbox / Survival
  'minecraft.windows.exe', 'rustclient.exe', 'palworld-win64-shipping.exe',
  'valheim.exe', 'dayz_x64.exe', 'arksurvivalevolved.exe', 'shootergame.exe',
  // Corrida / Esporte
  'rocketleague.exe', 'forzahorizon5.exe', 'forzahorizon4.exe', 'f1_23.exe',
  'f1_24.exe', 'assettocorsa.exe',
  // Party / Casual
  'robloxplayerbeta.exe', 'fallguys_client_game.exe', 'among us.exe',
  // Estratégia / Simulação
  'cities.exe', 'stellaris.exe', 'civilizationvi.exe',
  // Outros populares
  'seaofthethieves.exe', 'deadbydaylight-win64-shipping.exe', 'phasmophobia.exe',
  'lethal company.exe', 'content warning.exe', 'thefinals.exe', 'nba2k24.exe',
]);

const POLL_INTERVAL_MS = 10_000;

let pollTimer = null;
let currentState = 'idle';    // idle | detecting | active | reverting
let currentGame = null;
let onStateChangeCallback = null;

function readRunningProcesses() {
  return new Promise((resolve) => {
    exec('tasklist /FO CSV /NH', { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) return resolve(new Set());
      const names = new Set();
      for (const line of stdout.split(/\r?\n/)) {
        const m = line.match(/^"([^"]+)"/);
        if (m) names.add(m[1].toLowerCase());
      }
      resolve(names);
    });
  });
}

async function detectActiveGame() {
  const processes = await readRunningProcesses();
  for (const name of processes) {
    if (KNOWN_GAME_PROCESSES.has(name)) return name;
  }
  return null;
}

function setState(newState, gameName = null) {
  if (currentState === newState && currentGame === gameName) return;
  currentState = newState;
  currentGame = gameName;
  log.info(`[gameMode] Estado: ${newState}${gameName ? ` (${gameName})` : ''}`);
  if (typeof onStateChangeCallback === 'function') {
    try { onStateChangeCallback({ state: newState, game: gameName }); }
    catch (err) { log.warn('[gameMode] Erro no callback de estado:', err.message); }
  }
}

function getState() {
  return { state: currentState, game: currentGame };
}

function setOnStateChange(cb) {
  onStateChangeCallback = cb;
}

function stopPolling() {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

function startPolling({ onGameStart, onGameEnd }) {
  stopPolling();
  pollTimer = setInterval(async () => {
    if (currentState === 'detecting' || currentState === 'reverting') return;
    try {
      const game = await detectActiveGame();
      if (game && currentState === 'idle') {
        setState('detecting', game);
        await onGameStart(game);
      } else if (!game && currentState === 'active') {
        setState('reverting', currentGame);
        await onGameEnd();
      }
    } catch (err) {
      log.error('[gameMode] Erro no polling:', err.message);
    }
  }, POLL_INTERVAL_MS);

  // Roda uma vez imediatamente para não esperar 10s no boot.
  (async () => {
    try {
      const game = await detectActiveGame();
      if (game) {
        setState('detecting', game);
        await onGameStart(game);
      }
    } catch { /* ignora no boot */ }
  })();
}

module.exports = {
  KNOWN_GAME_PROCESSES,
  getState,
  setState,
  setOnStateChange,
  startPolling,
  stopPolling,
  detectActiveGame,
};