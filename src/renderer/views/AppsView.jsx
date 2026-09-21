import React, { useEffect, useState } from 'react';
import { Search, AppWindow, Trash2, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import CardOption from '../components/CardOption';
import { useLanguage } from '../context/LanguageContext';

function AppsView() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [apps, setApps] = useState([]);
  const [selected, setSelected] = useState({});
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [failedDetails, setFailedDetails] = useState([]);
  const [successMsg, setSuccessMsg] = useState(null);

  const loadApps = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.invoke('apps:list-installed');
      if (result.success) {
        setApps(result.apps);
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
    loadApps();
  }, []);

  const filtered = apps.filter((app) => app.name.toLowerCase().includes(search.toLowerCase()));

  const handleToggle = (id, value) => {
    setSelected((prev) => ({ ...prev, [id]: value }));
  };

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const anySelected = selectedIds.length > 0;

  const handleRemoveSelected = async () => {
    if (selectedIds.length === 0) return;

    const confirmed = window.confirm(
      `Desinstalar ${selectedIds.length} aplicativo(s) selecionado(s) para todos os usuários deste computador?`
    );
    if (!confirmed) return;

    setRemoving(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setFailedDetails([]);

    try {
      const result = await window.electronAPI.invoke('apps:uninstall-batch', selectedIds);

      if (result.removedIds && result.removedIds.length > 0) {
        setApps((prev) => prev.filter((app) => !result.removedIds.includes(app.id)));
        setSelected({});
        setSuccessMsg(`${result.removedIds.length} aplicativo(s) removido(s) com sucesso!`);
      }

      if (!result.success) {
        const failed = result.failed || [];
        setErrorMsg(
          result.error ||
          (failed.length > 0
            ? `${failed.length} aplicativo(s) não puderam ser removidos.`
            : 'Falha ao remover os aplicativos selecionados.')
        );

        // Mapeia o id (PackageFullName) de volta para o nome amigável do app,
        // para mostrar qual app falhou e o motivo real retornado pelo Windows.
        const detailed = failed.map((f) => {
          const appInfo = apps.find((a) => a.id === f.id);
          return {
            name: appInfo?.name || f.id,
            error: f.error || 'Motivo não informado pelo Windows.'
          };
        });
        setFailedDetails(detailed);
      }
    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="relative w-full md:w-80">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('apps.searchPlaceholder')}
          className="w-full bg-c-surface border border-c-border rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-c-secondary/60"
        />
      </div>

      {successMsg && (
        <div className="flex items-center gap-2 text-c-primary text-sm bg-c-primary/10 border border-c-primary/30 rounded-lg px-4 py-3">
          <CheckCircle2 size={16} />
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="flex flex-col gap-2 text-c-danger text-sm bg-c-danger/10 border border-c-danger/30 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} />
            {errorMsg}
          </div>
          {failedDetails.length > 0 && (
            <ul className="flex flex-col gap-1 pl-6 text-xs text-c-danger/90 list-disc">
              {failedDetails.map((detail, idx) => (
                <li key={idx}>
                  <span className="font-semibold">{detail.name}:</span> {detail.error}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-10 justify-center">
          <Loader2 size={16} className="animate-spin" />
          Verificando aplicativos instalados...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((app) => (
            <CardOption
              key={app.id}
              icon={AppWindow}
              title={app.name}
              description={app.publisher}
              tags={[]}
              enabled={!!selected[app.id]}
              onToggle={(value) => handleToggle(app.id, value)}
              variant="danger"
            />
          ))}

          {filtered.length === 0 && !errorMsg && (
            <p className="text-slate-500 text-sm col-span-full text-center py-10">
              {apps.length === 0 ? 'Nenhum bloatware conhecido encontrado nesta máquina.' : t('apps.empty')}
            </p>
          )}
        </div>
      )}

      <button
        onClick={handleRemoveSelected}
        disabled={!anySelected || removing}
        className={`self-start flex items-center gap-2 px-5 py-3 rounded-lg font-semibold text-sm transition-colors
          ${anySelected && !removing
            ? 'bg-c-danger/10 border border-c-danger text-c-danger shadow-glow-danger hover:bg-c-danger/20'
            : 'bg-c-surface border border-c-border text-slate-600 cursor-not-allowed'}
        `}
      >
        {removing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
        {removing ? 'Removendo...' : `Remover Selecionados${anySelected ? ` (${selectedIds.length})` : ''}`}
      </button>
    </div>
  );
}

export default AppsView;