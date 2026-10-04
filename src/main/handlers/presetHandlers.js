const { ipcMain, BrowserWindow } = require('electron');
const store = require('../store');
const { withLicense } = require('../utils/licenseGuard');
const { isRunningAsAdmin } = require('../utils/shell');
const { log } = require('../utils/logger');
const {
  applyWithSnapshot,
  revertWithSnapshot,
  revertAllTweaks,
  TWEAKS_CATALOG,
} = require('./tweaksHandlers');

/**
 * Catálogo de presets. Cada preset é uma lista curada de tweaks que fazem
 * sentido em conjunto. Os IDs DEVEM existir em TWEAKS_CATALOG — validado
 * no boot por assertPresetsValid().
 *
 * 'special: revert-all' indica que o preset é um atalho para a função de
 * reverter todas as otimizações (não aplica tweak nenhum).
 */
const PRESETS = [
  {
    id: 'gaming',
    name: 'Modo Gaming',
    description: 'Aplica todos os ajustes de baixa latência, prioridade de CPU e resposta do mouse para máxima performance em jogos.',
    accent: 'primary',
    tweaks: [
      'gaming-priority',
      'disable-mouse-accel',
      'disable-fullscreen-opt',
      'disable-hpet',
      'network-nagle',
      'network-throttling',
      'gpu-scheduling',
      'power-plan',
    ],
  },
  {
    id: 'privacy',
    name: 'Modo Privacidade',
    description: 'Bloqueia telemetria, rastreamento, localização e coleta de dados do Windows.',
    accent: 'secondary',
    tweaks: [
      'disable-telemetry',
      'disable-telemetry-services',
      'disable-copilot',
      'disable-location-tracking',
      'disable-wifi-sense',
      'disable-lock-screen-tips',
      'disable-insider',
    ],
  },
  {
    id: 'minimalist',
    name: 'Modo Minimalista',
    description: 'Remove elementos visuais desnecessários, sugestões e serviços de UI, deixando o Windows mais leve.',
    accent: 'secondary',
    tweaks: [
      'visual-performance',
      'background-apps',
      'hide-action-center',
      'hide-people-icon',
      'menu-show-delay',
      'explorer-compact-mode',
      'restore-classic-context-menu',
    ],
  },
  {
    id: 'network',
    name: 'Modo Rede',
    description: 'Otimiza exclusivamente latência e throughput de rede. Útil para jogos online e streaming.',
    accent: 'secondary',
    tweaks: [
      'network-nagle',
      'network-throttling',
    ],
  },
  {
    id: 'reset',
    name: 'Reverter Tudo',
    description: 'Desativa TODAS as otimizações ativas e restaura o Windows ao estado original.',
    accent: 'danger',
    special: 'revert-all',
    tweaks: [],
  },
];

/**
 * Valida que todos os IDs de tweak referenciados nos presets existem no
 * catálogo real. Roda no boot — se algum ID estiver errado, loga um erro
 * claro em vez de falhar silenciosamente no apply.
 */
function assertPresetsValid() {
  const knownIds = new Set(TWEAKS_CATALOG.map((t) => t.id));
  for (const preset of PRESETS) {
    for (const tweakId of preset.tweaks) {
      if (!knownIds.has(tweakId)) {
        log.error(`[presets] Preset "${preset.id}" referencia tweak inexistente: "${tweakId}".`);
      }
    }
  }
}

/**
 * Calcula o estado de cada preset com base nos tweaks ativos.
 * Estado possíveis: 'applied' | 'partial' | 'idle' | 'unknown'
 */
function getPresetStates() {
  const applied = store.get('tweaksApplied', {});
  const states = {};

  for (const preset of PRESETS) {
    if (preset.special === 'revert-all') {
      states[preset.id] = 'idle';
      continue;
    }
    if (!preset.tweaks || preset.tweaks.length === 0) {
      states[preset.id] = 'unknown';
      continue;
    }
    const activeCount = preset.tweaks.filter((id) => applied[id]).length;
    const total = preset.tweaks.length;
    if (activeCount === total) states[preset.id] = 'applied';
    else if (activeCount === 0) states[preset.id] = 'idle';
    else states[preset.id] = 'partial';
  }

  return states;
}

async function applySinglePreset(preset, window) {
  const applied = store.get('tweaksApplied', {});
  const results = { applied: [], skipped: [], failed: [] };

  for (const tweakId of preset.tweaks) {
    const tweak = TWEAKS_CATALOG.find((t) => t.id === tweakId);
    if (!tweak) {
      results.failed.push({ id: tweakId, error: 'Tweak não encontrado no catálogo.' });
      continue;
    }

    // Já ativo — não re-aplica, senão cria snapshot duplicado.
    if (applied[tweakId]) {
      results.skipped.push(tweakId);
      if (window && !window.isDestroyed()) {
        window.webContents.send('preset:progress', {
          presetId: preset.id, tweakId, status: 'skipped'
        });
      }
      continue;
    }

    if (window && !window.isDestroyed()) {
      window.webContents.send('preset:progress', {
        presetId: preset.id, tweakId, status: 'applying', title: tweak.title
      });
    }

    try {
      const r = await applyWithSnapshot(tweak);
      if (r.success) {
        results.applied.push(tweakId);
        if (window && !window.isDestroyed()) {
          window.webContents.send('preset:progress', {
            presetId: preset.id, tweakId, status: 'applied'
          });
        }
      } else {
        results.failed.push({ id: tweakId, error: r.error });
        if (window && !window.isDestroyed()) {
          window.webContents.send('preset:progress', {
            presetId: preset.id, tweakId, status: 'failed', error: r.error
          });
        }
      }
    } catch (err) {
      log.error(`[presets] Erro ao aplicar "${tweakId}":`, err.message);
      results.failed.push({ id: tweakId, error: err.message });
    }
  }

  return results;
}

function registerPresetHandlers() {
  assertPresetsValid();

  ipcMain.handle('preset:list', withLicense(async () => {
    return {
      success: true,
      presets: PRESETS.map((p) => ({
        id: p.id,
        name: p.name,
        description: p.description,
        accent: p.accent || 'secondary',
        tweakCount: p.special === 'revert-all' ? 0 : p.tweaks.length,
        special: p.special || null,
      })),
      states: getPresetStates(),
    };
  }));

  ipcMain.handle('preset:apply', withLicense(async (event, presetId) => {
    if (process.platform !== 'win32') {
      return { success: false, error: 'Disponível apenas no Windows.' };
    }

    const preset = PRESETS.find((p) => p.id === presetId);
    if (!preset) return { success: false, error: `Preset "${presetId}" não encontrado.` };

    const window = BrowserWindow.fromWebContents(event.sender);

    // Preset especial: revert-all.
    if (preset.special === 'revert-all') {
      try {
        const r = await revertAllTweaks();
        return {
          success: r.success !== false,
          special: 'revert-all',
          reverted: r.reverted || [],
          failed: r.failed || [],
        };
      } catch (err) {
        log.error('[presets] Falha ao reverter tudo:', err.message);
        return { success: false, error: err.message };
      }
    }

    // Bloqueia se o preset contém tweaks que exigem admin e o app não é admin.
    // Sem isso, o usuário veria 4-8 prompts UAC seguidos.
    const needsAdmin = preset.tweaks.some((id) => {
      const t = TWEAKS_CATALOG.find((tw) => tw.id === id);
      return t && t.requiresAdmin;
    });
    if (needsAdmin && !isRunningAsAdmin()) {
      return {
        success: false,
        error: 'Este preset contém ajustes que exigem administrador. Reinicie o C-Optimizer como Administrador para aplicar em lote.'
      };
    }

    try {
      const results = await applySinglePreset(preset, window);
      log.info(`[presets] "${preset.id}": ${results.applied.length} aplicado(s), ${results.skipped.length} já ativo(s), ${results.failed.length} falha(s).`);
      return {
        success: results.failed.length === 0,
        presetId: preset.id,
        ...results,
      };
    } catch (err) {
      log.error(`[presets] Erro ao aplicar preset "${preset.id}":`, err.message);
      return { success: false, error: `Falha ao aplicar o preset: ${err.message}` };
    }
  }));
}

module.exports = { registerPresetHandlers, PRESETS };