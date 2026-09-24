import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
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
import SystemFixerView from './views/SystemFixerView';

const VIEWS = {
  dashboard: { component: DashboardView, titleKey: 'dashboard.title', subtitleKey: 'dashboard.subtitle' },
  optimizations: { component: OptimizationsView, titleKey: 'optimizations.title', subtitleKey: 'optimizations.subtitle' },
  cleanup: { component: CleanupView, titleKey: 'cleanup.title', subtitleKey: 'cleanup.subtitle' },
  restore: { component: RestoreView, titleKey: 'restore.title', subtitleKey: 'restore.subtitle' },
  apps: { component: AppsView, titleKey: 'apps.title', subtitleKey: 'apps.subtitle' },
  settings: { component: SettingsView, titleKey: 'settings.title', subtitleKey: 'settings.subtitle' },
  auth: { component: AuthView, titleKey: 'auth.title', subtitleKey: 'auth.subtitle' },
  'system-fixer': { component: SystemFixerView, titleKey: 'systemFixer.title', subtitleKey: 'systemFixer.subtitle' }
};

function AppShell() {
  const [activeView, setActiveView] = useState('dashboard');
  const [licensed, setLicensed] = useState(null); // null = verificando
  const { t } = useLanguage();

  useEffect(() => {
    let isMounted = true;

    async function checkLicense() {
      try {
        const license = await window.electronAPI.invoke('auth:get-stored-license');
        if (isMounted) setLicensed(!!license?.key);
      } catch (error) {
        console.error('Erro ao verificar licença:', error);
        if (isMounted) setLicensed(false);
      }
    }

    checkLicense();
    return () => { isMounted = false; };
  }, []);

  // Ainda checando o electron-store — evita "piscar" a tela de auth
  // antes de saber se já existe uma licença salva.
  if (licensed === null) {
    return (
      <div className="h-screen w-screen bg-c-bg flex items-center justify-center">
        <Loader2 size={22} className="animate-spin text-slate-500" />
      </div>
    );
  }

  // Sem licença válida: só a tela de Autenticação é acessível.
  // Sidebar nem é renderizada — não há como navegar para as outras views.
  if (!licensed) {
    return (
      <div className="flex h-screen w-screen bg-c-bg overflow-hidden">
        <div className="flex-1 flex flex-col overflow-y-auto">
          <Header title={t('auth.title')} subtitle={t('auth.subtitle')} statusOk={false} />
          <main className="flex-1">
            <AuthView onAuthenticated={() => setLicensed(true)} />
          </main>
        </div>
      </div>
    );
  }

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
          {activeView === 'auth'
            ? <AuthView onAuthenticated={() => setLicensed(true)} onLogout={() => setLicensed(false)} />
            : <CurrentView />}
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