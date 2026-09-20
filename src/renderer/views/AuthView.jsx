import React, { useEffect, useState } from 'react';
import { KeyRound, CheckCircle2, AlertCircle, Loader2, LogOut, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

/**
 * Formata o texto digitado inserindo hífens automaticamente a cada 4
 * caracteres, no padrão COPT-XXXX-XXXX-YYYY, enquanto o usuário digita.
 */
function autoFormatInput(value) {
  const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  const groups = [];
  for (let i = 0; i < cleaned.length && i < 16; i += 4) {
    groups.push(cleaned.slice(i, i + 4));
  }
  return groups.join('-');
}

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString();
}

function AuthView() {
  const { t } = useLanguage();
  const [licenseKey, setLicenseKey] = useState('');
  const [validating, setValidating] = useState(false);
  const [loadingStored, setLoadingStored] = useState(true);
  const [storedLicense, setStoredLicense] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadStoredLicense() {
      try {
        const license = await window.electronAPI.invoke('auth:get-stored-license');
        if (isMounted && license?.key) {
          setStoredLicense(license);
        }
      } catch (err) {
        console.error('Erro ao verificar licença salva:', err);
      } finally {
        if (isMounted) setLoadingStored(false);
      }
    }

    loadStoredLicense();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleInputChange = (e) => {
    setLicenseKey(autoFormatInput(e.target.value));
    if (error) setError(null);
  };

  const handleValidate = async () => {
    if (!licenseKey.trim()) {
      setError('Digite uma chave de licença.');
      return;
    }

    setValidating(true);
    setError(null);

    try {
      const result = await window.electronAPI.invoke('auth:validate-license', licenseKey);
      if (result.success) {
        setStoredLicense({ key: result.key, validatedAt: new Date().toISOString() });
      } else {
        setError(result.error);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setValidating(false);
    }
  };

  const handleLogout = async () => {
    try {
      await window.electronAPI.invoke('auth:logout');
      setStoredLicense(null);
      setLicenseKey('');
    } catch (err) {
      console.error('Erro ao sair da licença:', err);
    }
  };

  if (loadingStored) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[70vh]">
        <Loader2 size={20} className="animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="p-8 flex items-center justify-center min-h-[70vh]">
      <div className="bg-c-surface border border-c-border rounded-xl p-8 w-full max-w-md flex flex-col items-center gap-5">
        <div
          className={`p-3 rounded-full border ${
            storedLicense ? 'bg-c-primary/10 border-c-primary/30' : 'bg-c-secondary/10 border-c-secondary/30'
          }`}
        >
          {storedLicense ? (
            <ShieldCheck size={28} className="text-c-primary" />
          ) : (
            <KeyRound size={28} className="text-c-secondary" />
          )}
        </div>

        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-100">{t('auth.title')}</h2>
          <p className="text-sm text-slate-500 mt-1">{t('auth.subtitle')}</p>
        </div>

        {storedLicense ? (
          <>
            <div className="w-full flex flex-col gap-3 bg-c-bg border border-c-primary/30 rounded-lg px-4 py-4">
              <div className="flex items-center gap-2 text-c-primary text-sm font-medium">
                <CheckCircle2 size={16} />
                Licença ativa
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-slate-500">Chave:</span>
                <span className="text-slate-300 font-mono tracking-wide">{storedLicense.key}</span>
              </div>
              <div className="flex flex-col gap-1 text-xs">
                <span className="text-slate-500">Ativada em:</span>
                <span className="text-slate-300">{formatDate(storedLicense.validatedAt)}</span>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 border border-c-danger/40 text-c-danger font-semibold text-sm rounded-lg py-2.5 hover:bg-c-danger/10 transition-colors"
            >
              <LogOut size={16} />
              {t('auth.logout')}
            </button>
          </>
        ) : (
          <>
            <div className="w-full flex flex-col gap-1.5">
              <label className="text-xs text-slate-500">{t('auth.licenseLabel')}</label>
              <input
                type="text"
                value={licenseKey}
                onChange={handleInputChange}
                placeholder={t('auth.licensePlaceholder')}
                maxLength={19} // COPT-XXXX-XXXX-YYYY = 19 caracteres com hífens
                className={`w-full bg-c-bg border rounded-lg px-3 py-2.5 text-sm text-slate-200 font-mono tracking-wider placeholder:text-slate-600 placeholder:font-sans focus:outline-none
                  ${error ? 'border-c-danger focus:border-c-danger' : 'border-c-border focus:border-c-primary/60'}
                `}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-c-danger text-xs w-full">
                <AlertCircle size={14} />
                {error}
              </div>
            )}

            <button
              onClick={handleValidate}
              disabled={validating}
              className="w-full flex items-center justify-center gap-2 bg-c-primary/10 border border-c-primary text-c-primary font-semibold text-sm rounded-lg py-2.5 shadow-glow-primary hover:bg-c-primary/20 transition-colors disabled:opacity-50"
            >
              {validating ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              {validating ? 'Validando...' : t('auth.validate')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default AuthView;