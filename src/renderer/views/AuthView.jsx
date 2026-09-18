import React, { useState } from 'react';
import { KeyRound, CheckCircle2, AlertCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

function AuthView() {
  const { t } = useLanguage();
  const [licenseKey, setLicenseKey] = useState('');
  const [validated, setValidated] = useState(false);
  const [error, setError] = useState(false);

  const handleValidate = () => {
    // FASE 3: window.electronAPI.invoke('auth:validate-license', licenseKey)
    if (licenseKey.trim().length > 0) {
      setValidated(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  return (
    <div className="p-8 flex items-center justify-center min-h-[70vh]">
      <div className="bg-c-surface border border-c-border rounded-xl p-8 w-full max-w-md flex flex-col items-center gap-5">
        <div className="p-3 rounded-full bg-c-primary/10 border border-c-primary/30">
          <KeyRound size={28} className="text-c-primary" />
        </div>

        <div className="text-center">
          <h2 className="text-lg font-bold text-slate-100">{t('auth.title')}</h2>
          <p className="text-sm text-slate-500 mt-1">{t('auth.subtitle')}</p>
        </div>

        {validated ? (
          <div className="flex items-center gap-2 text-c-primary text-sm font-medium bg-c-primary/10 border border-c-primary/30 rounded-lg px-4 py-3 w-full justify-center">
            <CheckCircle2 size={16} />
            {t('auth.success')}
          </div>
        ) : (
          <>
            <div className="w-full flex flex-col gap-1.5">
              <label className="text-xs text-slate-500">{t('auth.licenseLabel')}</label>
              <input
                type="text"
                value={licenseKey}
                onChange={(e) => {
                  setLicenseKey(e.target.value);
                  if (error) setError(false);
                }}
                placeholder={t('auth.licensePlaceholder')}
                className={`w-full bg-c-bg border rounded-lg px-3 py-2.5 text-sm text-slate-200 tracking-wider placeholder:text-slate-600 focus:outline-none
                  ${error ? 'border-c-danger focus:border-c-danger' : 'border-c-border focus:border-c-primary/60'}
                `}
              />
            </div>

            {error && (
              <div className="flex items-center gap-2 text-c-danger text-xs w-full">
                <AlertCircle size={14} />
                {t('auth.invalid')}
              </div>
            )}

            <button
              onClick={handleValidate}
              className="w-full bg-c-primary/10 border border-c-primary text-c-primary font-semibold text-sm rounded-lg py-2.5 shadow-glow-primary hover:bg-c-primary/20 transition-colors"
            >
              {t('auth.validate')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default AuthView;