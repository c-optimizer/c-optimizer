import React, { useEffect, useState, useMemo } from 'react';
import {
  AlertTriangle, CheckCircle2, Loader2, ExternalLink, MonitorCog,
  CircuitBoard, Network, Volume2, Bluetooth, Usb, Printer, Cpu, HardDrive,
  Package, RefreshCw, ShieldCheck, Wrench, Download, Camera
} from 'lucide-react';

const CATEGORY_ICONS = {
  'Placa de Vídeo': CircuitBoard,
  'Rede': Network,
  'Áudio': Volume2,
  'Bluetooth': Bluetooth,
  'USB': Usb,
  'Impressora': Printer,
  'Chipset': Cpu,
  'Armazenamento': HardDrive,
  'Teclado': Package,
  'Mouse': Package,
  'Câmera / Câmera Web': Camera,
  'Outros': Package,
};

function formatDate(isoString) {
  if (!isoString) return '—';
  try {
    return new Date(isoString).toLocaleDateString();
  } catch { return '—'; }
}

function DriversView() {
  const [problems, setProblems] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [gpus, setGpus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [expandedCategory, setExpandedCategory] = useState(null);

  const loadAll = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [problemsRes, driversRes, gpusRes] = await Promise.allSettled([
        window.electronAPI.invoke('drivers:list-problems'),
        window.electronAPI.invoke('drivers:list-all'),
        window.electronAPI.invoke('drivers:get-gpus'),
      ]);

      if (problemsRes.status === 'fulfilled' && problemsRes.value?.success) {
        setProblems(problemsRes.value.devices || []);
      }
      if (driversRes.status === 'fulfilled' && driversRes.value?.success) {
        setDrivers(driversRes.value.drivers || []);
      }
      if (gpusRes.status === 'fulfilled' && gpusRes.value?.success) {
        setGpus(gpusRes.value.gpus || []);
      }
    } catch (error) {
      setErrorMsg(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const groupedDrivers = useMemo(() => {
    const map = {};
    drivers.forEach((d) => {
      if (!map[d.category]) map[d.category] = [];
      map[d.category].push(d);
    });
    Object.keys(map).forEach((cat) => {
      // Deduplica por deviceName (às vezes vem duplicado pelo WMI)
      const seen = new Set();
      map[cat] = map[cat].filter((d) => {
        if (seen.has(d.deviceName)) return false;
        seen.add(d.deviceName);
        return true;
      });
      map[cat].sort((a, b) => a.deviceName.localeCompare(b.deviceName));
    });
    return map;
  }, [drivers]);

  const handleOpenUrl = async (url) => {
    if (!url) return;
    const result = await window.electronAPI.invoke('drivers:open-url', url);
    if (!result.success) setErrorMsg(result.error);
  };

  const handleOpenDeviceManager = async () => {
    await window.electronAPI.invoke('drivers:open-device-manager');
  };

  const handleOpenWindowsUpdate = async () => {
    await window.electronAPI.invoke('drivers:open-windows-update');
  };

  const handleCreateRestorePoint = async () => {
    const result = await window.electronAPI.invoke('restore:create-point', 'Antes de atualizar drivers - C-Optimizer');
    if (result.success) {
      alert('Ponto de restauração criado com sucesso!');
    } else {
      setErrorMsg(result.error);
    }
  };

  return (
    <div className="p-8 flex flex-col gap-6">
      {loading && (
        <div className="flex items-center gap-2 text-slate-500 text-sm">
          <Loader2 size={16} className="animate-spin" />
          Analisando drivers instalados...
        </div>
      )}

      {errorMsg && (
        <div className="flex items-start gap-2 text-c-danger text-sm bg-c-danger/10 border border-c-danger/30 rounded-lg px-4 py-3">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Card: recomendações */}
      <div className="bg-c-surface border border-c-secondary/30 rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-c-secondary/10 border border-c-secondary/30 shrink-0">
            <ShieldCheck size={18} className="text-c-secondary" />
          </div>
          <div className="flex-1">
            <h3 className="text-slate-100 font-semibold text-sm">Recomendação antes de mexer em drivers</h3>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
              Sempre crie um ponto de restauração antes de atualizar qualquer driver.
              Se algo der errado, você pode reverter o Windows para o estado atual.
            </p>
          </div>
        </div>
        <button
          onClick={handleCreateRestorePoint}
          className="self-start flex items-center gap-2 px-4 py-2 rounded-lg border border-c-secondary/40 text-c-secondary text-sm font-medium hover:bg-c-secondary/10 transition-colors"
        >
          <ShieldCheck size={14} />
          Criar Ponto de Restauração
        </button>
      </div>

      {/* Card: dispositivos com problema */}
      {!loading && problems.length > 0 && (
        <div className="bg-c-surface border border-c-danger/30 rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-c-danger" />
            <h3 className="text-slate-100 font-semibold text-sm">
              {problems.length} dispositivo(s) com problema
            </h3>
          </div>

          <div className="flex flex-col gap-2">
            {problems.map((dev, idx) => (
              <div
                key={`${dev.deviceId}-${idx}`}
                className="flex items-start gap-3 bg-c-bg border border-c-danger/20 rounded-lg px-4 py-3"
              >
                <AlertTriangle size={14} className="text-c-danger mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-200 text-sm font-medium">{dev.name}</p>
                  <p className="text-c-danger/80 text-xs mt-0.5">
                    Código {dev.errorCode}: {dev.errorMessage}
                  </p>
                  <p className="text-slate-500 text-[11px] mt-1 truncate font-mono">{dev.deviceId}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleOpenDeviceManager}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-c-secondary/40 text-c-secondary text-xs font-medium hover:bg-c-secondary/10 transition-colors"
            >
              <Wrench size={13} />
              Abrir Gerenciador de Dispositivos
            </button>
            <button
              onClick={handleOpenWindowsUpdate}
              className="flex items-center gap-2 px-3 py-2 rounded-lg border border-c-secondary/40 text-c-secondary text-xs font-medium hover:bg-c-secondary/10 transition-colors"
            >
              <Download size={13} />
              Procurar no Windows Update
            </button>
          </div>
        </div>
      )}

      {!loading && problems.length === 0 && (
        <div className="flex items-center gap-3 bg-c-surface border border-c-primary/30 rounded-xl px-5 py-4">
          <CheckCircle2 size={18} className="text-c-primary shrink-0" />
          <div>
            <p className="text-slate-200 text-sm font-medium">Nenhum dispositivo com problema detectado.</p>
            <p className="text-slate-500 text-xs mt-0.5">
              Todos os drivers instalados estão funcionando corretamente.
            </p>
          </div>
        </div>
      )}

      {/* Card: placas de vídeo detectadas */}
      {gpus.length > 0 && (
        <div className="bg-c-surface border border-c-border rounded-xl p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <CircuitBoard size={18} className="text-c-secondary" />
            <h3 className="text-slate-200 font-semibold text-sm">Placas de Vídeo Detectadas</h3>
          </div>
          <div className="flex flex-col gap-2">
            {gpus.map((gpu, idx) => (
              <div
                key={idx}
                className="flex items-center justify-between gap-3 bg-c-bg border border-c-border rounded-lg px-4 py-3 flex-wrap"
              >
                <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                  <span className="text-slate-200 text-sm font-medium truncate">{gpu.name}</span>
                  <span className="text-slate-500 text-xs">{gpu.manufacturer}</span>
                </div>
                {gpu.updateApp && (
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-c-primary/10 text-c-primary border border-c-primary/30">
                      Atualize via {gpu.updateApp.name}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="text-slate-500 text-xs leading-relaxed">
            Para atualizar drivers de vídeo, use o app oficial do fabricante (GeForce Experience, AMD Software ou Intel DSA).
            Eles baixam do repositório seguro do fabricante e instalam automaticamente.
          </p>
        </div>
      )}

      {/* Card: drivers instalados por categoria */}
      {!loading && Object.keys(groupedDrivers).length > 0 && (
        <div className="bg-c-surface border border-c-border rounded-xl p-5 flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <MonitorCog size={18} className="text-c-secondary" />
            <h3 className="text-slate-200 font-semibold text-sm">Drivers Instalados</h3>
            <span className="text-xs text-slate-500 ml-1">
              ({drivers.length} no total)
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {Object.entries(groupedDrivers)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([category, list]) => {
                const Icon = CATEGORY_ICONS[category] || Package;
                const expanded = expandedCategory === category;
                return (
                  <div key={category} className="border border-c-border rounded-lg overflow-hidden">
                    <button
                      onClick={() => setExpandedCategory(expanded ? null : category)}
                      className="w-full flex items-center gap-3 bg-c-bg hover:bg-c-surface px-4 py-3 transition-colors"
                    >
                      <Icon size={16} className="text-c-secondary shrink-0" />
                      <span className="text-slate-200 text-sm font-medium flex-1 text-left">{category}</span>
                      <span className="text-xs text-slate-500">{list.length} driver(s)</span>
                      <RefreshCw
                        size={13}
                        className={`text-slate-500 transition-transform ${expanded ? 'rotate-90' : ''}`}
                      />
                    </button>

                    {expanded && (
                      <div className="flex flex-col divide-y divide-c-border bg-c-surface">
                        {list.map((d, idx) => (
                          <div
                            key={`${category}-${idx}`}
                            className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap"
                          >
                            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                              <span className="text-slate-200 text-xs font-medium truncate">{d.deviceName}</span>
                              <span className="text-slate-500 text-[11px]">
                                {d.manufacturer} · v{d.version} · {formatDate(d.date)}
                              </span>
                            </div>
                            {d.officialUrl && (
                              <button
                                onClick={() => handleOpenUrl(d.officialUrl)}
                                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-c-secondary/40 text-c-secondary text-[11px] font-medium hover:bg-c-secondary/10 transition-colors shrink-0"
                              >
                                <ExternalLink size={11} />
                                Site oficial
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>
      )}
    </div>
  );
}

export default DriversView;