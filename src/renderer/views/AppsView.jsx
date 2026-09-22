import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, AppWindow, Trash2, Loader2, AlertCircle, CheckCircle2,
  Download, Package, Terminal
} from 'lucide-react';
import CardOption from '../components/CardOption';
import { useLanguage } from '../context/LanguageContext';

const CATEGORY_ORDER = ['Runtimes', 'Navegadores', 'Comunicação', 'Mídia', 'Jogos', 'Utilitários'];

function InstallTab() {
  const [wingetAvailable, setWingetAvailable] = useState(true);
  const [catalog, setCatalog] = useState([]);
  const [selected, setSelected] = useState({});
  const [loading, setLoading] = useState(true);
  const [installing, setInstalling] = useState(false);
  const [logs, setLogs] = useState([]);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = () => {};

    async function init() {
      try {
        const [check, cat] = await Promise.all([
          window.electronAPI.invoke('winget:check-installed'),
          window.electronAPI.invoke('winget:get-catalog')
        ]);
        if (isMounted) {
          setWingetAvailable(!!check.available);
          setCatalog(cat);
          setLoading(false);
        }
      } catch (error) {
        if (isMounted) {
          setErrorMsg(error.message);
          setLoading(false);
        }
      }
    }

    init();

    unsubscribe = window.electronAPI.on('winget:progress', ({ appId, line }) => {
      setLogs((prev) => {
        const next = [...prev, `[${appId}] ${line}`];
        return next.slice(-50); // mantém só as últimas 50 linhas
      });
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const grouped = useMemo(() => {
    const map = {};
    catalog.forEach((app) => {
      if (!map[app.category]) map[app.category] = [];
      map[app.category].push(app);
    });
    return map;
  }, [catalog]);

  const handleToggle = (id, value) => {
    setSelected((prev) => ({ ...prev, [id]: value }));
  };

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const anySelected = selectedIds.length > 0;

  const handleInstall = async () => {
    if (selectedIds.length === 0) return;

    setInstalling(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setLogs([]);

    try {
      const result = await window.electronAPI.invoke('winget:install', selectedIds);

      if (result.installed?.length > 0) {
        setSuccessMsg(`${result.installed.length} aplicativo(s) instalado(s) com sucesso!`);
        setSelected({});
      }

      if (!result.success) {
        const failedNames = (result.failed || [])
          .map((f) => catalog.find((a) => a.id === f.appId)?.name || f.appId)
          .join(', ');
        setErrorMsg(result.error || `Falha ao instalar: ${failedNames}`);
      }
    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      setInstalling(false);
    }
  };

  if (!wingetAvailable) {
    return (
      <div className="flex flex-col items-center gap-3 py-14 bg-c-surface border border-dashed border-c-border rounded-xl">
        <AlertCircle size={22} className="text-c-danger" />
        <p className="text-slate-300 text-sm font-medium">winget não encontrado neste sistema</p>
        <p className="text-slate-500 text-xs text-center max-w-md">
          Instale ou atualize o "Instalador de Aplicativos" pela Microsoft Store para usar este módulo.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {successMsg && (
        <div className="flex items-center gap-2 text-c-primary text-sm bg-c-primary/10 border border-c-primary/30 rounded-lg px-4 py-3">
          <CheckCircle2 size={16} />
          {successMsg}
        </div>
      )}

      {errorMsg && (
        <div className="flex items-center gap-2 text-c-danger text-sm bg-c-danger/10 border border-c-danger/30 rounded-lg px-4 py-3">
          <AlertCircle size={16} />
          {errorMsg}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-10 justify-center">
          <Loader2 size={16} className="animate-spin" />
          Carregando catálogo...
        </div>
      ) : (
        CATEGORY_ORDER.filter((cat) => grouped[cat]?.length).map((category) => (
          <div key={category} className="flex flex-col gap-3">
            <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wide">{category}</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {grouped[category].map((app) => (
                <CardOption
                  key={app.id}
                  icon={Package}
                  title={app.name}
                  description={app.id}
                  tags={[]}
                  enabled={!!selected[app.id]}
                  onToggle={(value) => handleToggle(app.id, value)}
                  variant="secondary"
                />
              ))}
            </div>
          </div>
        ))
      )}

      {logs.length > 0 && (
        <div className="bg-c-bg border border-c-border rounded-lg p-3 max-h-40 overflow-y-auto flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1">
            <Terminal size={12} />
            Log de instalação
          </div>
          {logs.map((line, idx) => (
            <p key={idx} className="text-[11px] text-slate-500 font-mono truncate">{line}</p>
          ))}
        </div>
      )}

      <button
        onClick={handleInstall}
        disabled={!anySelected || installing}
        className={`self-start flex items-center gap-2 px-5 py-3 rounded-lg font-semibold text-sm transition-colors
          ${anySelected && !installing
            ? 'bg-c-secondary/10 border border-c-secondary text-c-secondary shadow-glow-secondary hover:bg-c-secondary/20'
            : 'bg-c-surface border border-c-border text-slate-600 cursor-not-allowed'}
        `}
      >
        {installing ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
        {installing ? 'Instalando...' : `Instalar Selecionados${anySelected ? ` (${selectedIds.length})` : ''}`}
      </button>
    </div>
  );
}

function RemoveTab() {
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

        const detailed = failed.map((f) => {
          const appInfo = apps.find((a) => a.id === f.id);
          return { name: appInfo?.name || f.id, error: f.error || 'Motivo não informado pelo Windows.' };
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
    <div className="flex flex-col gap-6">
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
                <li key={idx}><span className="font-semibold">{detail.name}:</span> {detail.error}</li>
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

function AppsView() {
  const [activeTab, setActiveTab] = useState('install');

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex gap-2 border-b border-c-border pb-3">
        <button
          onClick={() => setActiveTab('install')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${activeTab === 'install'
              ? 'bg-c-secondary/10 text-c-secondary border border-c-secondary/30'
              : 'text-slate-400 hover:text-slate-200'}
          `}
        >
          <Download size={14} />
          Instalar Softwares
        </button>
        <button
          onClick={() => setActiveTab('remove')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors
            ${activeTab === 'remove'
              ? 'bg-c-danger/10 text-c-danger border border-c-danger/30'
              : 'text-slate-400 hover:text-slate-200'}
          `}
        >
          <Trash2 size={14} />
          Remover Bloatware
        </button>
      </div>

      {activeTab === 'install' ? <InstallTab /> : <RemoveTab />}
    </div>
  );
}

export default AppsView;