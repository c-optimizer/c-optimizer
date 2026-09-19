import React, { useEffect, useState } from 'react';
import { Globe, Info, Loader2 } from 'lucide-react';
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
  return () => {
    isMounted = false;
  };
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

      <div className="bg-c-surface border border-c-border rounded-xl p-5 flex items-center gap-3">
        <Info size={16} className="text-slate-500" />
        <span className="text-sm text-slate-500">C-Optimizer v1.0.0 &middot; Electron + React + TailwindCSS</span>
      </div>
    </div>
  );
}

export default SettingsView;