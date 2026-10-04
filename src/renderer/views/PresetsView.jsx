import React, { useEffect, useState } from 'react';
import {
  Gamepad2, ShieldCheck, Sparkles, Network, RotateCcw,
  Loader2, CheckCircle2, AlertCircle, Zap
} from 'lucide-react';

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
  const [presets, setPresets] = useState([]);
  const [states, setStates] = useState({});
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState(null);
  const [currentStep, setCurrentStep] = useState(null);
  const [resultMsg, setResultMsg] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = () => {};

    async function load() {
      try {
        const res = await window.electronAPI.invoke('preset:list');
        if (isMounted && res?.success) {
          setPresets(res.presets);
          setStates(res.states);
        }
      } catch (err) {
        if (isMounted) setErrorMsg(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    load();

    unsubscribe = window.electronAPI.on('preset:progress', (evt) => {
      if (evt.status === 'applying') {
        setCurrentStep(`Aplicando: ${evt.title}`);
      } else if (evt.status === 'applied') {
        setCurrentStep('Verificado ✓');
      } else if (evt.status === 'failed') {
        setCurrentStep(`Falhou: ${evt.title}`);
      } else if (evt.status === 'skipped') {
        setCurrentStep('Já ativo, pulando...');
      }
    });

    return () => { isMounted = false; unsubscribe(); };
  }, []);

  const handleApply = async (preset) => {
    const isReset = preset.special === 'revert-all';
    const confirmMsg = isReset
      ? 'Reverter TODAS as otimizações ativas e restaurar o Windows ao padrão. Continuar?'
      : `Aplicar o preset "${preset.name}"? Isso ativará ${preset.tweakCount} otimização(ões).`;
    if (!window.confirm(confirmMsg)) return;

    setApplyingId(preset.id);
    setResultMsg(null);
    setErrorMsg(null);
    setCurrentStep('Iniciando...');

    try {
      const res = await window.electronAPI.invoke('preset:apply', preset.id);

      if (res.success) {
        if (isReset) {
          setResultMsg(`Todas as otimizações foram revertidas (${res.reverted?.length || 0}).`);
        } else {
          const parts = [];
          if (res.applied?.length) parts.push(`${res.applied.length} aplicada(s)`);
          if (res.skipped?.length) parts.push(`${res.skipped.length} já ativa(s)`);
          setResultMsg(`Preset "${preset.name}": ${parts.join(', ') || 'nada a fazer'}.`);
        }
      } else {
        const failedCount = res.failed?.length || 0;
        setErrorMsg(
          res.error ||
          (failedCount > 0
            ? `${failedCount} ajuste(s) falharam ao aplicar o preset.`
            : 'Falha ao aplicar o preset.')
        );
      }

      // Atualiza o estado dos presets após a operação.
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

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-slate-500 text-sm">
        <Loader2 size={16} className="animate-spin" />
        Carregando presets...
      </div>
    );
  }

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-start gap-2.5 bg-c-surface border border-c-border rounded-lg px-4 py-3 text-sm text-slate-400">
        <Zap size={18} className="text-c-secondary shrink-0 mt-0.5" />
        <span>
          Presets aplicam <span className="text-slate-200 font-medium">vários ajustes de uma vez</span>.
          Ajustes já ativos são pulados. Você pode reverter qualquer preset individualmente na aba Otimizações.
        </span>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {presets.map((preset) => {
          const Icon = ICON_MAP[preset.id] || Sparkles;
          const accent = ACCENT_CLASSES[preset.accent] || ACCENT_CLASSES.secondary;
          const state = states[preset.id];
          const isBusy = applyingId === preset.id;

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
                    <h3 className="text-slate-100 font-semibold text-base">{preset.name}</h3>
                    {state === 'applied' && (
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-c-primary/10 text-c-primary border border-c-primary/30">
                        Ativo
                      </span>
                    )}
                    {state === 'partial' && (
                      <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 border border-yellow-500/30">
                        Parcial
                      </span>
                    )}
                  </div>
                  <p className="text-slate-400 text-xs mt-2 leading-relaxed">{preset.description}</p>
                  {preset.tweakCount > 0 && (
                    <p className="text-slate-500 text-[11px] mt-2">
                      {preset.tweakCount} otimização(ões) neste preset
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
                {isBusy ? 'Aplicando...' : (preset.special === 'revert-all' ? 'Reverter Tudo' : 'Aplicar Preset')}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default PresetsView;