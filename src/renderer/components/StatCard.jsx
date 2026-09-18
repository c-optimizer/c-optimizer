import React from 'react';

const variantMap = {
  primary: { text: 'text-c-primary', bar: 'bg-c-primary', ring: 'border-c-primary/30' },
  secondary: { text: 'text-c-secondary', bar: 'bg-c-secondary', ring: 'border-c-secondary/30' },
  danger: { text: 'text-c-danger', bar: 'bg-c-danger', ring: 'border-c-danger/30' },
  neutral: { text: 'text-slate-300', bar: 'bg-slate-400', ring: 'border-c-border' }
};

function StatCard({ icon: Icon, label, value, unit = '', percent = null, variant = 'primary', extra = '' }) {
  const colors = variantMap[variant] || variantMap.primary;

  return (
    <div className={`bg-c-surface border ${colors.ring} rounded-xl p-4 flex flex-col gap-3 hover:border-opacity-60 transition-all`}>
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-sm font-medium">{label}</span>
        {Icon && <Icon size={18} className={colors.text} />}
      </div>

      <div className="flex items-end gap-1">
        <span className={`text-2xl font-bold ${colors.text}`}>{value}</span>
        {unit && <span className="text-slate-500 text-sm mb-0.5">{unit}</span>}
      </div>

      {percent !== null && (
        <div className="w-full h-1.5 bg-c-border rounded-full overflow-hidden">
          <div
            className={`h-full ${colors.bar} rounded-full transition-all duration-500`}
            style={{ width: `${Math.min(percent, 100)}%` }}
          />
        </div>
      )}

      {extra && <span className="text-xs text-slate-500">{extra}</span>}
    </div>
  );
}

export default StatCard;