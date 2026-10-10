const { ipcMain } = require('electron');
const store = require('../store');
const { log } = require('../utils/logger');

const ONBOARDING_KEY = 'onboarding';

function hasCompletedOnboarding() {
  const state = store.get(ONBOARDING_KEY, {});
  return !!state.completed;
}

function registerOnboardingHandlers() {
  // IMPORTANTE: estes handlers NÃO usam withLicense porque o onboarding
  // é checado ANTES do login. Ele precisa funcionar sem licença para
  // mostrar o wizard inicial.

  ipcMain.handle('onboarding:check', async () => {
    try {
      return { success: true, completed: hasCompletedOnboarding() };
    } catch (err) {
      log.error('[onboarding:check] Erro:', err.message);
      return { success: false, completed: true, error: err.message };
    }
  });

  ipcMain.handle('onboarding:complete', async (_event, payload = {}) => {
    try {
      store.set(ONBOARDING_KEY, {
        completed: true,
        completedAt: new Date().toISOString(),
        chosenProfile: payload.chosenProfile || null,
        applied: !!payload.applied,
        skipped: !!payload.skipped,
      });
      log.info('[onboarding] Concluído e salvo.', payload);
      return { success: true };
    } catch (err) {
      log.error('[onboarding:complete] Falha ao salvar estado:', err.message);
      return { success: false, error: err.message };
    }
  });

  // Reseta o estado — útil para testar o wizard de novo.
  ipcMain.handle('onboarding:reset', async () => {
    try {
      store.delete(ONBOARDING_KEY);
      log.info('[onboarding] Estado resetado.');
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}

module.exports = { registerOnboardingHandlers, hasCompletedOnboarding };