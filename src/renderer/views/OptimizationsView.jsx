import React, { useEffect, useMemo, useState } from 'react';
import {
  Search, Gamepad2, CircuitBoard, Network, ShieldOff, Gauge, Loader2, AlertCircle,
  ShieldAlert, Sparkles, Timer, MousePointer2, Maximize, HardDrive, MemoryStick, RotateCw, Keyboard, Bell, Users, Link2, Eye, LayoutGrid, Radio, ShieldX, Chrome, Globe, Flame
} from 'lucide-react';
import CardOption from '../components/CardOption';
import { useLanguage } from '../context/LanguageContext';

const ICON_MAP = {
  'gaming-priority': Gamepad2,
  'gpu-scheduling': CircuitBoard,
  'network-nagle': Network,
  'network-throttling': Network,
  'disable-telemetry': ShieldOff,
  'power-plan': Gauge,
  'visual-performance': Sparkles,
  'disable-hpet': Timer,
  'disable-mouse-accel': MousePointer2,
  'disable-fullscreen-opt': Maximize,
  'background-apps': Gauge,
  'disable-accessibility-keys': Keyboard,
  'disable-telemetry-services': Radio,
  'hide-action-center': Bell,
  'hide-people-icon': Users,
  'remove-shortcut-suffix': Link2,
  'taskbar-transparency': Eye,
  'explorer-compact-mode': LayoutGrid,
  'disable-insider': ShieldX,
  'disable-chrome-autoupdate': Chrome,
  'disable-edge-autoupdate': Globe,
  'disable-firefox-autoupdate': Flame
};

const CATEGORIES = ['Todas', 'Gaming', 'GPU', 'Rede', 'Privacidade', 'Performance'];

function OptimizationsView() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('Todas');
  const [tweaks, setTweaks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pendingIds, setPendingIds] = useState({});
  const [errorByTweak, setErrorByTweak] = useState({});
  const [isAdmin, setIsAdmin] = useState(true);

  // Disco
  const [volumes, setVolumes] = useState([]);
  const [optimizingDrive, setOptimizingDrive] = useState(null);
  const [diskError, setDiskError] = useState(null);
  const [diskSuccess, setDiskSuccess] = useState(null);

  // XMP/DOCP
  const [memoryProfile, setMemoryProfile] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadInitial() {
      try {
        const [catalog, adminStatus, volumesResult, memProfile] = await Promise.all([
          window.electronAPI.invoke('tweaks:get-catalog'),
          window.electronAPI.invoke('system:is-admin'),
          window.electronAPI.invoke('disk:list-volumes'),
          window.electronAPI.invoke('system:get-memory-profile')
        ]);

        if (isMounted) {
          setTweaks(catalog);
          setIsAdmin(adminStatus);
          if (volumesResult.success) setVolumes(volumesResult.volumes);
          setMemoryProfile(memProfile);
          setLoading(false);
        }
      } catch (error) {
        console.error('Erro ao carregar dados de otimização:', error);
        if (isMounted) setLoading(false);
      }
    }

    loadInitial();
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

  const hasAdminTweaksVisible = filtered.some((tw) => tw.requiresAdmin);

  const handleToggle = async (tweakId, nextValue) => {
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

  const handleOptimizeDrive = async (volume) => {
    setOptimizingDrive(volume.driveLetter);
    setDiskError(null);
    setDiskSuccess(null);
    try {
      const result = await window.electronAPI.invoke('disk:optimize', {
        driveLetter: volume.driveLetter,
        type: volume.type
      });
      if (result.success) {
        setDiskSuccess(`Unidade ${volume.driveLetter}: otimizada com sucesso!`);
      } else {
        setDiskError(result.error);
      }
    } catch (error) {
      setDiskError(error.message);
    } finally {
      setOptimizingDrive(null);
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

      {!isAdmin && hasAdminTweaksVisible && (
        <div className="flex items-start gap-2.5 bg-c-secondary/10 border border-c-secondary/30 rounded-lg px-4 py-3 text-sm text-slate-300">
          <ShieldAlert size={18} className="text-c-secondary shrink-0 mt-0.5" />
          <span>
            Alguns ajustes abaixo exigem permissão de administrador. Ao ativá-los, o Windows vai exibir uma janela de confirmação (UAC) — basta aceitar para prosseguir.
          </span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-slate-500 text-sm py-10 justify-center">
          <Loader2 size={16} className="animate-spin" />
          Carregando catálogo de otimizações...
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((tweak) => (
              <div key={tweak.id} className="flex flex-col gap-1.5">
                <CardOption
                  icon={ICON_MAP[tweak.id]}
                  title={tweak.title}
                  description={tweak.description}
                  tags={[
                    tweak.category,
                    ...(tweak.requiresAdmin && !isAdmin ? ['Requer UAC'] : []),
                    ...(tweak.requiresReboot ? ['Requer Reinício'] : [])
                  ]}
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

          {/* Card: Otimização de Disco (ação, não toggle) */}
          <div className="bg-c-surface border border-c-border rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <HardDrive size={18} className="text-c-secondary" />
              <h3 className="text-slate-200 font-semibold text-sm">Otimização de Disco</h3>
            </div>
            <p className="text-slate-500 text-xs -mt-2">
              Aplica TRIM em SSDs ou desfragmentação em HDDs. Pode levar vários minutos em HDDs grandes.
            </p>

            {diskSuccess && <p className="text-c-primary text-xs">{diskSuccess}</p>}
            {diskError && <p className="text-c-danger text-xs">{diskError}</p>}

            <div className="flex flex-col gap-2">
              {volumes.map((v) => (
                <div
                  key={v.driveLetter}
                  className="flex items-center justify-between bg-c-bg border border-c-border rounded-lg px-4 py-3"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-slate-200 text-sm font-medium">Unidade {v.driveLetter}:</span>
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-c-surface border border-c-border text-slate-400">
                      {v.type}
                    </span>
                  </div>
                  <button
                    onClick={() => handleOptimizeDrive(v)}
                    disabled={optimizingDrive === v.driveLetter}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-c-secondary/40 text-c-secondary text-xs font-medium hover:bg-c-secondary/10 transition-colors disabled:opacity-50"
                  >
                    {optimizingDrive === v.driveLetter
                      ? <Loader2 size={13} className="animate-spin" />
                      : <RotateCw size={13} />}
                    {optimizingDrive === v.driveLetter ? 'Otimizando...' : 'Otimizar'}
                  </button>
                </div>
              ))}
              {volumes.length === 0 && (
                <p className="text-slate-600 text-xs text-center py-4">Nenhuma unidade detectada.</p>
              )}
            </div>
          </div>

          {/* Card: Status XMP/DOCP (somente informativo) */}
          {memoryProfile?.supported && (
            <div className="bg-c-surface border border-c-border rounded-xl p-5 flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <MemoryStick size={18} className="text-c-secondary" />
                <h3 className="text-slate-200 font-semibold text-sm">Perfil de Memória (XMP/DOCP)</h3>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <span
                  className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                    memoryProfile.xmpActive
                      ? 'bg-c-primary/10 text-c-primary border-c-primary/30'
                      : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30'
                  }`}
                >
                  {memoryProfile.xmpActive ? 'Ativo' : 'Inativo / Modo Padrão'}
                </span>
                <span className="text-slate-500 text-xs">
                  Atual: {memoryProfile.configuredMHz} MHz &middot; Nominal: {memoryProfile.ratedMHz} MHz
                </span>
              </div>

              {(memoryProfile.motherboard?.manufacturer || memoryProfile.motherboard?.product) && (
                <p className="text-slate-500 text-xs">
                  Placa-Mãe: {memoryProfile.motherboard.manufacturer} {memoryProfile.motherboard.product}
                </p>
              )}

              {!memoryProfile.xmpActive && (
                <button
                  onClick={() => {
                    const query = encodeURIComponent(
                      `como ativar xmp bios ${memoryProfile.motherboard?.manufacturer || ''} ${memoryProfile.motherboard?.product || ''}`.trim()
                    );
                    window.electronAPI.invoke('system:open-external', `https://www.youtube.com/results?search_query=${query}`);
                  }}
                  className="self-start flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-c-secondary/40 text-c-secondary text-xs font-medium hover:bg-c-secondary/10 transition-colors"
                >
                  Como ativar na BIOS
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default OptimizationsView;