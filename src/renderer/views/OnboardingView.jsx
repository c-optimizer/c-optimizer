import React, { useEffect, useState } from 'react';
import {
  Rocket, Gamepad2, ShieldCheck, Sparkles, Cpu, CircuitBoard,
  MemoryStick, Monitor, Loader2, CheckCircle2, AlertCircle,
  ChevronRight, SkipForward, ArrowRight, Zap, Globe
} from 'lucide-react';

const PROFILES = [
  {
    id: 'gaming',
    icon: Gamepad2,
    accent: 'primary',
    namePt: 'Gaming',
    nameEn: 'Gaming',
    nameEs: 'Gaming',
    descPt: 'Máxima performance em jogos: baixa latência, prioridade de CPU, resposta do mouse.',
    descEn: 'Maximum gaming performance: low latency, CPU priority, mouse responsiveness.',
    descEs: 'Máximo rendimiento en juegos: baja latencia, prioridad de CPU, respuesta del mouse.',
  },
  {
    id: 'privacy',
    icon: ShieldCheck,
    accent: 'secondary',
    namePt: 'Privacidade',
    nameEn: 'Privacy',
    nameEs: 'Privacidad',
    descPt: 'Bloqueia telemetria, rastreamento, localização e coleta de dados.',
    descEn: 'Blocks telemetry, tracking, location and data collection.',
    descEs: 'Bloquea telemetría, rastreo, ubicación y recolección de datos.',
  },
  {
    id: 'minimalist',
    icon: Sparkles,
    accent: 'secondary',
    namePt: 'Minimalista',
    nameEn: 'Minimalist',
    nameEs: 'Minimalista',
    descPt: 'Remove elementos visuais desnecessários, deixando o Windows mais leve.',
    descEn: 'Removes unnecessary visual elements, making Windows lighter.',
    descEs: 'Elimina elementos visuales innecesarios, haciendo Windows más ligero.',
  },
];

const LANGUAGES = [
  { code: 'pt-BR', label: 'Português', short: 'PT' },
  { code: 'en-US', label: 'English', short: 'EN' },
  { code: 'es-ES', label: 'Español', short: 'ES' },
];

function OnboardingView({ onFinish }) {
  const [step, setStep] = useState('welcome');
  const [language, setLanguage] = useState('pt-BR');
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [hardware, setHardware] = useState(null);
  const [applyProgress, setApplyProgress] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);
  const [createRestorePoint, setCreateRestorePoint] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const saved = await window.electronAPI.invoke('settings:get-language');
        if (saved) setLanguage(saved);
      } catch { /* usa default */ }
    })();
  }, []);

  const handleChangeLanguage = async (code) => {
    setLanguage(code);
    try { await window.electronAPI.invoke('settings:set-language', code); } catch {}
  };

  const handleGoToHardware = async () => {
    setStep('hardware');
    try {
      const [info] = await Promise.all([
        window.electronAPI.invoke('system:get-info'),
      ]);
      setHardware({ info });
    } catch (err) {
      setErrorMsg(err.message);
    }
    setTimeout(() => setStep('profile'), 2200);
  };

  const handleConfirm = () => setStep('confirm');

  const handleApply = async () => {
    if (!selectedProfile) {
      await handleFinish({ skipped: true });
      return;
    }

    setStep('applying');
    setErrorMsg(null);

    try {
      if (createRestorePoint) {
        setApplyProgress({ step: 'restore', text: 'Criando ponto de restauração...' });
        try {
          await window.electronAPI.invoke('restore:create-point', 'Antes do onboarding - C-Optimizer');
        } catch { /* segue mesmo se falhar */ }
      }

      setApplyProgress({ step: 'preset', text: 'Aplicando preset...' });
      const result = await window.electronAPI.invoke('preset:apply', selectedProfile);

      // CHECAGEM DE ERRO: antes o código ignorava isso e o usuário podia
      // ficar em loop sem saber por quê. Agora reporta se falhar.
      await handleFinish({
        chosenProfile: selectedProfile,
        applied: result?.success === true,
        skipped: false,
      });
    } catch (err) {
      setErrorMsg(err.message);
      setStep('confirm');
    }
  };

  // CHECAGEM DE ERRO: verifica se onboarding:complete retornou sucesso.
  // Se não retornou, mostra erro e não chama onFinish() — evita loop.
  const handleFinish = async (payload) => {
    try {
      const result = await window.electronAPI.invoke('onboarding:complete', payload);
      if (!result?.success) {
        setErrorMsg(
          result?.error
            ? `Falha ao salvar configuração: ${result.error}`
            : 'Não foi possível salvar a conclusão do onboarding. Tente novamente.'
        );
        setStep('confirm');
        return;
      }
      setStep('done');
      setTimeout(() => onFinish(), 1800);
    } catch (err) {
      setErrorMsg(`Falha ao salvar configuração: ${err.message}`);
      setStep('confirm');
    }
  };

  const handleSkipAll = () => handleFinish({ skipped: true });

  const handleSkipStep = () => handleFinish({ skipped: true });

  const L = (pt, en, es) => language === 'en-US' ? en : language === 'es-ES' ? es : pt;

  return (
    <div className="h-screen w-screen bg-c-bg flex flex-col overflow-hidden">
      <div className="flex items-center justify-between px-8 py-5 border-b border-c-border bg-c-bg">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-c-primary/10 border border-c-primary/30">
            <Zap size={20} className="text-c-primary" />
          </div>
          <span className="text-lg font-bold tracking-wide text-slate-100">
            C-<span className="text-c-primary">OPTIMIZER</span>
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Globe size={14} className="text-c-secondary mr-1" />
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleChangeLanguage(lang.code)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                language === lang.code
                  ? 'bg-c-secondary/10 text-c-secondary border border-c-secondary/30'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {lang.short}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 overflow-y-auto">
        <div className="max-w-2xl w-full flex flex-col gap-6">

          {errorMsg && (
            <div className="flex items-start gap-2 text-c-danger text-sm bg-c-danger/10 border border-c-danger/30 rounded-lg px-4 py-3">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              {errorMsg}
            </div>
          )}

          {step === 'welcome' && (
            <>
              <div className="flex flex-col items-center text-center gap-4">
                <div className="p-5 rounded-full bg-c-primary/10 border border-c-primary/30 shadow-glow-primary">
                  <Rocket size={40} className="text-c-primary" />
                </div>
                <h1 className="text-2xl font-bold text-slate-100">
                  {L('Bem-vindo ao C-Optimizer', 'Welcome to C-Optimizer', 'Bienvenido a C-Optimizer')}
                </h1>
                <p className="text-slate-400 text-sm max-w-md leading-relaxed">
                  {L(
                    'Vamos configurar seu PC em menos de 1 minuto. Você poderá alterar tudo depois nas abas Otimizações e Presets.',
                    'Let\'s set up your PC in under 1 minute. You can change everything later in the Optimizations and Presets tabs.',
                    'Configuraremos tu PC en menos de 1 minuto. Podrás cambiar todo más tarde en las pestañas Optimizaciones y Presets.'
                  )}
                </p>
              </div>

              <button
                onClick={handleGoToHardware}
                className="self-center flex items-center gap-2 px-6 py-3 rounded-lg bg-c-primary/10 border border-c-primary text-c-primary text-sm font-semibold shadow-glow-primary hover:bg-c-primary/20 transition-all"
              >
                {L('Começar', 'Get started', 'Comenzar')}
                <ArrowRight size={16} />
              </button>

              <button
                onClick={handleSkipAll}
                className="self-center text-slate-500 text-xs hover:text-slate-300 transition-colors"
              >
                {L('Pular configuração inicial', 'Skip initial setup', 'Omitir configuración inicial')}
              </button>
            </>
          )}

          {step === 'hardware' && (
            <div className="flex flex-col gap-6">
              <div className="flex flex-col items-center gap-3">
                <div className="p-4 rounded-full bg-c-secondary/10 border border-c-secondary/30">
                  <Loader2 size={28} className="text-c-secondary animate-spin" />
                </div>
                <h2 className="text-xl font-bold text-slate-100">
                  {L('Analisando seu PC...', 'Analyzing your PC...', 'Analizando tu PC...')}
                </h2>
              </div>

              {hardware && (
                <div className="grid grid-cols-2 gap-3">
                  <HardwareCard icon={Cpu} label={L('Processador', 'Processor', 'Procesador')} value={hardware.info?.cpu?.model} />
                  <HardwareCard icon={CircuitBoard} label={L('Placa de Vídeo', 'Graphics Card', 'Tarjeta Gráfica')} value={hardware.info?.gpu?.model} />
                  <HardwareCard icon={MemoryStick} label={L('Memória RAM', 'RAM Memory', 'Memoria RAM')} value={hardware.info?.ram?.totalGB ? `${hardware.info.ram.totalGB} GB` : null} />
                  <HardwareCard icon={Monitor} label={L('Sistema', 'System', 'Sistema')} value={hardware.info?.os ? `${hardware.info.os.distro} ${hardware.info.os.release}` : null} />
                </div>
              )}
            </div>
          )}

          {step === 'profile' && (
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <h2 className="text-xl font-bold text-slate-100">
                  {L('Escolha seu perfil', 'Choose your profile', 'Elige tu perfil')}
                </h2>
                <p className="text-slate-500 text-sm mt-1">
                  {L(
                    'Escolha o preset que melhor se adapta ao seu uso. Você pode mudar depois.',
                    'Choose the preset that best fits your usage. You can change later.',
                    'Elige el preset que mejor se adapte a tu uso. Puedes cambiarlo luego.'
                  )}
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {PROFILES.map((p) => {
                  const Icon = p.icon;
                  const isSelected = selectedProfile === p.id;
                  const name = language === 'en-US' ? p.nameEn : language === 'es-ES' ? p.nameEs : p.namePt;
                  const desc = language === 'en-US' ? p.descEn : language === 'es-ES' ? p.descEs : p.descPt;
                  return (
                    <button
                      key={p.id}
                      onClick={() => setSelectedProfile(p.id)}
                      className={`text-left flex items-start gap-4 p-4 rounded-xl border transition-all ${
                        isSelected
                          ? 'bg-c-primary/10 border-c-primary shadow-glow-primary'
                          : 'bg-c-surface border-c-border hover:border-slate-600'
                      }`}
                    >
                      <div className={`p-2.5 rounded-lg ${isSelected ? 'bg-c-primary/20' : 'bg-c-bg'} border ${isSelected ? 'border-c-primary/40' : 'border-c-border'} shrink-0`}>
                        <Icon size={20} className={isSelected ? 'text-c-primary' : 'text-slate-400'} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className={`font-semibold text-sm ${isSelected ? 'text-c-primary' : 'text-slate-200'}`}>
                            {name}
                          </span>
                        </div>
                        <p className="text-slate-400 text-xs mt-1 leading-relaxed">{desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between mt-2">
                <button
                  onClick={handleSkipStep}
                  className="flex items-center gap-1 text-slate-500 text-xs hover:text-slate-300 transition-colors"
                >
                  <SkipForward size={12} />
                  {L('Pular esta etapa', 'Skip this step', 'Omitir este paso')}
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={!selectedProfile}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-c-primary/10 border border-c-primary text-c-primary text-sm font-semibold hover:bg-c-primary/20 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {L('Continuar', 'Continue', 'Continuar')}
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

          {step === 'confirm' && (
            <div className="flex flex-col gap-5">
              <div className="text-center">
                <div className="inline-flex p-3 rounded-full bg-c-primary/10 border border-c-primary/30 mb-3">
                  <CheckCircle2 size={28} className="text-c-primary" />
                </div>
                <h2 className="text-xl font-bold text-slate-100">
                  {L('Tudo pronto para aplicar', 'Ready to apply', 'Listo para aplicar')}
                </h2>
              </div>

              <div className="flex items-start gap-3 bg-c-surface border border-c-border rounded-xl p-4">
                <input
                  type="checkbox"
                  checked={createRestorePoint}
                  onChange={(e) => setCreateRestorePoint(e.target.checked)}
                  className="mt-0.5 accent-c-primary"
                  id="create-rp"
                />
                <label htmlFor="create-rp" className="flex-1 cursor-pointer">
                  <span className="text-slate-200 text-sm font-medium">
                    {L('Criar ponto de restauração antes de aplicar', 'Create restore point before applying', 'Crear punto de restauración antes de aplicar')}
                  </span>
                  <p className="text-slate-500 text-xs mt-0.5">
                    {L(
                      'Recomendado. Permite reverter tudo com um clique se algo não funcionar bem.',
                      'Recommended. Lets you revert everything with one click if something goes wrong.',
                      'Recomendado. Permite revertir todo con un clic si algo sale mal.'
                    )}
                  </p>
                </label>
              </div>

              <button
                onClick={handleApply}
                className="flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-c-primary/10 border border-c-primary text-c-primary text-sm font-semibold shadow-glow-primary hover:bg-c-primary/20 transition-all"
              >
                <Zap size={16} />
                {L('Aplicar configuração', 'Apply configuration', 'Aplicar configuración')}
              </button>
            </div>
          )}

          {step === 'applying' && (
            <div className="flex flex-col items-center gap-5 text-center">
              <div className="p-5 rounded-full bg-c-primary/10 border border-c-primary/30">
                <Loader2 size={32} className="text-c-primary animate-spin" />
              </div>
              <h2 className="text-xl font-bold text-slate-100">
                {L('Aplicando...', 'Applying...', 'Aplicando...')}
              </h2>
              {applyProgress && (
                <p className="text-slate-400 text-sm">{applyProgress.text}</p>
              )}
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center gap-4 text-center">
              <div className="p-5 rounded-full bg-c-primary/10 border border-c-primary/30 shadow-glow-primary">
                <CheckCircle2 size={40} className="text-c-primary" />
              </div>
              <h2 className="text-2xl font-bold text-slate-100">
                {L('Tudo pronto!', 'All set!', '¡Todo listo!')}
              </h2>
              <p className="text-slate-400 text-sm max-w-md">
                {L(
                  'Você pode ajustar mais detalhes nas abas Otimizações, Presets e Drivers.',
                  'You can fine-tune more details in the Optimizations, Presets and Drivers tabs.',
                  'Puedes ajustar más detalles en las pestañas Optimizaciones, Presets y Drivers.'
                )}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HardwareCard({ icon: Icon, label, value }) {
  return (
    <div className="bg-c-surface border border-c-border rounded-lg p-3 flex items-center gap-3">
      <div className="p-2 rounded-lg bg-c-bg border border-c-border shrink-0">
        <Icon size={14} className="text-c-secondary" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-slate-500">{label}</p>
        <p className="text-slate-200 text-xs font-medium truncate">{value || '—'}</p>
      </div>
    </div>
  );
}

export default OnboardingView;