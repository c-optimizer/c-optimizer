import React, { useState } from 'react';
import { Shield, PlusCircle, Undo2, Trash2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

function RestoreView() {
  const { t } = useLanguage();

  // Mock — será substituído por window.electronAPI.invoke('restore:list-points') na FASE 3
  const [points] = useState([
    { id: 1, name: 'Antes da instalação do driver NVIDIA', date: '15/09/2026 14:32', type: t('restore.automatic') },
    { id: 2, name: 'Ponto manual - Pré-otimização C-Optimizer', date: '10/09/2026 09:10', type: t('restore.manual') },
    { id: 3, name: 'Atualização do Windows KB5041234', date: '02/09/2026 21:05', type: t('restore.automatic') }
  ]);

  return (
    <div className="p-8 flex flex-col gap-6">
      <button className="self-start flex items-center gap-2 px-4 py-2.5 rounded-lg bg-c-secondary/10 border border-c-secondary text-c-secondary text-sm font-semibold hover:bg-c-secondary/20 transition-colors">
        <PlusCircle size={16} />
        {t('restore.createPoint')}
      </button>

      <div className="flex flex-col gap-3">
        {points.map((point) => (
          <div
            key={point.id}
            className="flex items-center justify-between bg-c-surface border border-c-border rounded-xl px-5 py-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-c-bg border border-c-border">
                <Shield size={18} className="text-c-secondary" />
              </div>
              <div>
                <p className="text-sm text-slate-200 font-medium">{point.name}</p>
                <p className="text-xs text-slate-500">{point.date} &middot; {point.type}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-c-primary/40 text-c-primary text-xs font-medium hover:bg-c-primary/10 transition-colors">
                <Undo2 size={14} />
                {t('restore.apply')}
              </button>
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-c-danger/40 text-c-danger text-xs font-medium hover:bg-c-danger/10 transition-colors">
                <Trash2 size={14} />
                {t('restore.delete')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default RestoreView;