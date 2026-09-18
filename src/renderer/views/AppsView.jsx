import React, { useState } from 'react';
import { Search, AppWindow, Trash2 } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const MOCK_APPS = [
  { id: 1, name: 'Xbox Game Bar', size: '210 MB', publisher: 'Microsoft Corporation' },
  { id: 2, name: 'Cortana', size: '85 MB', publisher: 'Microsoft Corporation' },
  { id: 3, name: 'Mixed Reality Portal', size: '640 MB', publisher: 'Microsoft Corporation' },
  { id: 4, name: 'Skype', size: '150 MB', publisher: 'Skype Communications' },
  { id: 5, name: 'Solitaire Collection', size: '95 MB', publisher: 'Microsoft Studios' }
];

function AppsView() {
  const { t } = useLanguage();
  const [search, setSearch] = useState('');

  const filtered = MOCK_APPS.filter((app) => app.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-8 flex flex-col gap-6">
      <div className="relative w-full md:w-80">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('apps.searchPlaceholder')}
          className="w-full bg-c-surface border border-c-border rounded-lg pl-9 pr-3 py-2 text-sm text-slate-200 placeholder:text-slate-500 focus:outline-none focus:border-c-secondary/60"
        />
      </div>

      <div className="flex flex-col gap-3">
        {filtered.map((app) => (
          <div
            key={app.id}
            className="flex items-center justify-between bg-c-surface border border-c-border rounded-xl px-5 py-4"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-c-bg border border-c-border">
                <AppWindow size={18} className="text-c-secondary" />
              </div>
              <div>
                <p className="text-sm text-slate-200 font-medium">{app.name}</p>
                <p className="text-xs text-slate-500">{app.publisher} &middot; {app.size}</p>
              </div>
            </div>

            <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-c-danger/40 text-c-danger text-xs font-medium hover:bg-c-danger/10 transition-colors">
              <Trash2 size={14} />
              {t('apps.uninstall')}
            </button>
          </div>
        ))}

        {filtered.length === 0 && (
          <p className="text-slate-500 text-sm text-center py-10">{t('apps.empty')}</p>
        )}
      </div>
    </div>
  );
}

export default AppsView;