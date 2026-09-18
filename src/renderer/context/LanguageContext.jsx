import React, { createContext, useContext, useState, useMemo } from 'react';

const translations = {
  'pt-BR': {
    sidebar: {
      dashboard: 'Painel',
      optimizations: 'Otimizações',
      cleanup: 'Limpeza',
      restore: 'Restauração',
      apps: 'Apps',
      settings: 'Configurações',
      auth: 'Autenticação'
    },
    header: {
      statusProtected: 'Sistema Otimizado',
      statusPending: 'Otimização Pendente'
    },
    dashboard: {
      title: 'Painel',
      subtitle: 'Visão geral do seu sistema em tempo real',
      optimizeCta: 'Otimizar seu PC',
      optimizeCtaSub: 'Aplica o pacote de ajustes recomendado automaticamente',
      statusCardTitle: 'Status de Otimização',
      statusCardDesc: 'Última verificação há 2 horas',
      cpu: 'Processador',
      gpu: 'Placa de Vídeo',
      ram: 'Memória RAM',
      storage: 'Armazenamento',
      os: 'Sistema Operacional'
    },
    optimizations: {
      title: 'Otimizações',
      subtitle: 'Ative ajustes específicos para melhorar performance',
      searchPlaceholder: 'Buscar otimização...',
      all: 'Todas',
      empty: 'Nenhuma otimização encontrada.'
    },
    cleanup: {
      title: 'Limpeza do Sistema',
      subtitle: 'Libere espaço removendo arquivos desnecessários',
      lastCleanup: 'Última limpeza',
      never: 'Nunca realizada',
      cleanButton: 'Limpar Selecionados',
      estimatedSize: 'Tamanho estimado'
    },
    restore: {
      title: 'Restauração',
      subtitle: 'Gerencie pontos de restauração do sistema',
      createPoint: 'Criar Ponto de Restauração',
      apply: 'Aplicar',
      delete: 'Excluir',
      automatic: 'Automático',
      manual: 'Manual'
    },
    apps: {
      title: 'Apps',
      subtitle: 'Remova aplicativos nativos indesejados (bloatware)',
      uninstall: 'Desinstalar',
      searchPlaceholder: 'Buscar aplicativo...',
      empty: 'Nenhum aplicativo encontrado.'
    },
    settings: {
      title: 'Configurações',
      subtitle: 'Preferências gerais da aplicação',
      language: 'Idioma',
      startup: 'Iniciar com o Windows',
      minimizeTray: 'Minimizar para a bandeja do sistema',
      about: 'Sobre'
    },
    auth: {
      title: 'Autenticação',
      subtitle: 'Valide sua chave de licença para desbloquear o C-Optimizer',
      licenseLabel: 'Chave de Licença',
      licensePlaceholder: 'XXXXX-XXXXX-XXXXX-XXXXX',
      validate: 'Validar Licença',
      logout: 'Sair da Licença',
      success: 'Licença validada com sucesso!',
      invalid: 'Chave inválida. Verifique e tente novamente.'
    },
    common: {
      enabled: 'Ativado',
      disabled: 'Desativado'
    }
  },
  'en-US': {
    sidebar: {
      dashboard: 'Dashboard',
      optimizations: 'Optimizations',
      cleanup: 'Cleanup',
      restore: 'Restore',
      apps: 'Apps',
      settings: 'Settings',
      auth: 'Authentication'
    },
    header: {
      statusProtected: 'System Optimized',
      statusPending: 'Optimization Pending'
    },
    dashboard: {
      title: 'Dashboard',
      subtitle: 'Real-time overview of your system',
      optimizeCta: 'Optimize your PC',
      optimizeCtaSub: 'Automatically applies the recommended tweak package',
      statusCardTitle: 'Optimization Status',
      statusCardDesc: 'Last checked 2 hours ago',
      cpu: 'Processor',
      gpu: 'Graphics Card',
      ram: 'RAM Memory',
      storage: 'Storage',
      os: 'Operating System'
    },
    optimizations: {
      title: 'Optimizations',
      subtitle: 'Enable specific tweaks to improve performance',
      searchPlaceholder: 'Search optimization...',
      all: 'All',
      empty: 'No optimizations found.'
    },
    cleanup: {
      title: 'System Cleanup',
      subtitle: 'Free up space by removing unnecessary files',
      lastCleanup: 'Last cleanup',
      never: 'Never run',
      cleanButton: 'Clean Selected',
      estimatedSize: 'Estimated size'
    },
    restore: {
      title: 'Restore',
      subtitle: 'Manage system restore points',
      createPoint: 'Create Restore Point',
      apply: 'Apply',
      delete: 'Delete',
      automatic: 'Automatic',
      manual: 'Manual'
    },
    apps: {
      title: 'Apps',
      subtitle: 'Remove unwanted native applications (bloatware)',
      uninstall: 'Uninstall',
      searchPlaceholder: 'Search app...',
      empty: 'No apps found.'
    },
    settings: {
      title: 'Settings',
      subtitle: 'General application preferences',
      language: 'Language',
      startup: 'Start with Windows',
      minimizeTray: 'Minimize to system tray',
      about: 'About'
    },
    auth: {
      title: 'Authentication',
      subtitle: 'Validate your license key to unlock C-Optimizer',
      licenseLabel: 'License Key',
      licensePlaceholder: 'XXXXX-XXXXX-XXXXX-XXXXX',
      validate: 'Validate License',
      logout: 'Log out of License',
      success: 'License validated successfully!',
      invalid: 'Invalid key. Please check and try again.'
    },
    common: {
      enabled: 'Enabled',
      disabled: 'Disabled'
    }
  },
  'es-ES': {
    sidebar: {
      dashboard: 'Panel',
      optimizations: 'Optimizaciones',
      cleanup: 'Limpieza',
      restore: 'Restauración',
      apps: 'Aplicaciones',
      settings: 'Configuración',
      auth: 'Autenticación'
    },
    header: {
      statusProtected: 'Sistema Optimizado',
      statusPending: 'Optimización Pendiente'
    },
    dashboard: {
      title: 'Panel',
      subtitle: 'Visión general de tu sistema en tiempo real',
      optimizeCta: 'Optimizar tu PC',
      optimizeCtaSub: 'Aplica automáticamente el paquete de ajustes recomendado',
      statusCardTitle: 'Estado de Optimización',
      statusCardDesc: 'Última verificación hace 2 horas',
      cpu: 'Procesador',
      gpu: 'Tarjeta Gráfica',
      ram: 'Memoria RAM',
      storage: 'Almacenamiento',
      os: 'Sistema Operativo'
    },
    optimizations: {
      title: 'Optimizaciones',
      subtitle: 'Activa ajustes específicos para mejorar el rendimiento',
      searchPlaceholder: 'Buscar optimización...',
      all: 'Todas',
      empty: 'No se encontraron optimizaciones.'
    },
    cleanup: {
      title: 'Limpieza del Sistema',
      subtitle: 'Libera espacio eliminando archivos innecesarios',
      lastCleanup: 'Última limpieza',
      never: 'Nunca realizada',
      cleanButton: 'Limpiar Seleccionados',
      estimatedSize: 'Tamaño estimado'
    },
    restore: {
      title: 'Restauración',
      subtitle: 'Gestiona los puntos de restauración del sistema',
      createPoint: 'Crear Punto de Restauración',
      apply: 'Aplicar',
      delete: 'Eliminar',
      automatic: 'Automático',
      manual: 'Manual'
    },
    apps: {
      title: 'Aplicaciones',
      subtitle: 'Elimina aplicaciones nativas no deseadas (bloatware)',
      uninstall: 'Desinstalar',
      searchPlaceholder: 'Buscar aplicación...',
      empty: 'No se encontraron aplicaciones.'
    },
    settings: {
      title: 'Configuración',
      subtitle: 'Preferencias generales de la aplicación',
      language: 'Idioma',
      startup: 'Iniciar con Windows',
      minimizeTray: 'Minimizar a la bandeja del sistema',
      about: 'Acerca de'
    },
    auth: {
      title: 'Autenticación',
      subtitle: 'Valida tu clave de licencia para desbloquear C-Optimizer',
      licenseLabel: 'Clave de Licencia',
      licensePlaceholder: 'XXXXX-XXXXX-XXXXX-XXXXX',
      validate: 'Validar Licencia',
      logout: 'Cerrar Sesión de Licencia',
      success: '¡Licencia validada con éxito!',
      invalid: 'Clave inválida. Verifica e intenta de nuevo.'
    },
    common: {
      enabled: 'Activado',
      disabled: 'Desactivado'
    }
  }
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('pt-BR');

  const t = useMemo(() => {
    return (path) => {
      const keys = path.split('.');
      let result = translations[language];
      for (const key of keys) {
        result = result?.[key];
      }
      return result ?? path;
    };
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage deve ser usado dentro de LanguageProvider');
  return ctx;
}