import React, { useEffect, useState } from 'react';
import {
  Wifi, Loader2, CheckCircle2, AlertCircle, Zap, RotateCcw,
  Activity, Globe, ChevronRight, Trophy
} from 'lucide-react';

function NetworkView() {
  const [adapters, setAdapters] = useState([]);
  const [selectedAdapter, setSelectedAdapter] = useState(null);
  const [servers, setServers] = useState([]);
  const [loadingAdapters, setLoadingAdapters] = useState(true);
  const [testing, setTesting] = useState(false);
  const [applying, setApplying] = useState(null);        // id do servidor sendo aplicado
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState(null);          // { type: 'ok'|'err', text }
  const [hasTested, setHasTested] = useState(false);

  const showMessage = (type, text, timeout = 6000) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), timeout);
  };

  const loadAdapters = async () => {
    setLoadingAdapters(true);
    try {
      const result = await window.electronAPI.invoke('dns:list-adapters');
      if (result.success) {
        setAdapters(result.adapters);
        if (result.adapters.length > 0 && !selectedAdapter) {
          setSelectedAdapter(result.adapters[0]);
        } else if (selectedAdapter) {
          const refreshed = result.adapters.find((a) => a.index === selectedAdapter.index);
          if (refreshed) setSelectedAdapter(refreshed);
        }
      } else {
        showMessage('err', result.error);
      }
    } catch (error) {
      showMessage('err', error.message);
    } finally {
      setLoadingAdapters(false);
    }
  };

  useEffect(() => {
    loadAdapters();
  }, []);

  const handleTest = async () => {
    setTesting(true);
    setHasTested(false);
    try {
      const result = await window.electronAPI.invoke('dns:test-servers');
      if (result.success) {
        setServers(result.servers);
        setHasTested(true);
      } else {
        showMessage('err', result.error);
      }
    } catch (error) {
      showMessage('err', error.message);
    } finally {
      setTesting(false);
    }
  };

  const handleApply = async (server) => {
    if (!selectedAdapter) return;
    setApplying(server.id);
    try {
      const result = await window.electronAPI.invoke('dns:apply', selectedAdapter.index, server.primary, server.secondary);
      if (result.success) {
        showMessage('ok', `DNS aplicado: ${server.name} (${server.primary})`);
        await loadAdapters();
      } else {
        showMessage('err', result.error);
      }
    } catch (error) {
      showMessage('err', error.message);
    } finally {
      setApplying(null);
    }
  };

  const handleReset = async () => {
    if (!selectedAdapter) return;
    setResetting(true);
    try {
      const result = await window.electronAPI.invoke('dns:reset', selectedAdapter.index);
      if (result.success) {
        showMessage('ok', 'DNS restaurado para automático (DHCP).');
        await loadAdapters();
      } else {
        showMessage('err', result.error);
      }
    } catch (error) {
      showMessage('err', error.message);
    } finally {
      setResetting(false);
    }
  };

  const fastestServer = servers.length > 0
    ? [...servers].filter((s) => s.reachable).sort((a, b) => a.latencyMs - b.latencyMs)[0]
    : null;

  return (
    <div className="p-8 flex flex-col gap-6">
      {message && (
        <div className={`flex items-center gap-2 text-sm rounded-lg px-4 py-3 border ${
          message.type === 'ok'
            ? 'text-c-primary bg-c-primary/10 border-c-primary/30'
            : 'text-c-danger bg-c-danger/10 border-c-danger/30'
        }`}>
          {message.type === 'ok' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
          {message.text}
        </div>
      )}

      {/* Adaptadores */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <Wifi size={15} className="text-slate-500" />
          <h3 className="text-slate-300 text-sm font-semibold">Adaptadores de Rede</h3>
        </div>

        {loadingAdapters ? (
          <div className="flex items-center gap-2 text-slate-500 text-sm py-6">
            <Loader2 size={16} className="animate-spin" />
            Detectando adaptadores...
          </div>
        ) : adapters.length === 0 ? (
          <p className="text-slate-500 text-sm">Nenhum adaptador ativo encontrado.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {adapters.map((ad) => (
              <button
                key={ad.index}
                onClick={() => setSelectedAdapter(ad)}
                className={`text-left bg-c-surface border rounded-xl p-4 flex flex-col gap-2 transition-colors ${
                  selectedAdapter?.index === ad.index
                    ? 'border-c-secondary shadow-glow-secondary'
                    : 'border-c-border hover:border-slate-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Wifi size={16} className={selectedAdapter?.index === ad.index ? 'text-c-secondary' : 'text-slate-400'} />
                  <span className="text-slate-200 font-semibold text-sm truncate">{ad.name}</span>
                </div>
                <p className="text-slate-500 text-xs truncate">{ad.description}</p>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-c-bg border border-c-border text-slate-400">
                    {ad.linkSpeed}
                  </span>
                  <span className={`text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full border ${
                    ad.isDhcp
                      ? 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                      : 'bg-c-primary/10 text-c-primary border-c-primary/30'
                  }`}>
                    {ad.isDhcp ? 'DNS automático' : `DNS: ${ad.currentDns[0] || 'custom'}`}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Ação: testar servidores */}
      {selectedAdapter && (
        <div className="bg-c-surface border border-c-border rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Activity size={16} className="text-c-secondary" />
              <span className="text-slate-200 text-sm font-semibold">Teste de latência</span>
              <span className="text-xs text-slate-500">
                no adaptador <span className="text-slate-300">{selectedAdapter.name}</span>
              </span>
            </div>
            <button
              onClick={handleTest}
              disabled={testing}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-c-secondary/40 text-c-secondary text-sm font-medium hover:bg-c-secondary/10 transition-colors disabled:opacity-50"
            >
              {testing ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
              {testing ? 'Testando 7 provedores...' : 'Testar Provedores DNS'}
            </button>
          </div>

          {hasTested && servers.length > 0 && (
            <div className="flex flex-col gap-2">
              {fastestServer && (
                <div className="flex items-center gap-2 text-c-primary text-xs bg-c-primary/10 border border-c-primary/30 rounded-lg px-3 py-2">
                  <Trophy size={14} />
                  Mais rápido: <span className="font-semibold">{fastestServer.name}</span> com{' '}
                  <span className="font-mono">{fastestServer.latencyMs} ms</span>
                </div>
              )}

              {servers.map((srv) => {
                const isFastest = fastestServer && srv.id === fastestServer.id;
                const isBusy = applying === srv.id;
                return (
                  <div
                    key={srv.id}
                    className={`flex items-center gap-3 bg-c-bg border rounded-lg px-4 py-3 ${
                      isFastest ? 'border-c-primary/40' : 'border-c-border'
                    }`}
                  >
                    <Globe size={16} className={isFastest ? 'text-c-primary' : 'text-slate-400'} />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-slate-200 text-sm font-medium">{srv.name}</span>
                        {isFastest && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-c-primary/10 text-c-primary border border-c-primary/30">
                            Mais rápido
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{srv.description}</p>
                      <p className="text-[11px] text-slate-600 font-mono mt-0.5">
                        {srv.primary} · {srv.secondary}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {srv.reachable ? (
                        <span className={`text-xs font-mono tabular-nums ${
                          srv.latencyMs < 30 ? 'text-c-primary' : srv.latencyMs < 80 ? 'text-yellow-400' : 'text-slate-400'
                        }`}>
                          {srv.latencyMs} ms
                        </span>
                      ) : (
                        <span className="text-xs text-slate-600">inacessível</span>
                      )}

                      <button
                        onClick={() => handleApply(srv)}
                        disabled={!srv.reachable || !!applying || resetting}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-c-secondary/40 text-c-secondary text-xs font-medium hover:bg-c-secondary/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isBusy ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={12} />}
                        {isBusy ? 'Aplicando...' : 'Aplicar'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Reset */}
      {selectedAdapter && (
        <div className="bg-c-surface border border-c-border rounded-xl p-5 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex flex-col gap-1">
            <span className="text-slate-200 text-sm font-semibold">Restaurar DNS padrão</span>
            <span className="text-slate-500 text-xs">
              Volta o adaptador para DNS automático (via DHCP da operadora)
            </span>
          </div>
          <button
            onClick={handleReset}
            disabled={resetting || !selectedAdapter}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-c-border text-slate-400 text-sm font-medium hover:text-slate-200 hover:border-slate-600 transition-colors disabled:opacity-50"
          >
            {resetting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
            {resetting ? 'Restaurando...' : 'Restaurar DNS automático'}
          </button>
        </div>
      )}
    </div>
  );
}

export default NetworkView;