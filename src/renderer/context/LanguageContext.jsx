import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';

const translations = {
  'pt-BR': {
    sidebar: {
      dashboard: 'Painel',
      presets: 'Presets',
      optimizations: 'Otimizações',
      cleanup: 'Limpeza',
      restore: 'Restauração',
      apps: 'Apps',
      settings: 'Configurações',
      auth: 'Autenticação',
      systemFixer: 'Reparos',
    },
    header: {
      statusProtected: 'Sistema Otimizado',
      statusPending: 'Otimização Pendente',
      activeTweaks: 'ativos',
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
      os: 'Sistema Operacional',
            applyGamingPreset: 'Aplicar Preset Gaming',
      applyGamingPresetSub: 'Um clique para latência mínima e prioridade de CPU',
      presetApplying: 'Aplicando preset...',
      presetApplied: 'Preset Gaming aplicado! ({applied} ativados, {skipped} já estavam ativos)',
      presetFailed: 'Falha ao aplicar o preset Gaming.',
      needsAdmin: 'Alguns tweaks do preset Gaming exigem administrador. Reinicie o C-Optimizer como Administrador para aplicá-los.',
    },
    optimizations: {
      title: 'Otimizações',
      subtitle: 'Ative ajustes específicos para melhorar performance',
      searchPlaceholder: 'Buscar otimização...',
      all: 'Todas',
      empty: 'Nenhuma otimização encontrada.'
    },
    presets: {
      subtitle: 'Aplique vários ajustes de uma vez com um clique',
      loading: 'Carregando presets...',
      hint: 'Presets aplicam vários ajustes de uma vez. Ajustes já ativos são pulados. Você pode reverter qualquer preset individualmente na aba Otimizações.',
      apply: 'Aplicar Preset',
      revertAll: 'Reverter Tudo',
      applying: 'Aplicando...',
      starting: 'Iniciando...',
      tweakCount: '{count} otimização(ões) neste preset',
      stateApplied: 'Ativo',
      statePartial: 'Parcial',
      confirmRevert: 'Reverter TODAS as otimizações ativas e restaurar o Windows ao padrão. Continuar?',
      confirmApply: 'Aplicar o preset "{name}"? Isso ativará {count} otimização(ões).',
      resultReset: 'Todas as otimizações foram revertidas ({count}).',
      resultApplied: 'Preset "{name}": {applied} aplicada(s), {skipped} já ativa(s).',
      resultFailedCount: '{count} ajuste(s) falharam ao aplicar o preset.',
      resultFailed: 'Falha ao aplicar o preset.',
      stepApplying: 'Aplicando: {title}',
      stepApplied: 'Verificado ✓',
      stepFailed: 'Falhou',
      stepSkipped: 'Já ativo, pulando...',
      items: {
        gaming: {
          name: 'Modo Gaming',
          description: 'Aplica todos os ajustes de baixa latência, prioridade de CPU e resposta do mouse para máxima performance em jogos.',
        },
        privacy: {
          name: 'Modo Privacidade',
          description: 'Bloqueia telemetria, rastreamento, localização e coleta de dados do Windows.',
        },
        minimalist: {
          name: 'Modo Minimalista',
          description: 'Remove elementos visuais desnecessários, sugestões e serviços de UI, deixando o Windows mais leve.',
        },
        network: {
          name: 'Modo Rede',
          description: 'Otimiza exclusivamente latência e throughput de rede. Útil para jogos online e streaming.',
        },
        reset: {
          name: 'Reverter Tudo',
          description: 'Desativa TODAS as otimizações ativas e restaura o Windows ao estado original.',
        },
      },
      gameMode: {
        title: 'Modo de Jogo Adaptativo',
        description: 'Detecta automaticamente quando um jogo abre e aplica o preset Gaming. Reverte ao fechar.',
        monitoring: 'Monitorando',
        gameActive: 'Jogo Ativo',
        detectedGame: 'Jogo detectado',
        enable: 'Ativar',
        disable: 'Desativar',
        waiting: 'Aguarde...',
        needsAdmin: 'Reinicie o C-Optimizer como Administrador para usar o Modo de Jogo.',
      },
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
    },
    systemFixer: {
      title: 'Reparos',
      subtitle: 'Diagnóstico e correção de arquivos de sistema'
    }
  },
  'en-US': {
    sidebar: {
      dashboard: 'Dashboard',
      presets: 'Presets',
      optimizations: 'Optimizations',
      cleanup: 'Cleanup',
      restore: 'Restore',
      apps: 'Apps',
      settings: 'Settings',
      auth: 'Authentication',
      systemFixer: 'Repair',
    },
    header: {
      statusProtected: 'System Optimized',
      statusPending: 'Optimization Pending',
      activeTweaks: 'active',
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
      os: 'Operating System',
            applyGamingPreset: 'Apply Gaming Preset',
      applyGamingPresetSub: 'One click for minimum latency and CPU priority',
      presetApplying: 'Applying preset...',
      presetApplied: 'Gaming preset applied! ({applied} enabled, {skipped} already active)',
      presetFailed: 'Failed to apply the Gaming preset.',
      needsAdmin: 'Some Gaming preset tweaks require administrator. Restart C-Optimizer as Administrator to apply them.',
    },
    optimizations: {
      title: 'Optimizations',
      subtitle: 'Enable specific tweaks to improve performance',
      searchPlaceholder: 'Search optimization...',
      all: 'All',
      empty: 'No optimizations found.'
    },
    presets: {
      subtitle: 'Apply multiple tweaks at once with one click',
      loading: 'Loading presets...',
      hint: 'Presets apply multiple tweaks at once. Already active tweaks are skipped. You can revert any preset individually in the Optimizations tab.',
      apply: 'Apply Preset',
      revertAll: 'Revert All',
      applying: 'Applying...',
      starting: 'Starting...',
      tweakCount: '{count} tweak(s) in this preset',
      stateApplied: 'Active',
      statePartial: 'Partial',
      confirmRevert: 'Revert ALL active optimizations and restore Windows to default. Continue?',
      confirmApply: 'Apply preset "{name}"? This will enable {count} tweak(s).',
      resultReset: 'All optimizations were reverted ({count}).',
      resultApplied: 'Preset "{name}": {applied} applied, {skipped} already active.',
      resultFailedCount: '{count} tweak(s) failed to apply in the preset.',
      resultFailed: 'Failed to apply the preset.',
      stepApplying: 'Applying: {title}',
      stepApplied: 'Verified ✓',
      stepFailed: 'Failed',
      stepSkipped: 'Already active, skipping...',
      items: {
        gaming: {
          name: 'Gaming Mode',
          description: 'Applies all low-latency, CPU priority and mouse responsiveness tweaks for maximum gaming performance.',
        },
        privacy: {
          name: 'Privacy Mode',
          description: 'Blocks telemetry, tracking, location and data collection from Windows.',
        },
        minimalist: {
          name: 'Minimalist Mode',
          description: 'Removes unnecessary visual elements, suggestions and UI services, making Windows lighter.',
        },
        network: {
          name: 'Network Mode',
          description: 'Optimizes exclusively network latency and throughput. Useful for online gaming and streaming.',
        },
        reset: {
          name: 'Revert All',
          description: 'Disables ALL active optimizations and restores Windows to its original state.',
        },
      },
      gameMode: {
        title: 'Adaptive Game Mode',
        description: 'Automatically detects when a game launches and applies the Gaming preset. Reverts on close.',
        monitoring: 'Monitoring',
        gameActive: 'Game Active',
        detectedGame: 'Detected game',
        enable: 'Enable',
        disable: 'Disable',
        waiting: 'Please wait...',
        needsAdmin: 'Restart C-Optimizer as Administrator to use Game Mode.',
      },
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
    },
    systemFixer: {
      title: 'Repair',
      subtitle: 'Diagnosis and repair of system files'
    }
  },
  'es-ES': {
    sidebar: {
      dashboard: 'Panel',
      presets: 'Presets',
      optimizations: 'Optimizaciones',
      cleanup: 'Limpieza',
      restore: 'Restauración',
      apps: 'Aplicaciones',
      settings: 'Configuración',
      auth: 'Autenticación',
      systemFixer: 'Reparo',
    },
    header: {
      statusProtected: 'Sistema Optimizado',
      statusPending: 'Optimización Pendiente',
      activeTweaks: 'activos',
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
      os: 'Sistema Operativo',
            applyGamingPreset: 'Aplicar Preset Gaming',
      applyGamingPresetSub: 'Un clic para latencia mínima y prioridad de CPU',
      presetApplying: 'Aplicando preset...',
      presetApplied: '¡Preset Gaming aplicado! ({applied} activados, {skipped} ya activos)',
      presetFailed: 'Error al aplicar el preset Gaming.',
      needsAdmin: 'Algunos ajustes del preset Gaming requieren administrador. Reinicia C-Optimizer como Administrador para aplicarlos.',
    },
    optimizations: {
      title: 'Optimizaciones',
      subtitle: 'Activa ajustes específicos para mejorar el rendimiento',
      searchPlaceholder: 'Buscar optimización...',
      all: 'Todas',
      empty: 'No se encontraron optimizaciones.'
    },
    presets: {
      subtitle: 'Aplica múltiples ajustes a la vez con un solo clic',
      loading: 'Cargando presets...',
      hint: 'Los presets aplican múltiples ajustes a la vez. Los ya activos se omiten. Puedes revertir cualquier preset individualmente en la pestaña Optimizaciones.',
      apply: 'Aplicar Preset',
      revertAll: 'Revertir Todo',
      applying: 'Aplicando...',
      starting: 'Iniciando...',
      tweakCount: '{count} ajuste(s) en este preset',
      stateApplied: 'Activo',
      statePartial: 'Parcial',
      confirmRevert: '¿Revertir TODAS las optimizaciones activas y restaurar Windows al estado predeterminado?',
      confirmApply: '¿Aplicar el preset "{name}"? Esto activará {count} ajuste(s).',
      resultReset: 'Todas las optimizaciones fueron revertidas ({count}).',
      resultApplied: 'Preset "{name}": {applied} aplicado(s), {skipped} ya activo(s).',
      resultFailedCount: '{count} ajuste(s) no pudieron aplicarse en el preset.',
      resultFailed: 'Error al aplicar el preset.',
      stepApplying: 'Aplicando: {title}',
      stepApplied: 'Verificado ✓',
      stepFailed: 'Falló',
      stepSkipped: 'Ya activo, omitiendo...',
      items: {
        gaming: {
          name: 'Modo Gaming',
          description: 'Aplica todos los ajustes de baja latencia, prioridad de CPU y respuesta del ratón para máximo rendimiento en juegos.',
        },
        privacy: {
          name: 'Modo Privacidad',
          description: 'Bloquea telemetría, rastreo, ubicación y recolección de datos de Windows.',
        },
        minimalist: {
          name: 'Modo Minimalista',
          description: 'Elimina elementos visuales innecesarios, sugerencias y servicios de UI, haciendo Windows más ligero.',
        },
        network: {
          name: 'Modo Red',
          description: 'Optimiza exclusivamente latencia y rendimiento de red. Útil para juegos en línea y streaming.',
        },
        reset: {
          name: 'Revertir Todo',
          description: 'Desactiva TODAS las optimizaciones activas y restaura Windows a su estado original.',
        },
      },
      gameMode: {
        title: 'Modo de Juego Adaptativo',
        description: 'Detecta automáticamente cuando un juego se abre y aplica el preset Gaming. Revierte al cerrar.',
        monitoring: 'Monitoreando',
        gameActive: 'Juego Activo',
        detectedGame: 'Juego detectado',
        enable: 'Activar',
        disable: 'Desactivar',
        waiting: 'Espera...',
        needsAdmin: 'Reinicia C-Optimizer como Administrador para usar el Modo de Juego.',
      },
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
    },
    systemFixer: {
      title: 'Reparo',
      subtitle: 'Diagnóstico y corrección de archivos del sistema'
    },
  }
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState('pt-BR');
  const [languageLoaded, setLanguageLoaded] = useState(false);

  // Carrega o idioma persistido assim que o app abre,
  // independente de qual view está ativa no momento.
  useEffect(() => {
    let isMounted = true;

    async function loadPersistedLanguage() {
      try {
        const savedLanguage = await window.electronAPI.invoke('settings:get-language');
        if (isMounted && savedLanguage) {
          setLanguage(savedLanguage);
        }
      } catch (error) {
        console.error('Erro ao carregar idioma salvo:', error);
      } finally {
        if (isMounted) setLanguageLoaded(true);
      }
    }

    loadPersistedLanguage();
    return () => {
      isMounted = false;
    };
  }, []);

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
    <LanguageContext.Provider value={{ language, setLanguage, t, languageLoaded }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error('useLanguage deve ser usado dentro de LanguageProvider');
  return ctx;
}