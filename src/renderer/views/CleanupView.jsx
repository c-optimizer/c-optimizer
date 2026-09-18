import React, { useState } from 'react';
import { Folder, Zap, Trash, RefreshCw, Trash2 } from 'lucide-react';
import CardOption from '../components/CardOption';
import { useLanguage } from '../context/LanguageContext';

const CLEANUP_TARGETS = [
  { id: 'temp', icon: Folder, title: '%temp%', description: 'Arquivos temporários gerados por aplicativos do sistema.', size: '1.2 GB' },
  { id: 'prefetch', icon: Zap, title: 'Prefetch', description: 'Dados de pré-carregamento usados pelo Windows para acelerar a inicialização de apps.', size: '340 MB' },
  { id: 'recycle-bin', icon: Trash, title: 'Lixeira', description: 'Arquivos excluídos que ainda ocupam espaço em disco.', size: '890 MB' },
  { id: 'wu-cache', icon: RefreshCw, title: 'Cache do Windows Update', description: 'Pacotes de atualização já instalados que não são mais necessários.', size: '2.4 GB' }
];

function CleanupView() {
  const { t } = useLanguage();
  const [selected, setSelected] = useState({});
  const [lastCleanup] = useState(null); // FASE 3: window.electronAPI.invoke('cleanup:get-last-run')

  const handleToggle = (id, value) => {
    setSelected((prev) => ({ ...prev, [id]: value }));
  };

  const anySelected = Object.values(selected).some(Boolean);

  const handleClean = () => {
    // FASE 3: window.electronAPI.invoke('cleanup:execute', Object.keys(selected).filter(id => selected[id]))
    console.log('Limpando:', Object.keys(selected).filter((id) => selected[id]));
  };

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between bg-c-surface border border-c-border rounded-xl px-5 py-3">
        <span className="text-sm text-slate-400">
          {t('cleanup.lastCleanup')}: <span className="text-slate-200 font-medium">{lastCleanup || t('cleanup.never')}</span>
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {CLEANUP_TARGETS.map((target) => (
          <CardOption
            key={target.id}
            icon={target.icon}
            title={target.title}
            description={target.description}
            tags={[]}
            meta={`${t('cleanup.estimatedSize')}: ${target.size}`}
            enabled={!!selected[target.id]}
            onToggle={(value) => handleToggle(target.id, value)}
            variant="danger"
          />
        ))}
      </div>

      <button
        onClick={handleClean}
        disabled={!anySelected}
        className={`self-start flex items-center gap-2 px-5 py-3 rounded-lg font-semibold text-sm transition-colors
          ${anySelected
            ? 'bg-c-danger/10 border border-c-danger text-c-danger shadow-glow-danger hover:bg-c-danger/20'
            : 'bg-c-surface border border-c-border text-slate-600 cursor-not-allowed'}
        `}
      >
        <Trash2 size={16} />
        {t('cleanup.cleanButton')}
      </button>
    </div>
  );
}

export default CleanupView;