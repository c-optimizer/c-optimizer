import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { LanguageProvider, useLanguage } from './context/LanguageContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import DashboardView from './views/DashboardView';
import PresetsView from './views/PresetsView';
import OptimizationsView from './views/OptimizationsView';
import CleanupView from './views/CleanupView';
import NetworkView from './views/NetworkView';
import DriversView from './views/DriversView';
import RestoreView from './views/RestoreView';
import AppsView from './views/AppsView';
import SettingsView from './views/SettingsView';
import AuthView from './views/AuthView';
import SystemFixerView from './views/SystemFixerView';
import OnboardingView from './views/OnboardingView';

const VIEWS = {
  dashboard: { component: DashboardView, titleKey: 'dashboard.title', subtitleKey: 'dashboard.subtitle' },
  presets: { component: PresetsView, titleKey: 'sidebar.presets', subtitleKey: 'presets.subtitle' },
  optimizations: { component: OptimizationsView, titleKey: 'optimizations.title', subtitleKey: 'optimizations.subtitle' },
  cleanup: { component: CleanupView, titleKey: 'cleanup.title', subtitleKey: 'cleanup.subtitle' },
  network: { component: NetworkView, titleKey: 'network.title', subtitleKey: 'network.subtitle' },
  drivers: { component: DriversView, titleKey: 'drivers.title', subtitleKey: 'drivers.subtitle' },
  restore: { component: RestoreView, titleKey: 'restore.title', subtitleKey: 'restore.subtitle' },
  apps: { component: AppsView, titleKey: 'apps.title', subtitleKey: 'apps.subtitle' },
  settings: { component: SettingsView, titleKey: 'settings.title', subtitleKey: 'settings.subtitle' },
  auth: { component: AuthView, titleKey: 'auth.title', subtitleKey: 'auth.subtitle' },
  'system-fixer': { component: SystemFixerView, titleKey: 'systemFixer.title', subtitleKey: 'systemFixer.subtitle' },
};

function FullScreenLoader() {
  return (
    <div className="h-screen w-screen bg-c-bg flex items-center justify-center">
      <Loader2 size={22} className="animate-spin text-slate-500" />
    </div>
  );
}

function AppShell({ onLogout }) {
  const [activeView, setActiveView] = useState('dashboard');
  const { t } = useLanguage();

  const CurrentView = VIEWS[activeView]?.component || DashboardView;

  return (
    <div className="flex h-screen w-screen bg-c-bg overflow-hidden">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />

      <div className="flex-1 flex flex-col overflow-y-auto">
        <Header
          title={t(VIEWS[activeView]?.titleKey || 'dashboard.title')}
          subtitle={t(VIEWS[activeView]?.subtitleKey || 'dashboard.subtitle')}
          statusOk={true}
        />
        <main className="flex-1">
          {activeView === 'auth'
            ? <AuthView onAuthenticated={() => {}} onLogout={onLogout} />
            : <CurrentView />}
        </main>
      </div>
    </div>
  );
}

function RootRouter() {
  const { t } = useLanguage();
  const [licensed, setLicensed] = useState(null);         // null = checando
  const [onboardingDone, setOnboardingDone] = useState(null); // null = checando

  // Passo 1: checa licença
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const license = await window.electronAPI.invoke('auth:get-stored-license');
        if (isMounted) setLicensed(!!license?.key);
      } catch (err) {
        console.error('Erro ao verificar licença:', err);
        if (isMounted) setLicensed(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  // Passo 2: só checa onboarding DEPOIS de ter licença
  useEffect(() => {
    if (licensed !== true) return;
    let isMounted = true;
    (async () => {
      try {
        const result = await window.electronAPI.invoke('onboarding:check');
        if (!isMounted) return;
        // Se o handler falhar por algum motivo, assume completo para não
        // prender o usuário em loop.
        setOnboardingDone(result?.success ? !!result.completed : true);
      } catch (err) {
        console.error('Erro ao checar onboarding:', err);
        if (isMounted) setOnboardingDone(true);
      }
    })();
    return () => { isMounted = false; };
  }, [licensed]);

  // Estado 1: ainda checando licença
  if (licensed === null) {
    return <FullScreenLoader />;
  }

  // Estado 2: sem licença → tela de autenticação
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

  // Estado 3: licenciado mas ainda checando onboarding
  if (onboardingDone === null) {
    return <FullScreenLoader />;
  }

  // Estado 4: onboarding não completado → wizard
  if (!onboardingDone) {
    return <OnboardingView onFinish={() => setOnboardingDone(true)} />;
  }

  // Estado 5: tudo OK → app normal
  return (
    <AppShell
      onLogout={() => {
        setLicensed(false);
        setOnboardingDone(null);
      }}
    />
  );
}

function App() {
  return (
    <LanguageProvider>
      <RootRouter />
    </LanguageProvider>
  );
}

export default App;