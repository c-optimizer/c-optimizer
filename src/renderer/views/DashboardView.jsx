import React, { useEffect, useState } from 'react';
import { Cpu, CircuitBoard, MemoryStick, HardDrive, Monitor, Zap, Loader2 } from 'lucide-react';
import StatCard from '../components/StatCard';
import { useLanguage } from '../context/LanguageContext';

const EMPTY_STATS = {
  cpu: { percent: 0 },
  gpu: { percent: 0 },
  ram: { percent: 0, usedGB: 0, totalGB: 0 },
  storage: { percent: 0, usedGB: 0, totalGB: 0 }
};

function DashboardView() {
  const { t } = useLanguage();
  const [stats, setStats] = useState(EMPTY_STATS);
  const [staticInfo, setStaticInfo] = useState(null);
  const [optimization, setOptimization] = useState({ score: 0, activeCount: 0, total: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        const [initialStats, info, optStatus] = await Promise.all([
          window.electronAPI.invoke('system:get-stats'),
          window.electronAPI.invoke('system:get-info'),
          window.electronAPI.invoke('system:get-optimization-status')
        ]);

        if (isMounted) {
          if (!initialStats.error) setStats(initialStats);
          if (!info.error) setStaticInfo(info);
          setOptimization(optStatus);
          setLoading(false);
        }
      } catch (error) {
        console.error('Erro ao carregar dados iniciais:', error);
        if (isMounted) setLoading(false);
      }
    }

    loadInitialData();

    const unsubscribe = window.electronAPI.on('system:stats-update', (updatedStats) => {
      if (isMounted) setStats(updatedStats);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const osLabel = staticInfo
    ? `${staticInfo.os.distro} ${staticInfo.os.release} · ${staticInfo.os.arch}`
    : '—';

  const cpuLabel = staticInfo?.cpu?.model || '—';
  const gpuLabel = staticInfo?.gpu?.model || '—';
  const ramExtra = staticInfo
    ? `${stats.ram.usedGB} GB / ${staticInfo.ram.totalGB} GB`
    : `${stats.ram.usedGB} GB / ${stats.ram.totalGB} GB`;
  const storageExtra = `${stats.storage.usedGB} GB / ${stats.storage.totalGB} GB`;

  return (
    <div className="p-8 flex flex-col gap-6">
      {loading && (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Carregando telemetria do sistema...
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon={Cpu} label={t('dashboard.cpu')} value={stats.cpu.percent} unit="%" percent={stats.cpu.percent} variant="primary" extra={cpuLabel} />
        <StatCard icon={CircuitBoard} label={t('dashboard.gpu')} value={stats.gpu.percent} unit="%" percent={stats.gpu.percent} variant="secondary" extra={gpuLabel} />
        <StatCard icon={MemoryStick} label={t('dashboard.ram')} value={stats.ram.percent} unit="%" percent={stats.ram.percent} variant="primary" extra={ramExtra} />
        <StatCard icon={HardDrive} label={t('dashboard.storage')} value={stats.storage.percent} unit="%" percent={stats.storage.percent} variant="danger" extra={storageExtra} />
      </div>

      <div className="bg-c-surface border border-c-border rounded-xl p-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-c-bg border border-c-border">
          <Monitor size={18} className="text-c-secondary" />
        </div>
        <div>
          <p className="text-xs text-slate-500">{t('dashboard.os')}</p>
          <p className="text-sm text-slate-200 font-medium">{osLabel}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-c-surface border border-c-border rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-slate-100 font-semibold">{t('dashboard.statusCardTitle')}</h2>
            <p className="text-slate-500 text-sm mt-1">
              {optimization.activeCount} de {optimization.total} otimizações ativas
            </p>
          </div>
          <div className="flex items-center gap-2 mt-6">
            <div className="w-full h-2 bg-c-border rounded-full overflow-hidden">
              <div
                className="h-full bg-c-primary rounded-full transition-all duration-500"
                style={{ width: `${optimization.score}%` }}
              />
            </div>
            <span className="text-c-primary text-sm font-bold shrink-0">{optimization.score}%</span>
          </div>
        </div>

        <button className="bg-c-primary/10 border border-c-primary rounded-xl p-6 flex flex-col items-center justify-center gap-2 shadow-glow-primary hover:bg-c-primary/20 transition-colors">
          <Zap size={28} className="text-c-primary" />
          <span className="text-c-primary font-bold">{t('dashboard.optimizeCta')}</span>
          <span className="text-xs text-slate-400 text-center">{t('dashboard.optimizeCtaSub')}</span>
        </button>
      </div>
    </div>
  );
}

export default DashboardView;