import React, { useEffect, useMemo, useState } from 'react';
import {
  Shield,
  ShieldCheck,
  PlusCircle,
  Loader2,
  AlertCircle,
  History,
  Clock,
  PackageCheck,
  RefreshCw,
  Wrench,
  Sparkles,
  Power
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

function formatDate(isoString) {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString();
}

function formatRelative(isoString) {
  if (!isoString) return null;
  const diffMs = Date.now() - new Date(isoString).getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  if (diffHours < 1) return 'Há poucos minutos';
  if (diffHours < 24) return `Há ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Há ${diffDays} dia${diffDays > 1 ? 's' : ''}`;
}

const TYPE_STYLE = {
  'Ponto Manual': { icon: Wrench, color: 'text-c-secondary', bg: 'bg-c-secondary/10', ring: 'border-c-secondary/30' },
  'Instalação de Aplicativo': { icon: PackageCheck, color: 'text-c-primary', bg: 'bg-c-primary/10', ring: 'border-c-primary/30' },
  'Remoção de Aplicativo': { icon: PackageCheck, color: 'text-c-danger', bg: 'bg-c-danger/10', ring: 'border-c-danger/30' },
  'Atualização do Windows': { icon: RefreshCw, color: 'text-c-secondary', bg: 'bg-c-secondary/10', ring: 'border-c-secondary/30' },
  'Restauração Anterior': { icon: History, color: 'text-slate-400', bg: 'bg-slate-500/10', ring: 'border-slate-500/30' },
  'Automático': { icon: RefreshCw, color: 'text-slate-400', bg: 'bg-slate-500/10', ring: 'border-slate-500/30' }
};

function getTypeStyle(type) {
  return TYPE_STYLE[type] || TYPE_STYLE['Automático'];
}

function PointSkeleton() {
  return (
    <div className="flex items-center gap-3 bg-c-surface border border-c-border rounded-xl px-5 py-4 animate-pulse">
      <div className="w-9 h-9 rounded-lg bg-c-border shrink-0" />
      <div className="flex-1 flex flex-col gap-2">
        <div className="h-3.5 w-1/3 bg-c-border rounded" />
        <div className="h-2.5 w-1/4 bg-c-border rounded" />
      </div>
    </div>
  );
}

function RestoreView() {
  const { t } = useLanguage();
  const [points, setPoints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [enabling, setEnabling] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);
  const [protectionAvailable, setProtectionAvailable] = useState(true);

  const loadPoints = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.invoke('restore:list-points');
      if (result.success) {
        setPoints(result.points);
        setProtectionAvailable(true);
        setErrorMsg(null);
      } else {
        setProtectionAvailable(false);
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

  const handleEnableProtection = async () => {
    setEnabling(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const result = await window.electronAPI.invoke('restore:enable-protection');
      if (result.success) {
        setSuccessMsg('Proteção do sistema ativada com sucesso!');
        await loadPoints();
      } else {
        setErrorMsg(result.error || 'Não foi possível ativar a Proteção do Sistema.');
      }
    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      setEnabling(false);
    }
  };

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

  const lastPoint = useMemo(() => (points.length > 0 ? points[0] : null), [points]);

  return (
    <div className="p-8 flex flex-col gap-6">
      {/* Cards de resumo */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-c-surface border border-c-secondary/30 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-sm font-medium">Total de Backups</span>
            <History size={18} className="text-c-secondary" />
          </div>
          <span className="text-2xl font-bold text-c-secondary">{loading ? '—' : points.length}</span>
        </div>

        <div className="bg-c-surface border border-c-primary/30 rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-sm font-medium">Último Backup</span>
            <Clock size={18} className="text-c-primary" />
          </div>
          <span className="text-lg font-bold text-c-primary truncate">
            {loading ? '—' : lastPoint ? formatRelative(lastPoint.date) || '—' : 'Nenhum'}
          </span>
          {lastPoint && <span className="text-xs text-slate-500 truncate">{lastPoint.description}</span>}
        </div>

        <div
          className={`bg-c-surface border rounded-xl p-4 flex flex-col gap-3 ${
            protectionAvailable ? 'border-c-primary/30' : 'border-c-danger/30'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-sm font-medium">Proteção do Sistema</span>
            <Shield size={18} className={protectionAvailable ? 'text-c-primary' : 'text-c-danger'} />
          </div>
          <span className={`text-lg font-bold ${protectionAvailable ? 'text-c-primary' : 'text-c-danger'}`}>
            {loading ? '—' : protectionAvailable ? 'Ativa' : 'Indisponível'}
          </span>
        </div>
      </div>

      {/* Hero card de criação de backup */}
      <div className="relative overflow-hidden bg-c-surface border border-c-secondary/30 rounded-xl p-8 flex flex-col items-center gap-4 text-center">
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background: 'radial-gradient(circle at 50% 0%, rgba(0, 210, 255, 0.15), transparent 60%)'
          }}
        />

        <div className="relative p-4 rounded-full bg-c-secondary/10 border border-c-secondary/30 shadow-glow-secondary">
          <ShieldCheck size={30} className="text-c-secondary" />
        </div>

        <div className="relative">
          <h2 className="text-slate-100 font-bold text-lg flex items-center justify-center gap-2">
            Backup de Segurança do Sistema
            <Sparkles size={16} className="text-c-secondary" />
          </h2>
          <p className="text-slate-500 text-sm mt-2 max-w-lg mx-auto leading-relaxed">
            Crie um ponto de restauração antes de aplicar otimizações ou limpezas. Isso garante que você sempre
            possa reverter o Windows para este estado usando as ferramentas nativas do sistema, se necessário.
          </p>
        </div>

        <button
          onClick={handleCreate}
          disabled={creating || !protectionAvailable}
          className="relative mt-2 flex items-center gap-2 px-6 py-3 rounded-lg bg-c-secondary/10 border border-c-secondary text-c-secondary text-sm font-semibold shadow-glow-secondary hover:bg-c-secondary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="flex items-center justify-between gap-2 text-c-danger text-sm bg-c-danger/10 border border-c-danger/30 rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            <span>{errorMsg}</span>
          </div>
          {!protectionAvailable && (
            <button
              onClick={handleEnableProtection}
              disabled={enabling}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-c-danger/20 border border-c-danger/40 text-c-danger hover:bg-c-danger/30 text-xs font-semibold transition-all shrink-0 disabled:opacity-50"
            >
              {enabling ? <Loader2 size={13} className="animate-spin" /> : <Power size={13} />}
              {enabling ? 'Ativando...' : 'Ativar Proteção'}
            </button>
          )}
        </div>
      )}

      {/* Histórico de pontos */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <History size={15} className="text-slate-500" />
          <h3 className="text-slate-300 text-sm font-semibold">Histórico de Backups</h3>
          {!loading && points.length > 0 && (
            <span className="text-xs text-slate-600 bg-c-surface border border-c-border px-2 py-0.5 rounded-full">
              {points.length}
            </span>
          )}
        </div>

        {loading ? (
          <div className="flex flex-col gap-3">
            <PointSkeleton />
            <PointSkeleton />
            <PointSkeleton />
          </div>
        ) : points.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-14 bg-c-surface border border-dashed border-c-border rounded-xl">
            <div className="p-3 rounded-full bg-c-bg border border-c-border">
              <Shield size={22} className="text-slate-600" />
            </div>
            <p className="text-slate-500 text-sm">Nenhum ponto de restauração encontrado ainda.</p>
            <p className="text-slate-600 text-xs">Crie o primeiro backup usando o botão acima.</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {points.map((point) => {
              const style = getTypeStyle(point.type);
              const Icon = style.icon;

              return (
                <div
                  key={point.id}
                  className={`group flex items-center gap-3 bg-c-surface border ${style.ring} rounded-xl px-5 py-4 hover:bg-c-bg/40 transition-colors`}
                >
                  <div className={`p-2.5 rounded-lg ${style.bg} border ${style.ring} shrink-0`}>
                    <Icon size={17} className={style.color} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 font-medium truncate">{point.description}</p>
                    <p className="text-xs text-slate-500">{formatDate(point.date)}</p>
                  </div>

                  <span className={`text-[10px] uppercase tracking-wide px-2.5 py-1 rounded-full ${style.bg} ${style.color} font-medium shrink-0`}>
                    {point.type}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default RestoreView;