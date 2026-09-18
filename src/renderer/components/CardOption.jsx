import React from 'react';
import ToggleSwitch from './ToggleSwitch';

function CardOption({ icon: Icon, title, description, tags = [], enabled, onToggle, variant = 'primary', meta = '' }) {
  return (
    <div className="bg-c-surface border border-c-border rounded-xl p-4 flex flex-col gap-3 hover:border-slate-600 transition-colors">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {Icon && (
            <div className="p-2 rounded-lg bg-c-bg border border-c-border">
              <Icon size={18} className="text-c-secondary" />
            </div>
          )}
          <div>
            <h3 className="text-slate-100 font-semibold text-sm">{title}</h3>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">{description}</p>
          </div>
        </div>
        <ToggleSwitch checked={enabled} onChange={onToggle} variant={variant} />
      </div>

      <div className="flex items-center justify-between mt-1">
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
        {meta && <span className="text-xs text-slate-500">{meta}</span>}
      </div>
    </div>
  );
}

export default CardOption;