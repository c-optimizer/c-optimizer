import React, { useEffect, useState } from 'react';
import {
  Gamepad2, ShieldCheck, Sparkles, Network, RotateCcw,
  Loader2, CheckCircle2, AlertCircle, Zap
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const ICON_MAP = {
  gaming: Gamepad2,
  privacy: ShieldCheck,
  minimalist: Sparkles,
  network: Network,
  reset: RotateCcw,
};

const ACCENT_CLASSES = {
  primary: {
    border: 'border-c-primary/30',
    bg: 'bg-c-primary/10',
    text: 'text-c-primary',
    button: 'border-c-primary/40 text-c-primary hover:bg-c-primary/20',
  },
  secondary: {
    border: 'border-c-secondary/30',
    bg: 'bg-c-secondary/10',
    text: 'text-c-secondary',
    button: 'border-c-secondary/40 text-c-secondary hover:bg-c-secondary/20',
  },
  danger: {
    border: 'border-c-danger/30',
    bg: 'bg-c-danger/10',
    text: 'text-c-danger',
    button: 'border-c-danger/40 text-c-danger hover:bg-c-danger/20',
  },
};

function PresetsView() {
  const { t } = useLanguage();
  const [presets, setPresets] = useState([]);
  const [states, setStates] = useState({});
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState(null);
  const [currentStep, setCurrentStep] = useState(null);
  const [resultMsg, setResultMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Game Mode
  const [gameModeEnabled, setGameModeEnabled] = useState(false);
  const [gameModeState, setGameModeState] = useState('idle');
  const [gameModeCurrentGame, setGameModeCurrentGame] = useState(null);
  const [gameModeBusy, setGameModeBusy] = useState(false);
  const [gameModeError, setGameModeError] = useState(null);
  const [isAdmin, setIsAdmin] = useState(true);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = () => {};
    let unsubGameMode = () => {};

        async function load() {
      const [presetResult, gmResult] = await Promise.allSettled([
        window.electronAPI.invoke('preset:list'),
        window.electronAPI.invoke('game-mode:get-status'),
      ]);

      if (!isMounted) return;

      if (presetResult.status === 'fulfilled' && presetResult.value?.success) {
        setPresets(presetResult.value.presets);
        setStates(presetResult.value.states);
      } else if (presetResult.status === 'rejected') {
        setErrorMsg(presetResult.reason?.message || 'Falha ao carregar presets.');
      }

      if (gmResult.status === 'fulfilled' && gmResult.value?.success) {
        setGameModeEnabled(gmResult.value.enabled);
        setGameModeState(gmResult.value.state);
        setGameModeCurrentGame(gmResult.value.currentGame);
        setIsAdmin(gmResult.value.isAdmin);
      }
      // Se game-mode falhar, só ignora — o card fica em estado neutro,
      // mas os presets continuam funcionando.

      setLoading(false);
    }

    load();

    unsubscribe = window.electronAPI.on('preset:progress', (evt) => {
      if (evt.status === 'applying') setCurrentStep(t('presets.stepApplying').replace('{title}', evt.title || ''));
      else if (evt.status === 'applied') setCurrentStep(t('presets.stepApplied'));
      else if (evt.status === 'failed') setCurrentStep(t('presets.stepFailed'));
      else if (evt.status === 'skipped') setCurrentStep(t('presets.stepSkipped'));
    });

    unsubGameMode = window.electronAPI.on('game-mode:state', (evt) => {
      setGameModeState(evt.state);
      setGameModeCurrentGame(evt.game);
    });

    return () => { isMounted = false; unsubscribe(); unsubGameMode(); };
  }, [t]);

  const handleApply = async (preset) => {
    const isReset = preset.special === 'revert-all';
    const presetName = t(`presets.items.${preset.id}.name`);
    const confirmMsg = isReset
      ? t('presets.confirmRevert')
      : t('presets.confirmApply').replace('{name}', presetName).replace('{count}', preset.tweakCount);
    if (!window.confirm(confirmMsg)) return;

    setApplyingId(preset.id);
    setResultMsg(null);
    setErrorMsg(null);
    setCurrentStep(t('presets.starting'));

    try {
      const res = await window.electronAPI.invoke('preset:apply', preset.id);

      if (res.success) {
        if (isReset) {
          setResultMsg(t('presets.resultReset').replace('{count}', res.reverted?.length || 0));
        } else {
          setResultMsg(t('presets.resultApplied')
            .replace('{name}', presetName)
            .replace('{applied}', res.applied?.length || 0)
            .replace('{skipped}', res.skipped?.length || 0));
        }
      } else {
        const failedCount = res.failed?.length || 0;
        setErrorMsg(
          res.error ||
          (failedCount > 0
            ? t('presets.resultFailedCount').replace('{count}', failedCount)
            : t('presets.resultFailed'))
        );
      }

      const refreshed = await window.electronAPI.invoke('preset:list');
      if (refreshed?.success) setStates(refreshed.states);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setApplyingId(null);
      setCurrentStep(null);
      setTimeout(() => { setResultMsg(null); setErrorMsg(null); }, 8000);
    }
  };

    const handleToggleGameMode = async () => {
    setGameModeBusy(true);
    setGameModeError(null);
    try {
      const channel = gameModeEnabled ? 'game-mode:disable' : 'game-mode:enable';
      const result = await window.electronAPI.invoke(channel);
      if (result.success) {
        setGameModeEnabled(!gameModeEnabled);
      } else {
        setGameModeError(result.error || 'Falha ao alternar o Modo de Jogo.');
      }
    } catch (err) {
      setGameModeError(err.message);
    } finally {
      setGameModeBusy(false);
      setTimeout(() => setGameModeError(null), 5000);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-slate-500 text-sm">
        <Loader2 size={16} className="animate-spin" />
        {t('presets.loading')}
      </div>
    );
  }

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-start gap-2.5 bg-c-surface border border-c-border rounded-lg px-4 py-3 text-sm text-slate-400">
        <Zap size={18} className="text-c-secondary shrink-0 mt-0.5" />
        <span>{t('presets.hint')}</span>
      </div>

      {resultMsg && (
        <div className="flex items-center gap-2 text-c-primary text-sm bg-c-primary/10 border border-c-primary/30 rounded-lg px-4 py-3">
          <CheckCircle2 size={16} />
          {resultMsg}
        </div>
      )}

      {errorMsg && (
        <div className="flex items-start gap-2 text-c-danger text-sm bg-c-danger/10 border border-c-danger/30 rounded-lg px-4 py-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Card: Modo de Jogo Adaptativo */}
      <div className="bg-c-surface border border-c-secondary/30 rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-lg bg-c-secondary/10 border border-c-secondary/30">
              <Gamepad2 size={20} className="text-c-secondary" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="text-slate-100 font-semibold text-base">{t('presets.gameMode.title')}</h3>
                {gameModeEnabled && (
                  <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                    gameModeState === 'active'
                      ? 'bg-c-primary/10 text-c-primary border-c-primary/30'
                      : 'bg-c-secondary/10 text-c-secondary border-c-secondary/30'
                  }`}>
                    {gameModeState === 'active' ? t('presets.gameMode.gameActive') : t('presets.gameMode.monitoring')}
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                {t('presets.gameMode.description')}
              </p>
            </div>
          </div>
          <button
            onClick={handleToggleGameMode}
            disabled={gameModeBusy || !isAdmin}
            className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 ${
              gameModeEnabled
                ? 'border-c-danger/40 text-c-danger hover:bg-c-danger/10'
                : 'border-c-secondary/40 text-c-secondary hover:bg-c-secondary/10'
            }`}
          >
            {gameModeBusy ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
            {gameModeBusy
              ? t('presets.gameMode.waiting')
              : gameModeEnabled
                ? t('presets.gameMode.disable')
                : t('presets.gameMode.enable')}
          </button>
        </div>

        {gameModeEnabled && gameModeCurrentGame && (
          <div className="flex items-center gap-2 text-c-primary text-xs bg-c-primary/10 border border-c-primary/30 rounded-lg px-3 py-2">
            <Gamepad2 size={14} />
            {t('presets.gameMode.detectedGame')}: <span className="font-mono">{gameModeCurrentGame}</span>
          </div>
        )}

        {!isAdmin && (
          <div className="flex items-start gap-2 text-c-danger text-xs bg-c-danger/10 border border-c-danger/30 rounded-lg px-3 py-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            {t('presets.gameMode.needsAdmin')}
          </div>
        )}

        {gameModeError && (
          <div className="flex items-start gap-2 text-c-danger text-xs bg-c-danger/10 border border-c-danger/30 rounded-lg px-3 py-2">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            {gameModeError}
          </div>
        )}
      </div>

      {/* Grid de presets */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {presets.map((preset) => {
          const Icon = ICON_MAP[preset.id] || Sparkles;
          const accent = ACCENT_CLASSES[preset.accent] || ACCENT_CLASSES.secondary;
          const state = states[preset.id];
          const isBusy = applyingId === preset.id;
          const presetName = t(`presets.items.${preset.id}.name`);
          const presetDesc = t(`presets.items.${preset.id}.description`);

          return (
            <div
              key={preset.id}
              className={`bg-c-surface border rounded-xl p-5 flex flex-col gap-4 ${accent.border}`}
            >
              <div className="flex items-start gap-3">
                <div className={`p-2.5 rounded-lg ${accent.bg} border ${accent.border}`}>
                  <Icon size={20} className={accent.text} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-slate-100 font-semibold text-base">{presetName}</h3>
                    {state === 'applied' && (
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-c-primary/10 text-c-primary border border-c-primary/30">
                        {t('presets.stateApplied')}
                      </span>
                    )}
                    {state === 'partial' && (
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                        {t('presets.statePartial')}
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-xs mt-2 leading-relaxed">{presetDesc}</p>
                  {preset.tweakCount > 0 && (
                    <p className="text-slate-500 text-[11px] mt-2">
                      {t('presets.tweakCount').replace('{count}', preset.tweakCount)}
                    </p>
                  )}
                </div>
              </div>

              {isBusy && currentStep && (
                <div className="flex items-center gap-2 text-slate-400 text-xs bg-c-bg border border-c-border rounded-lg px-3 py-2">
                  <Loader2 size={12} className="animate-spin" />
                  {currentStep}
                </div>
              )}

              <button
                onClick={() => handleApply(preset)}
                disabled={!!applyingId}
                className={`self-start flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium transition-colors disabled:opacity-50 ${accent.button}`}
              >
                {isBusy
                  ? <Loader2 size={14} className="animate-spin" />
                  : <Icon size={14} />}
                {isBusy
                  ? t('presets.applying')
                  : (preset.special === 'revert-all' ? t('presets.revertAll') : t('presets.apply'))}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PresetsView;