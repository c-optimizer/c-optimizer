import React, { useEffect, useState } from 'react';
import {
  Search, Gamepad2, CircuitBoard, Network, ShieldOff, Gauge, Loader2, AlertCircle,
  ShieldAlert, Sparkles, Timer, MousePointer2, Maximize, HardDrive, MemoryStick, RotateCw,
  Keyboard, Radio, Bell, Users, Link2, Eye, LayoutGrid, ShieldX, Chrome, Globe, Flame,
  Zap, RadioTower // dois novos, só para desduplicar abaixo
} from 'lucide-react';
import CardOption from '../components/CardOption';
import { useLanguage } from '../context/LanguageContext';

const ICON_MAP = {
  // Gaming
  'gaming-priority': Gamepad2,
  'disable-mouse-accel': MousePointer2,
  'disable-fullscreen-opt': Maximize,
  'disable-accessibility-keys': Keyboard,

  // GPU
  'gpu-scheduling': CircuitBoard,

  // Rede
  'network-nagle': Network,
  'network-throttling': RadioTower, // antes era Network, duplicado com nagle

  // Privacidade
  'disable-telemetry': ShieldOff,
  'disable-telemetry-services': Radio,
  'disable-insider': ShieldX,
  'disable-chrome-autoupdate': Chrome,
  'disable-edge-autoupdate': Globe,
  'disable-firefox-autoupdate': Flame,

  // Performance
  'power-plan': Zap, // antes era Gauge, duplicado com background-apps
  'background-apps': Gauge,
  'visual-performance': Sparkles,
  'disable-hpet': Timer,
  'hide-action-center': Bell,
  'hide-people-icon': Users,
  'remove-shortcut-suffix': Link2,
  'taskbar-transparency': Eye,
  'explorer-compact-mode': LayoutGrid
};

const DESCRIPTION_MAP = {
  temp: 'Arquivos temporários gerados por aplicativos do sistema.',
  prefetch: 'Dados de pré-carregamento usados pelo Windows para acelerar a inicialização de apps.',
  'recycle-bin': 'Arquivos excluídos que ainda ocupam espaço em disco.',
  'wu-cache': 'Pacotes de atualização já instalados que não são mais necessários.',
  'discord-cache': 'Cache, dados de sessão e armazenamento local do Discord (estável, PTB e Canary).',
  'steam-cache': 'Cache de shaders, HTML, dumps de erro e cache HTTP da Steam.',
  'log-crash': 'Relatórios de erro e logs de falhas antigos do Windows.',
  'thumbnail-cache': 'Cache de miniaturas e ícones — reconstrói automaticamente após a limpeza.',
  'recent-docs': 'Histórico de arquivos e documentos abertos recentemente.',
  'font-cache': 'Cache de fontes do Windows, reconstruído automaticamente pelo sistema.'
};

// Agrupamento visual — mesma categoria fica junto na tela
const GROUPS = [
  { title: 'Sistema', ids: ['temp', 'prefetch', 'recycle-bin', 'wu-cache'] },
  { title: 'Aplicativos', ids: ['discord-cache', 'steam-cache'] },
  { title: 'Diagnóstico e Interface', ids: ['log-crash', 'thumbnail-cache', 'recent-docs', 'font-cache'] }
];

function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 ** 2);
  if (mb >= 1024) return `${(mb / 1024).toFixed(2)} GB`;
  return `${mb.toFixed(0)} MB`;
}

function formatDate(isoString) {
  if (!isoString) return null;
  return new Date(isoString).toLocaleString();
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
    return () => { isMounted = false; };
  }, []);

  const handleToggle = (id, value) => {
    setSelected((prev) => ({ ...prev, [id]: value }));
  };

  const anySelected = Object.values(selected).some(Boolean);

  const findTarget = (id) => targets.find((t) => t.id === id);

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
        GROUPS.map((group) => {
          const groupTargets = group.ids.map(findTarget).filter(Boolean);
          if (groupTargets.length === 0) return null;

          return (
            <div key={group.title} className="flex flex-col gap-3">
              <h3 className="text-slate-400 text-xs font-semibold uppercase tracking-wide">{group.title}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {groupTargets.map((target) => (
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
            </div>
          );
        })
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