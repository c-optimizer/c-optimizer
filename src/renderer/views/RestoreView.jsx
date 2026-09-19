import React, { useEffect, useState } from 'react';
import { Shield, PlusCircle, Loader2, AlertCircle, ShieldCheck } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString();
}

function RestoreView() {
  const { t } = useLanguage();
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  const loadPoints = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.invoke('restore:list-points');
      if (result.success) {
        setPoints(result.points);
        setErrorMsg(null);
      } else {
        setErrorMsg(result.error);
      }
    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPoints();
  }, []);

  const handleCreate = async () => {
    setCreating(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const result = await window.electronAPI.invoke('restore:create-point', 'Backup de Segurança - C-Optimizer');
      if (result.success) {
        setSuccessMsg('Ponto de restauração criado com sucesso!');
        await loadPoints();
      } else {
        setErrorMsg(result.error);
      }
    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="bg-c-surface border border-c-border rounded-xl p-6 flex flex-col items-center gap-3 text-center">
        <div className="p-3 rounded-full bg-c-secondary/10 border border-c-secondary/30">
          <ShieldCheck size={26} className="text-c-secondary" />
        </div>
        <div>
          <h2 className="text-slate-100 font-semibold">Backup de Segurança do Sistema</h2>
          <p className="text-slate-500 text-sm mt-1 max-w-md">
            Crie um ponto de restauração antes de aplicar otimizações ou limpezas, garantindo que você sempre possa
            reverter o Windows para este estado usando as ferramentas nativas do sistema, se necessário.
          </p>
        </div>

        <button
          onClick={handleCreate}
          disabled={creating}
          className="mt-2 flex items-center gap-2 px-5 py-2.5 rounded-lg bg-c-secondary/10 border border-c-secondary text-c-secondary text-sm font-semibold hover:bg-c-secondary/20 transition-colors disabled:opacity-50"
        >
          {creating ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />}
          {creating ? 'Criando backup...' : t('restore.createPoint')}
        </button>
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 text-c-primary text-sm bg-c-primary/10 border border-c-primary/30 rounded-lg px-4 py-3">
          <ShieldCheck size={16} />
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 text-c-danger text-sm bg-c-danger/10 border border-c-danger/30 rounded-lg px-4 py-3">
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      )}

      <div>
        <h3 className="text-slate-300 text-sm font-medium mb-3">Histórico de Backups Criados</h3>

        {loading ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-10 justify-center">
            <Loader2 size={16} className="animate-spin" />
            Carregando pontos de restauração...
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {points.map((point) => (
              <div
                key={point.id}
                className="flex items-center gap-3 bg-c-surface border border-c-border rounded-xl px-5 py-4"
              >
                <div className="p-2 rounded-lg bg-c-bg border border-c-border">
                  <Shield size={18} className="text-c-secondary" />
                </div>
                <div>
                  <p className="text-sm text-slate-200 font-medium">{point.description}</p>
                  <p className="text-xs text-slate-500">{formatDate(point.date)} &middot; {point.type}</p>
                </div>
              </div>
            ))}

            {points.length === 0 && !errorMsg && (
              <p className="text-slate-500 text-sm text-center py-6">Nenhum ponto de restauração encontrado ainda.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default RestoreView;