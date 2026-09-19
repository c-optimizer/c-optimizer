import React, { useEffect, useState } from 'react';
import { Folder, Zap, Trash, RefreshCw, Trash2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import CardOption from '../components/CardOption';
import { useLanguage } from '../context/LanguageContext';

const ICON_MAP = {
  temp: Folder,
  prefetch: Zap,
  'recycle-bin': Trash,
  'wu-cache': RefreshCw
};

const DESCRIPTION_MAP = {
  temp: 'Arquivos temporários gerados por aplicativos do sistema.',
  prefetch: 'Dados de pré-carregamento usados pelo Windows para acelerar a inicialização de apps.',
  'recycle-bin': 'Arquivos excluídos que ainda ocupam espaço em disco.',
  'wu-cache': 'Pacotes de atualização já instalados que não são mais necessários.'
};

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 ** 2);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(0)} MB`;
}

function formatDate(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  return date.toLocaleString();
}

function CleanupView() {
  const { t } = useLanguage();
  const [targets, setTargets] = useState([]);
  const [selected, setSelected] = useState({});
  const [lastCleanup, setLastCleanup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cleaning, setCleaning] = useState(false);
  const [resultSummary, setResultSummary] = useState(null);
  const [errorSummary, setErrorSummary] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadInitial() {
      try {
        const [targetList, lastRun] = await Promise.all([
          window.electronAPI.invoke('cleanup:get-targets'),
          window.electronAPI.invoke('cleanup:get-last-run')
        ]);

        if (isMounted) {
          setTargets(targetList);
          setLastCleanup(lastRun);
          setLoading(false);
        }
      } catch (error) {
        console.error('Erro ao carregar dados de limpeza:', error);
        if (isMounted) setLoading(false);
      }
    }

    loadInitial();
    return () => {
      isMounted = false;
    };
  }, []);

  const handleToggle = (id, value) => {
    setSelected((prev) => ({ ...prev, [id]: value }));
  };

  const anySelected = Object.values(selected).some(Boolean);

  const handleClean = async () => {
    const idsToClean = Object.keys(selected).filter((id) => selected[id]);
    if (idsToClean.length === 0) return;

    setCleaning(true);
    setResultSummary(null);
    setErrorSummary(null);

    try {
      const response = await window.electronAPI.invoke('cleanup:execute', idsToClean);

      if (response.success) {
        setResultSummary(response.totalFreedBytes);
        setLastCleanup(response.lastCleanupAt);
        setSelected({});
      } else {
        const firstError = Object.values(response.results || {}).find((r) => !r.success);
        setErrorSummary(firstError?.error || 'Alguns itens não puderam ser limpos.');
      }
    } catch (error) {
      setErrorSummary(error.message);
    } finally {
      setCleaning(false);
    }
  };

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between bg-c-surface border border-c-border rounded-xl px-5 py-3">
        <span className="text-sm text-slate-400">
          {t('cleanup.lastCleanup')}: <span className="text-slate-200 font-medium">{formatDate(lastCleanup) || t('cleanup.never')}</span>
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-10 justify-center">
          <Loader2 size={16} className="animate-spin" />
          Carregando alvos de limpeza...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {targets.map((target) => (
            <CardOption
              key={target.id}
              icon={ICON_MAP[target.id]}
              title={target.label}
              description={DESCRIPTION_MAP[target.id] || ''}
              tags={[]}
              enabled={!!selected[target.id]}
              onToggle={(value) => handleToggle(target.id, value)}
              variant="danger"
            />
          ))}
        </div>
      )}

      {resultSummary !== null && (
        <div className="flex items-center gap-2 text-c-primary text-sm bg-c-primary/10 border border-c-primary/30 rounded-lg px-4 py-3">
          <CheckCircle2 size={16} />
          Limpeza concluída! {formatBytes(resultSummary)} liberados.
        </div>
      )}

      {errorSummary && (
        <div className="flex items-center gap-2 text-c-danger text-sm bg-c-danger/10 border border-c-danger/30 rounded-lg px-4 py-3">
          <AlertCircle size={16} />
          {errorSummary}
        </div>
      )}

      <button
        onClick={handleClean}
        disabled={!anySelected || cleaning}
        className={`self-start flex items-center gap-2 px-5 py-3 rounded-lg font-semibold text-sm transition-colors
          ${anySelected && !cleaning
            ? 'bg-c-danger/10 border border-c-danger text-c-danger shadow-glow-danger hover:bg-c-danger/20'
            : 'bg-c-surface border border-c-border text-slate-600 cursor-not-allowed'}
        `}
      >
        {cleaning ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
        {cleaning ? 'Limpando...' : t('cleanup.cleanButton')}
      </button>
    </div>
  );
}

export default CleanupView;