import React, { useEffect, useState } from 'react';
import { Globe, Info, Loader2, ClipboardCopy, CheckCircle2, AlertCircle, ShieldAlert, RotateCcw } from 'lucide-react';
import ToggleSwitch from '../components/ToggleSwitch';
import { useLanguage } from '../context/LanguageContext';

const languageOptions = [
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'es-ES', label: 'Español (España)' }
];

function SettingsView() {
  const { language, setLanguage, t } = useLanguage();
  const [startup, setStartup] = useState(false);
  const [minimizeTray, setMinimizeTray] = useState(true);
  const [loading, setLoading] = useState(true);

  const [copyingLogs, setCopyingLogs] = useState(false);
  const [copyMsg, setCopyMsg] = useState(null);

  const [reverting, setReverting] = useState(false);
  const [revertMsg, setRevertMsg] = useState(null);
  const [revertError, setRevertError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadSettings() {
      try {
        const settings = await window.electronAPI.invoke('settings:get');
        if (isMounted) {
          setStartup(settings.startup);
          setMinimizeTray(settings.minimizeTray);
          setLoading(false);
        }
      } catch (error) {
        console.error('Erro ao carregar configurações:', error);
        if (isMounted) setLoading(false);
      }
    }

    loadSettings();
    return () => { isMounted = false; };
  }, []);

  const handleLanguageChange = async (code) => {
    setLanguage(code);
    await window.electronAPI.invoke('settings:set-language', code);
  };

  const handleStartupChange = async (value) => {
    setStartup(value);
    await window.electronAPI.invoke('settings:set', { startup: value });
  };

  const handleMinimizeTrayChange = async (value) => {
    setMinimizeTray(value);
    await window.electronAPI.invoke('settings:set', { minimizeTray: value });
  };

  const handleCopyLogs = async () => {
    setCopyingLogs(true);
    setCopyMsg(null);
    try {
      const result = await window.electronAPI.invoke('system:copy-logs');
      if (result.success) {
        setCopyMsg({ type: 'success', text: 'Logs copiados para a área de transferência!' });
      } else {
        setCopyMsg({ type: 'error', text: result.error || 'Não foi possível copiar os logs.' });
      }
    } catch (error) {
      setCopyMsg({ type: 'error', text: error.message });
    } finally {
      setCopyingLogs(false);
      // A mensagem some sozinha depois de alguns segundos, como um toast simples
      setTimeout(() => setCopyMsg(null), 4000);
    }
  };

  const handleRevertAll = async () => {
    const confirmed = window.confirm(
      'Isso vai desfazer TODAS as otimizações ativas atualmente, restaurando o Windows para as configurações padrão. Deseja continuar?'
    );
    if (!confirmed) return;

    setReverting(true);
    setRevertMsg(null);
    setRevertError(null);

    try {
      const result = await window.electronAPI.invoke('tweaks:revert-all');

      if (result.reverted && result.reverted.length > 0) {
        setRevertMsg(`${result.reverted.length} otimização(ões) restaurada(s) com sucesso!`);
      }

      if (!result.success) {
        const failedCount = result.failed?.length || 0;
        setRevertError(
          result.error ||
          (failedCount > 0
            ? `${failedCount} otimização(ões) não puderam ser restauradas.`
            : 'Falha ao restaurar as otimizações.')
        );
      }

      if (result.success && (!result.reverted || result.reverted.length === 0)) {
        setRevertMsg('Nenhuma otimização estava ativa no momento.');
      }
    } catch (error) {
      setRevertError(error.message);
    } finally {
      setReverting(false);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-slate-500 text-sm">
        <Loader2 size={16} className="animate-spin" />
        Carregando configurações...
      </div>
    );
  }

  return (
    <div className="p-8 flex flex-col gap-6 max-w-2xl">
      <div className="bg-c-surface border border-c-border rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-slate-200 font-semibold">
          <Globe size={16} className="text-c-secondary" />
          {t('settings.language')}
        </div>
        <div className="flex gap-2">
          {languageOptions.map((opt) => (
            <button
              key={opt.code}
              onClick={() => handleLanguageChange(opt.code)}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors
                ${language === opt.code
                  ? 'border-c-primary text-c-primary bg-c-primary/10'
                  : 'border-c-border text-slate-400 hover:text-slate-200'}
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-c-surface border border-c-border rounded-xl p-5 flex flex-col divide-y divide-c-border">
        <div className="flex items-center justify-between py-3 first:pt-0">
          <span className="text-sm text-slate-300">{t('settings.startup')}</span>
          <ToggleSwitch checked={startup} onChange={handleStartupChange} />
        </div>
        <div className="flex items-center justify-between py-3 last:pb-0">
          <span className="text-sm text-slate-300">{t('settings.minimizeTray')}</span>
          <ToggleSwitch checked={minimizeTray} onChange={handleMinimizeTrayChange} />
        </div>
      </div>

      {/* Diagnóstico: copiar logs */}
      <div className="bg-c-surface border border-c-border rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-slate-200 font-semibold">
          <ClipboardCopy size={16} className="text-c-secondary" />
          Diagnóstico
        </div>
        <p className="text-slate-500 text-xs -mt-1">
          Copie os logs recentes do aplicativo para compartilhar com o suporte caso algo não funcione como esperado.
        </p>

        {copyMsg && (
          <div
            className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${
              copyMsg.type === 'success'
                ? 'text-c-primary bg-c-primary/10 border-c-primary/30'
                : 'text-c-danger bg-c-danger/10 border-c-danger/30'
            }`}
          >
            {copyMsg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {copyMsg.text}
          </div>
        )}

        <button
          onClick={handleCopyLogs}
          disabled={copyingLogs}
          className="self-start flex items-center gap-2 px-4 py-2 rounded-lg border border-c-secondary/40 text-c-secondary text-sm font-medium hover:bg-c-secondary/10 transition-colors disabled:opacity-50"
        >
          {copyingLogs ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCopy size={14} />}
          {copyingLogs ? 'Copiando...' : 'Copiar Logs de Diagnóstico'}
        </button>
      </div>

      {/* Zona de risco: restaurar todas as otimizações */}
      <div className="bg-c-surface border border-c-danger/30 rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-c-danger font-semibold">
          <ShieldAlert size={16} />
          Zona de Emergência
        </div>
        <p className="text-slate-500 text-xs -mt-1">
          Se alguma otimização causar instabilidade, use o botão abaixo para desfazer todas de uma vez e
          restaurar o Windows às configurações padrão.
        </p>

        {revertMsg && (
          <div className="flex items-center gap-2 text-c-primary text-xs bg-c-primary/10 border border-c-primary/30 rounded-lg px-3 py-2">
            <CheckCircle2 size={14} />
            {revertMsg}
          </div>
        )}

        {revertError && (
          <div className="flex items-center gap-2 text-c-danger text-xs bg-c-danger/10 border border-c-danger/30 rounded-lg px-3 py-2">
            <AlertCircle size={14} />
            {revertError}
          </div>
        )}

        <button
          onClick={handleRevertAll}
          disabled={reverting}
          className="self-start flex items-center gap-2 px-4 py-2.5 rounded-lg bg-c-danger/10 border border-c-danger text-c-danger text-sm font-semibold shadow-glow-danger hover:bg-c-danger/20 transition-colors disabled:opacity-50"
        >
          {reverting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
          {reverting ? 'Restaurando...' : 'Restaurar Todas as Otimizações Padrão'}
        </button>
      </div>

      <div className="bg-c-surface border border-c-border rounded-xl p-5 flex items-center gap-3">
        <Info size={16} className="text-slate-500" />
        <span className="text-sm text-slate-500">C-Optimizer v1.1.0 &middot; Electron + React + TailwindCSS</span>
      </div>
    </div>
  );
}

export default SettingsView;