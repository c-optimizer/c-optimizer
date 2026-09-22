import React, { useEffect, useState } from 'react';
import { 
  Search, AppWindow, Trash2, Loader2, AlertCircle, CheckCircle2, 
  Download, Code2, Globe, Gamepad2, Video, Wrench, ShieldCheck 
} from 'lucide-react';
import CardOption from '../components/CardOption';
import { useLanguage } from '../context/LanguageContext';

// Catálogo Curado Winget
const WINGET_CATALOG = [
  { id: 'Microsoft.VCRedist.2015+.x64', name: 'Visual C++ 2015-2022 Redistributable (x64)', category: 'Runtimes', icon: Code2, description: 'Bibliotecas C++ essenciais para a maioria dos jogos e softwares.' },
  { id: 'Microsoft.DotNet.DesktopRuntime.8', name: '.NET Desktop Runtime 8.0', category: 'Runtimes', icon: Code2, description: 'Execução de aplicativos modernos em C#/.NET.' },
  { id: 'Microsoft.DirectX', name: 'DirectX End-User Runtime', category: 'Runtimes', icon: Code2, description: 'Componentes legados de DirectX para jogos.' },
  { id: 'Google.Chrome', name: 'Google Chrome', category: 'Navegadores', icon: Globe, description: 'Navegador web da Google.' },
  { id: 'Brave.Brave', name: 'Brave Browser', category: 'Navegadores', icon: Globe, description: 'Navegador focado em privacidade.' },
  { id: 'Mozilla.Firefox', name: 'Mozilla Firefox', category: 'Navegadores', icon: Globe, description: 'Navegador rápido de código aberto.' },
  { id: 'Valve.Steam', name: 'Steam', category: 'Jogos', icon: Gamepad2, description: 'Plataforma de jogos digitais.' },
  { id: 'EpicGames.EpicGamesLauncher', name: 'Epic Games Launcher', category: 'Jogos', icon: Gamepad2, description: 'Loja e gerenciador de jogos da Epic.' },
  { id: 'Discord.Discord', name: 'Discord', category: 'Jogos', icon: Gamepad2, description: 'Comunicação por voz e texto para gamers.' },
  { id: 'OBSProject.OBSStudio', name: 'OBS Studio', category: 'Mídia', icon: Video, description: 'Gravação de tela e transmissões ao vivo.' },
  { id: 'VideoLAN.VLC', name: 'VLC Media Player', category: 'Mídia', icon: Video, description: 'Reprodutor de mídia leve e universal.' },
  { id: '7zip.7zip', name: '7-Zip', category: 'Utilitários', icon: Wrench, description: 'Descompactador de arquivos leve.' },
  { id: 'Nvidia.App', name: 'NVIDIA App', category: 'Utilitários', icon: Wrench, description: 'Painel de controle e drivers NVIDIA.' }
];

const WINGET_CATEGORIES = ['Todos', 'Runtimes', 'Navegadores', 'Jogos', 'Mídia', 'Utilitários'];

function AppsView() {
  const { t } = useLanguage();
  const [activeTab, setActiveTab] = useState('install'); // 'install' | 'bloatware'

  // Estado da aba Bloatware
  const [search, setSearch] = useState('');
  const [apps, setApps] = useState([]);
  const [selected, setSelected] = useState({});
  const [loading, setLoading] = useState(true);
  const [removing, setRemoving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [failedDetails, setFailedDetails] = useState([]);
  const [successMsg, setSuccessMsg] = useState(null);

  // Estado da aba Instalar (Winget)
  const [wingetCategory, setWingetCategory] = useState('Todos');
  const [selectedWinget, setSelectedWinget] = useState([]);
  const [statusMap, setStatusMap] = useState({});
  const [isQueueRunning, setIsQueueRunning] = useState(false);

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
    if (activeTab === 'bloatware') {
      loadApps();
    }
  }, [activeTab]);

  useEffect(() => {
    // Inscreve no evento IPC de progresso do Winget usando o método .on() do preload
    const unsubscribe = window.electronAPI.on('winget:progress', (data) => {
      setStatusMap((prev) => ({
        ...prev,
        [data.appId]: { status: data.status, message: data.message }
      }));
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  // Handlers de Bloatware
  const filteredApps = apps.filter((app) => app.name.toLowerCase().includes(search.toLowerCase()));

  const handleToggleBloatware = (id, value) => {
    setSelected((prev) => ({ ...prev, [id]: value }));
  };

  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const anySelected = selectedIds.length > 0;

  const handleRemoveSelected = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = window.confirm(`Desinstalar ${selectedIds.length} aplicativo(s) selecionado(s)?`);
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
        setErrorMsg(result.error || 'Falha ao remover alguns aplicativos.');
        const detailed = failed.map((f) => ({
          name: apps.find((a) => a.id === f.id)?.name || f.id,
          error: f.error || 'Erro desconhecido.'
        }));
        setFailedDetails(detailed);
      }
    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      setRemoving(false);
    }
  };

  // Handlers de Winget (Instalação)
  const toggleSelectWinget = (appId) => {
    if (isQueueRunning) return;
    setSelectedWinget((prev) =>
      prev.includes(appId) ? prev.filter((id) => id !== appId) : [...prev, appId]
    );
  };

  const handleInstallQueue = async () => {
    if (selectedWinget.length === 0 || isQueueRunning) return;
    setIsQueueRunning(true);

    for (const appId of selectedWinget) {
      setStatusMap((prev) => ({
        ...prev,
        [appId]: { status: 'installing', message: 'Iniciando...' }
      }));
      try {
        await window.electronAPI.invoke('winget:install', appId);
      } catch (err) {
        setStatusMap((prev) => ({
          ...prev,
          [appId]: { status: 'error', message: err.message }
        }));
      }
    }
    setIsQueueRunning(false);
  };

  const filteredWinget = WINGET_CATALOG.filter(
    (app) => wingetCategory === 'Todos' || app.category === wingetCategory
  );

  return (
    <div className="p-8 flex flex-col gap-6">
      {/* Seletor de Sub-abas */}
      <div className="flex border-b border-c-border gap-6">
        <button
          onClick={() => setActiveTab('install')}
          className={`pb-3 text-sm font-semibold transition-colors relative ${
            activeTab === 'install' ? 'text-c-secondary' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Instalar Softwares & Runtimes
          {activeTab === 'install' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-c-secondary rounded-full" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('bloatware')}
          className={`pb-3 text-sm font-semibold transition-colors relative ${
            activeTab === 'bloatware' ? 'text-c-danger' : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          Remover Bloatware do Windows
          {activeTab === 'bloatware' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-c-danger rounded-full" />
          )}
        </button>
      </div>

      {/* --- ABA 1: INSTALAR SOFTWARES (WINGET) --- */}
      {activeTab === 'install' && (
        <>
          <div className="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              {WINGET_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setWingetCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    wingetCategory === cat
                      ? 'bg-c-secondary/10 border-c-secondary text-c-secondary'
                      : 'border-c-border text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            <button
              onClick={handleInstallQueue}
              disabled={selectedWinget.length === 0 || isQueueRunning}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-c-secondary text-slate-950 font-semibold text-sm hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed self-start md:self-auto"
            >
              {isQueueRunning ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Instalando...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Instalar Selecionados ({selectedWinget.length})
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredWinget.map((app) => {
              const Icon = app.icon;
              const isSelected = selectedWinget.includes(app.id);
              const appState = statusMap[app.id] || { status: 'idle', message: '' };

              return (
                <div
                  key={app.id}
                  onClick={() => toggleSelectWinget(app.id)}
                  className={`p-4 rounded-xl border flex flex-col justify-between gap-3 cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-c-surface border-c-secondary/60 shadow-lg'
                      : 'bg-c-surface/50 border-c-border hover:border-c-border/80'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-c-bg border border-c-border text-c-secondary shrink-0">
                      <Icon size={20} />
                    </div>
                    <div className="flex flex-col gap-1 overflow-hidden">
                      <h3 className="text-slate-200 font-semibold text-sm truncate">{app.name}</h3>
                      <p className="text-slate-500 text-xs line-clamp-2">{app.description}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-c-border/40 pt-3 mt-1">
                    <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-c-bg border border-c-border text-slate-400">
                      {app.category}
                    </span>

                    {appState.status === 'installing' && (
                      <span className="flex items-center gap-1.5 text-xs text-c-secondary">
                        <Loader2 size={13} className="animate-spin" />
                        Instalando...
                      </span>
                    )}
                    {appState.status === 'completed' && (
                      <span className="flex items-center gap-1 text-xs text-c-primary font-medium">
                        <CheckCircle2 size={14} />
                        Instalado
                      </span>
                    )}
                    {appState.status === 'error' && (
                      <span className="flex items-center gap-1 text-xs text-c-danger font-medium" title={appState.message}>
                        <AlertCircle size={14} />
                        Erro
                      </span>
                    )}
                    {appState.status === 'idle' && (
                      <span className={`text-xs font-medium ${isSelected ? 'text-c-secondary' : 'text-slate-500'}`}>
                        {isSelected ? 'Selecionado' : 'Selecionar'}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* --- ABA 2: REMOVER BLOATWARE --- */}
      {activeTab === 'bloatware' && (
        <>
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
              {filteredApps.map((app) => (
                <CardOption
                  key={app.id}
                  icon={AppWindow}
                  title={app.name}
                  description={app.publisher}
                  tags={[]}
                  enabled={!!selected[app.id]}
                  onToggle={(value) => handleToggleBloatware(app.id, value)}
                  variant="danger"
                />
              ))}

              {filteredApps.length === 0 && !errorMsg && (
                <p className="text-slate-500 text-sm col-span-full text-center py-10">
                  {apps.length === 0 ? 'Nenhum bloatware conhecido encontrado nesta máquina.' : t('apps.empty')}
                </p>
              )}
            </div>
          )}

          <button
            onClick={handleRemoveSelected}
            disabled={!anySelected || removing}
            className={`self-start flex items-center gap-2 px-5 py-3 rounded-lg font-semibold text-sm transition-colors ${
              anySelected && !removing
                ? 'bg-c-danger/10 border border-c-danger text-c-danger hover:bg-c-danger/20'
                : 'bg-c-surface border border-c-border text-slate-600 cursor-not-allowed'
            }`}
          >
            {removing ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
            {removing ? 'Removendo...' : `Remover Selecionados${anySelected ? ` (${selectedIds.length})` : ''}`}
          </button>
        </>
      )}
    </div>
  );
}

export default AppsView;