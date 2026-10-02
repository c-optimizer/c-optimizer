import React from 'react';
import ToggleSwitch from './ToggleSwitch';

function CardOption({ icon: Icon, title, description, tags = [], enabled, onToggle, variant = 'primary', meta = '' }) {
  return (
    <div className="h-full bg-c-surface border border-c-border rounded-xl p-4 flex flex-col gap-3 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {Icon && (
            <div className="p-2 rounded-lg bg-c-bg border border-c-border shrink-0">
              <Icon size={18} className="text-c-secondary" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-slate-100 font-semibold text-sm">{title}</h3>
            {/* Altura mínima fixa em vez de line-clamp (compatível com qualquer
                versão do Tailwind — line-clamp só existe nativo a partir do 3.3).
                Reserva 3 linhas de texto-xs (leading-relaxed): ~3rem. */}
            <p
              className="text-slate-400 text-xs mt-1 leading-relaxed"
              style={{ minHeight: '3rem', maxHeight: '3rem', overflow: 'hidden' }}
            >
              {description}
            </p>
          </div>
        </div>
        <div className="shrink-0">
          <ToggleSwitch checked={enabled} onChange={onToggle} variant={variant} />
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 mt-auto pt-2">
        <div className="flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-c-bg border border-c-border text-slate-400"
            >
              {tag}
            </span>
          ))}
        </div>
        {meta && <span className="text-xs text-slate-500 shrink-0">{meta}</span>}
      </div>
    </div>
  );
}

export default CardOption;