import React, { useState } from 'react';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardView from './views/DashboardView';
import OptimizationsView from './views/OptimizationsView';
import CleanupView from './views/CleanupView';
import RestoreView from './views/RestoreView';
import AppsView from './views/AppsView';
import SettingsView from './views/SettingsView';
import AuthView from './views/AuthView';

const VIEWS = {
  dashboard: { component: DashboardView, titleKey: 'dashboard.title', subtitleKey: 'dashboard.subtitle' },
  optimizations: { component: OptimizationsView, titleKey: 'optimizations.title', subtitleKey: 'optimizations.subtitle' },
  cleanup: { component: CleanupView, titleKey: 'cleanup.title', subtitleKey: 'cleanup.subtitle' },
  restore: { component: RestoreView, titleKey: 'restore.title', subtitleKey: 'restore.subtitle' },
  apps: { component: AppsView, titleKey: 'apps.title', subtitleKey: 'apps.subtitle' },
  settings: { component: SettingsView, titleKey: 'settings.title', subtitleKey: 'settings.subtitle' },
  auth: { component: AuthView, titleKey: 'auth.title', subtitleKey: 'auth.subtitle' }
};

function AppShell() {
  const [activeView, setActiveView] = useState('dashboard');
  const { t } = useLanguage();

  const CurrentView = VIEWS[activeView].component;

  return (
    <div className="flex h-screen w-screen bg-c-bg overflow-hidden">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />

      <div className="flex-1 flex flex-col overflow-y-auto">
        <Header
          title={t(VIEWS[activeView].titleKey)}
          subtitle={t(VIEWS[activeView].subtitleKey)}
          statusOk={true}
        />
        <main className="flex-1">
          <CurrentView />
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <LanguageProvider>
      <AppShell />
    </LanguageProvider>
  );
}

export default App;