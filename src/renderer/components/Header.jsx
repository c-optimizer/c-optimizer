import React, { useState, useEffect } from 'react';
import { Globe, ChevronDown, ShieldCheck, AlertTriangle, Zap } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const languageOptions = [
  { code: 'pt-BR', label: 'PT-BR' },
  { code: 'en-US', label: 'EN-US' },
  { code: 'es-ES', label: 'ES-ES' }
];

const POLL_INTERVAL_MS = 5000;

function Header({ title, subtitle, statusOk = true }) {
  const { language, setLanguage, t } = useLanguage();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeCount, setActiveCount] = useState(null);

  const handleLanguageSelect = async (code) => {
    setLanguage(code);
    setDropdownOpen(false);
    try {
      await window.electronAPI.invoke('settings:set-language', code);
    } catch (error) {
      console.error('Erro ao salvar idioma:', error);
    }
  };

  // Polling do número de tweaks ativos. Roda no Header (que sempre está
  // montado quando o usuário está logado), então o contador acompanha
  // qualquer mudança feita em outras telas (Presets, Otimizações).
  useEffect(() => {
    let isMounted = true;

    async function fetchCount() {
      try {
        const r = await window.electronAPI.invoke('system:get-optimization-status');
        if (isMounted && r && typeof r.activeCount === 'number') {
          setActiveCount(r.activeCount);
        }
      } catch { /* silencioso */ }
    }

    fetchCount();
    const id = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => { isMounted = false; clearInterval(id); };
  }, []);

  return (
    <header className="flex items-center justify-between px-8 py-5 border-b border-c-border bg-c-bg sticky top-0 z-10">
      <div>
        <h1 className="text-xl font-bold text-slate-100">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>

      <div className="flex items-center gap-3">
        {/* Contador de tweaks ativos */}
        {activeCount !== null && activeCount > 0 && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-c-border bg-c-surface text-xs font-medium text-slate-300">
            <Zap size={12} className="text-c-secondary" />
            <span>{activeCount} {t('header.activeTweaks')}</span>
          </div>
        )}

        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-medium
            ${statusOk
              ? 'border-c-primary/40 text-c-primary bg-c-primary/5'
              : 'border-c-danger/40 text-c-danger bg-c-danger/5'}
          `}
        >
          {statusOk ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}
          {statusOk ? t('header.statusProtected') : t('header.statusPending')}
        </div>

        <div className="relative">
          <button
            onClick={() => setDropdownOpen((prev) => !prev)}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-c-border bg-c-surface text-slate-300 text-sm hover:border-c-secondary/50 transition-colors"
          >
            <Globe size={14} className="text-c-secondary" />
            {language}
            <ChevronDown size={14} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-32 bg-c-surface border border-c-border rounded-lg shadow-lg overflow-hidden z-20">
              {languageOptions.map((opt) => (
                <button
                  key={opt.code}
                  onClick={() => handleLanguageSelect(opt.code)}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-c-bg transition-colors
                    ${language === opt.code ? 'text-c-primary' : 'text-slate-300'}
                  `}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

export default Header;