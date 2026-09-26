import React, { useEffect, useState } from 'react';
import { Wrench, Loader2, AlertCircle, CheckCircle2, Terminal, ShieldAlert, HardDrive, Play } from 'lucide-react';

function SystemFixerView() {
  const [isAdmin, setIsAdmin] = useState(true);
  const [checkingAdmin, setCheckingAdmin] = useState(true);

  const [repairing, setRepairing] = useState(false);
  const [repairLogs, setRepairLogs] = useState([]);
  const [repairResult, setRepairResult] = useState(null);
  const [repairError, setRepairError] = useState(null);

  const [volumes, setVolumes] = useState([]);
  const [checkingDrive, setCheckingDrive] = useState(null);
  const [driveLogs, setDriveLogs] = useState([]);
  const [driveError, setDriveError] = useState(null);
  const [driveResult, setDriveResult] = useState(null);

  useEffect(() => {
    let isMounted = true;
    let unsubscribe = () => { };

    async function init() {
      try {
        const [adminStatus, volumesResult] = await Promise.all([
          window.electronAPI.invoke('system-fixer:is-admin'),
          window.electronAPI.invoke('disk:list-volumes')
        ]);
        if (isMounted) {
          setIsAdmin(!!adminStatus);
          if (volumesResult.success) setVolumes(volumesResult.volumes);
          setCheckingAdmin(false);
        }
      } catch (error) {
        console.error('Erro ao inicializar System Fixer:', error);
        if (isMounted) setCheckingAdmin(false);
      }
    }

    init();

    unsubscribe = window.electronAPI.on('system-fixer:progress', ({ stepId, line }) => {
  if (stepId === 'dism' || stepId === 'sfc') {
    setRepairLogs((prev) => {
      const isProgressLine = /%|====/.test(line);
      if (isProgressLine && prev.length > 0 && /%|====/.test(prev[prev.length - 1])) {
        return [...prev.slice(0, -1), `[${stepId.toUpperCase()}] ${line}`];
      }
      return [...prev, `[${stepId.toUpperCase()}] ${line}`].slice(-80);
    });
  } else if (stepId === 'chkdsk') {
    setDriveLogs((prev) => [...prev, line].slice(-80));
  }
});

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  const handleRunRepair = async () => {
    const confirmed = window.confirm(
      'Isso vai executar DISM e SFC para verificar e reparar arquivos de sistema. O processo pode levar 15-30 minutos. Deseja continuar?'
    );
    if (!confirmed) return;

    setRepairing(true);
    setRepairLogs([]);
    setRepairResult(null);
    setRepairError(null);

    try {
      const result = await window.electronAPI.invoke('system-fixer:run-repair');
      if (result.success) {
        setRepairResult('Reparo concluído com sucesso! Reinicie o computador para aplicar todas as correções.');
      } else {
        setRepairError(result.error || 'O reparo terminou com falhas. Verifique os logs acima.');
      }
    } catch (error) {
      setRepairError(error.message);
    } finally {
      setRepairing(false);
    }
  };

  const handleCheckDrive = async (driveLetter) => {
    const confirmed = window.confirm(
      `A verificação da unidade ${driveLetter}: pode ser agendada para o próximo reinício do Windows, caso o disco esteja em uso. Deseja continuar?`
    );
    if (!confirmed) return;

    setCheckingDrive(driveLetter);
    setDriveLogs([]);
    setDriveResult(null);
    setDriveError(null);

    try {
      const result = await window.electronAPI.invoke('system-fixer:check-drive', driveLetter);
      if (result.success) {
        setDriveResult(`Verificação da unidade ${driveLetter}: concluída (ou agendada para o próximo boot).`);
      } else {
        setDriveError(result.error || 'Falha ao verificar a unidade.');
      }
    } catch (error) {
      setDriveError(error.message);
    } finally {
      setCheckingDrive(null);
    }
  };

  if (checkingAdmin) {
    return (
      <div className="p-8 flex items-center gap-2 text-slate-500 text-sm">
        <Loader2 size={16} className="animate-spin" />
        Verificando permissões...
      </div>
    );
  }

  return (
    <div className="p-8 flex flex-col gap-6">
      {!isAdmin && (
        <div className="flex items-start gap-2.5 bg-c-danger/10 border border-c-danger/30 rounded-lg px-4 py-3 text-sm text-slate-300">
          <ShieldAlert size={18} className="text-c-danger shrink-0 mt-0.5" />
          <span>
            As ferramentas desta tela exigem que o C-Optimizer seja executado como Administrador. Feche o app e abra-o novamente com privilégios elevados para usar os reparos.
          </span>
        </div>
      )}

      {/* Reparo de Arquivos de Sistema */}
      <div className="bg-c-surface border border-c-secondary/30 rounded-xl p-6 flex flex-col items-center gap-4 text-center">
        <div className="p-4 rounded-full bg-c-secondary/10 border border-c-secondary/30 shadow-glow-secondary">
          <Wrench size={26} className="text-c-secondary" />
        </div>
        <div>
          <h2 className="text-slate-100 font-bold text-lg">Reparo de Arquivos de Sistema</h2>
          <p className="text-slate-500 text-sm mt-2 max-w-lg mx-auto leading-relaxed">
            Executa DISM e SFC em sequência para verificar e corrigir arquivos corrompidos do Windows.
            O processo é demorado (15-30 minutos) e não pode ser interrompido com segurança.
          </p>
        </div>

        <button
          onClick={handleRunRepair}
          disabled={repairing || !isAdmin}
          className="flex items-center gap-2 px-6 py-3 rounded-lg bg-c-secondary/10 border border-c-secondary text-c-secondary text-sm font-semibold shadow-glow-secondary hover:bg-c-secondary/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {repairing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
          {repairing ? 'Reparando (não feche o app)...' : 'Iniciar Reparo Completo'}
        </button>

        {repairResult && (
          <div className="flex items-center gap-2 text-c-primary text-sm bg-c-primary/10 border border-c-primary/30 rounded-lg px-4 py-3 w-full justify-center">
            <CheckCircle2 size={16} />
            {repairResult}
          </div>
        )}

        {repairError && (
          <div className="flex items-center gap-2 text-c-danger text-sm bg-c-danger/10 border border-c-danger/30 rounded-lg px-4 py-3 w-full justify-center">
            <AlertCircle size={16} />
            {repairError}
          </div>
        )}

        {repairLogs.length > 0 && (
  <div className="w-full bg-c-bg border border-c-border rounded-lg p-3 max-h-48 overflow-y-auto flex flex-col gap-1 text-left">
    <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1 shrink-0">
      <Terminal size={12} />
      Progresso
    </div>
    {repairLogs.map((line, idx) => (
      <p 
        key={idx} 
        /* shrink-0 impede o esmagamento da altura, leading-relaxed corrige o corte das letras */
        className="text-[11px] leading-relaxed text-slate-500 font-mono truncate shrink-0"
      >
        {line}
      </p>
    ))}
    {/* Elemento fantasma para garantir o padding inferior no scroll do Flexbox */}
    <div className="h-1 shrink-0"></div>
  </div>
)}

  </div>

      {/* Verificação de Disco */}
      <div className="bg-c-surface border border-c-border rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <HardDrive size={18} className="text-c-secondary" />
          <h3 className="text-slate-200 font-semibold text-sm">Verificação de Erros no Disco (CHKDSK)</h3>
        </div>
        <p className="text-slate-500 text-xs -mt-2">
          Verifica e corrige erros no sistema de arquivos. O processo roda dentro do próprio app —
          qualquer confirmação necessária é respondida automaticamente. Unidades em uso (como C:) geralmente
          exigem reinicialização para concluir a verificação.
        </p>

        {driveResult && <p className="text-c-primary text-xs">{driveResult}</p>}
        {driveError && <p className="text-c-danger text-xs">{driveError}</p>}

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
                onClick={() => handleCheckDrive(v.driveLetter)}
                disabled={checkingDrive === v.driveLetter || !isAdmin}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-c-secondary/40 text-c-secondary text-xs font-medium hover:bg-c-secondary/10 transition-colors disabled:opacity-50"
              >
                {checkingDrive === v.driveLetter
                  ? <Loader2 size={13} className="animate-spin" />
                  : <HardDrive size={13} />}
                {checkingDrive === v.driveLetter ? 'Verificando...' : 'Verificar'}
              </button>
            </div>
          ))}
          {volumes.length === 0 && (
            <p className="text-slate-600 text-xs text-center py-4">Nenhuma unidade detectada.</p>
          )}
        </div>

        {driveLogs.length > 0 && (
          <div className="bg-c-bg border border-c-border rounded-lg p-3 max-h-40 overflow-y-auto flex flex-col gap-1">
            {driveLogs.map((line, idx) => (
              <p key={idx} className="text-[11px] text-slate-500 font-mono truncate">{line}</p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default SystemFixerView;