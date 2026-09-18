import React, { useEffect, useMemo, useState } from 'react';
import { Search, Gamepad2, CircuitBoard, Network, ShieldOff, Gauge, Loader2, AlertCircle } from 'lucide-react';
import CardOption from '../components/CardOption';
import { useLanguage } from '../context/LanguageContext';

// Mapeamento de ícone por id de tweak — os ícones não podem atravessar o IPC,
// então associamos aqui no Renderer usando o mesmo id que o Main Process envia.
const ICON_MAP = {
  'gaming-priority': Gamepad2,
  'gpu-scheduling': CircuitBoard,
  'network-nagle': Network,
  'disable-telemetry': ShieldOff,
  'power-plan': Gauge,
  'gpu-latency': CircuitBoard,
  'network-dns': Network,
  'background-apps': Gauge
};

const CATEGORIES = ['Todas', 'Gaming', 'GPU', 'Rede', 'Privacidade', 'Performance'];

function OptimizationsView() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todas');
  const [tweaks, setTweaks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState({}); // { [tweakId]: true } enquanto aplica/reverte
  const [errorByTweak, setErrorByTweak] = useState({}); // { [tweakId]: 'mensagem de erro' }

  useEffect(() => {
    let isMounted = true;

    async function loadCatalog() {
      try {
        const catalog = await window.electronAPI.invoke('tweaks:get-catalog');
        if (isMounted) {
          setTweaks(catalog);
          setLoading(false);
        }
      } catch (error) {
        console.error('Erro ao carregar catálogo de tweaks:', error);
        if (isMounted) setLoading(false);
      }
    }

    loadCatalog();
    return () => {
      isMounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    return tweaks.filter((tweak) => {
      const matchesCategory = activeCategory === 'Todas' || tweak.category === activeCategory;
      const matchesSearch = tweak.title.toLowerCase().includes(search.toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [search, activeCategory, tweaks]);

  const handleToggle = async (tweakId, nextValue) => {
    // Bloqueia múltiplos cliques no mesmo card enquanto o comando roda
    setPendingIds((prev) => ({ ...prev, [tweakId]: true }));
    setErrorByTweak((prev) => ({ ...prev, [tweakId]: null }));

    const channel = nextValue ? 'tweaks:apply' : 'tweaks:revert';

    try {
      const result = await window.electronAPI.invoke(channel, tweakId);

      if (result.success) {
        setTweaks((prev) =>
          prev.map((tw) => (tw.id === tweakId ? { ...tw, enabled: result.enabled } : tw))
        );
      } else {
        setErrorByTweak((prev) => ({ ...prev, [tweakId]: result.error || 'Falha ao aplicar o ajuste.' }));
      }
    } catch (error) {
      setErrorByTweak((prev) => ({ ...prev, [tweakId]: error.message }));
    } finally {
      setPendingIds((prev) => ({ ...prev, [tweakId]: false }));
    }
  };

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <div className="relative w-full md:w-80">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('optimizations.searchPlaceholder')}
            className="w-full bg-c-surface border border-c-border rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-c-secondary/60"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors
                ${activeCategory === cat
                  ? 'bg-c-secondary/10 border-c-secondary text-c-secondary'
                  : 'border-c-border text-slate-400 hover:text-slate-200'}
              `}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-10 justify-center">
          <Loader2 size={16} className="animate-spin" />
          Carregando catálogo de otimizações...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((tweak) => (
            <div key={tweak.id} className="flex flex-col gap-1.5">
              <CardOption
                icon={ICON_MAP[tweak.id]}
                title={tweak.title}
                description={tweak.description}
                tags={[tweak.category, ...(tweak.requiresAdmin ? ['Admin'] : [])]}
                enabled={tweak.enabled}
                onToggle={(value) => handleToggle(tweak.id, value)}
                meta={pendingIds[tweak.id] ? 'Aplicando...' : ''}
              />
              {errorByTweak[tweak.id] && (
                <div className="flex items-start gap-1.5 text-c-danger text-xs px-1">
                  <AlertCircle size={12} className="mt-0.5 shrink-0" />
                  {errorByTweak[tweak.id]}
                </div>
              )}
            </div>
          ))}

          {filtered.length === 0 && (
            <p className="text-slate-500 text-sm col-span-full text-center py-10">{t('optimizations.empty')}</p>
          )}
        </div>
      )}
    </div>
  );
}

export default OptimizationsView;