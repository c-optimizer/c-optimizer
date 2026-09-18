import React from 'react';
import {
  LayoutDashboard,
  SlidersHorizontal,
  Trash2,
  RotateCcw,
  AppWindow,
  Settings,
  KeyRound,
  Zap
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const navItems = [
  { id: 'dashboard', icon: LayoutDashboard, labelKey: 'sidebar.dashboard' },
  { id: 'optimizations', icon: SlidersHorizontal, labelKey: 'sidebar.optimizations' },
  { id: 'cleanup', icon: Trash2, labelKey: 'sidebar.cleanup' },
  { id: 'restore', icon: RotateCcw, labelKey: 'sidebar.restore' },
  { id: 'apps', icon: AppWindow, labelKey: 'sidebar.apps' },
  { id: 'settings', icon: Settings, labelKey: 'sidebar.settings' },
  { id: 'auth', icon: KeyRound, labelKey: 'sidebar.auth' }
];

function Sidebar({ activeView, onNavigate }) {
  const { t } = useLanguage();

  return (
    <aside className="w-60 shrink-0 h-screen bg-c-surface border-r border-c-border flex flex-col">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-c-border">
        <div className="p-1.5 rounded-lg bg-c-primary/10 border border-c-primary/30">
          <Zap size={20} className="text-c-primary" />
        </div>
        <span className="text-lg font-bold tracking-wide text-slate-100">
          C-<span className="text-c-primary">OPTIMIZER</span>
        </span>
      </div>

      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
        {navItems.map(({ id, icon: Icon, labelKey }) => {
          const isActive = activeView === id;
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all
                ${isActive
                  ? 'bg-c-primary/10 text-c-primary border border-c-primary/30 shadow-glow-primary'
                  : 'text-slate-400 border border-transparent hover:bg-c-bg hover:text-slate-200'}
              `}
            >
              <Icon size={18} />
              {t(labelKey)}
            </button>
          );
        })}
      </nav>

      <div className="px-5 py-4 border-t border-c-border">
        <span className="text-[11px] text-slate-500">v1.0.0 &middot; C-Optimizer</span>
      </div>
    </aside>
  );
}

export default Sidebar;