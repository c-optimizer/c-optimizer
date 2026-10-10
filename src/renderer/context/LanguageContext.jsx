import React, { createContext, useContext, useState, useMemo, useEffect } from 'react';

const translations = {
  'pt-BR': {
    sidebar: {
      dashboard: 'Painel',
      presets: 'Presets',
      optimizations: 'Otimizações',
      cleanup: 'Limpeza',
      network: 'Rede',
      drivers: 'Drivers',
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
    network: {
      title: 'Rede & DNS',
      subtitle: 'Otimize a latência das suas consultas DNS',
    },
    drivers: {
      title: 'Central de Drivers',
      subtitle: 'Diagnóstico e links oficiais dos seus drivers',
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
      notifications: 'Notificações do sistema',
      backup: {
        title: 'Backup de Configurações',
        description: 'Exporte suas preferências (idioma, tweaks ativos, brilho) para um arquivo .json que pode ser importado em outro PC. Snapshots e licença não são incluídos por segurança.',
        exportButton: 'Exportar backup',
        exporting: 'Exportando...',
        importButton: 'Importar backup',
        importing: 'Importando...',
        exportSuccess: 'Backup salvo em: {path}',
        exportError: 'Não foi possível salvar o backup.',
        importSuccess: '{count} preferência(s) importada(s): {list}.',
        importNoChanges: 'Backup importado. Nenhuma preferência nova para aplicar.',
        importError: 'Não foi possível importar o backup.',
        tweaksPending: '{count} tweak(s) ativos no backup',
        tweaksPendingHint: 'Vá para Otimizações e ative os que desejar novamente — os toggles já aparecerão prontos para reativar.',
      },
            changeLabels: {
        language: 'Idioma',
        startup: 'Iniciar com Windows',
        minimizeTray: 'Minimizar para bandeja',
        notifications: 'Notificações',
      },
      backupTweaks: {
        title: '{count} tweak(s) do backup ainda não estão ativos',
        hint: 'Você pode aplicar todos de uma vez. Ajustes que exigem administrador pedirão confirmação.',
        applyButton: 'Aplicar tweaks do backup',
        applying: 'Aplicando...',
        successMsg: '{applied} tweak(s) aplicado(s), {skipped} já estava(m) ativo(s).',
        partialMsg: '{applied} aplicado(s), {skipped} ignorado(s), {failed} falhou(aram).',
        errorMsg: 'Falha ao aplicar os tweaks do backup.',
        needsAdmin: 'Reinicie o C-Optimizer como Administrador para aplicar os tweaks com privilégio.',
        errNeedsAdmin: 'Reinicie o C-Optimizer como Administrador para aplicar os tweaks com privilégio.',
        errTweakMissing: 'Um ou mais tweaks não existem mais nesta versão do app.',
        errUnsupportedWindows: 'Um ou mais tweaks não são suportados nesta versão do Windows.',
        errApplyFailed: 'Falha ao aplicar um ou mais tweaks.',
      },
      diagnostics: {
        title: 'Diagnóstico',
        description: 'Copie os logs recentes do aplicativo para compartilhar com o suporte caso algo não funcione como esperado.',
        copyButton: 'Copiar Logs de Diagnóstico',
        copying: 'Copiando...',
        copySuccess: 'Logs copiados para a área de transferência!',
        copyError: 'Não foi possível copiar os logs.',
      },
      changelog: {
        title: 'Notas de Atualização',
        viewButton: 'Ver Changelog',
        loading: 'Carregando...',
      },
      emergency: {
        title: 'Zona de Emergência',
        description: 'Se alguma otimização causar instabilidade, use o botão abaixo para desfazer todas de uma vez e restaurar o Windows às configurações padrão.',
        revertButton: 'Restaurar Todas as Otimizações Padrão',
        reverting: 'Restaurando...',
        confirm: 'Isso vai desfazer TODAS as otimizações ativas atualmente, restaurando o Windows para as configurações padrão. Deseja continuar?',
        revertSuccess: '{count} otimização(ões) restaurada(s) com sucesso!',
        revertNone: 'Nenhuma otimização estava ativa no momento.',
        revertFailed: '{count} otimização(ões) não puderam ser restauradas.',
        revertFailedGeneric: 'Falha ao restaurar as otimizações.',
      },
      about: 'Sobre',
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
      network: 'Network',
      drivers: 'Drivers',
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
    network: {
      title: 'Network & DNS',
      subtitle: 'Optimize the latency of your DNS queries',
    },
    drivers: {
      title: 'Driver Center',
      subtitle: 'Diagnostics and official links for your drivers',
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
      notifications: 'System notifications',
      backup: {
        title: 'Settings Backup',
        description: 'Export your preferences (language, active tweaks, brightness) to a .json file that can be imported on another PC. Snapshots and license are not included for security.',
        exportButton: 'Export backup',
        exporting: 'Exporting...',
        importButton: 'Import backup',
        importing: 'Importing...',
        exportSuccess: 'Backup saved to: {path}',
        exportError: 'Could not save the backup.',
        importSuccess: '{count} preference(s) imported: {list}.',
        importNoChanges: 'Backup imported. No new preferences to apply.',
        importError: 'Could not import the backup.',
        tweaksPending: '{count} active tweak(s) in the backup',
        tweaksPendingHint: 'Go to Optimizations and enable the ones you want — the toggles will already be ready to re-enable.',
      },
            changeLabels: {
        language: 'Language',
        startup: 'Start with Windows',
        minimizeTray: 'Minimize to tray',
        notifications: 'Notifications',
      },
      backupTweaks: {
        title: '{count} backup tweak(s) are not active yet',
        hint: 'You can apply them all at once. Tweaks that require administrator will ask for confirmation.',
        applyButton: 'Apply backup tweaks',
        applying: 'Applying...',
        successMsg: '{applied} tweak(s) applied, {skipped} already active.',
        partialMsg: '{applied} applied, {skipped} skipped, {failed} failed.',
        errorMsg: 'Failed to apply backup tweaks.',
        needsAdmin: 'Restart C-Optimizer as Administrator to apply the tweaks.',
                errNeedsAdmin: 'Restart C-Optimizer as Administrator to apply the privileged tweaks.',
        errTweakMissing: 'One or more tweaks no longer exist in this app version.',
        errUnsupportedWindows: 'One or more tweaks are not supported on this Windows version.',
        errApplyFailed: 'Failed to apply one or more tweaks.',
      },
      diagnostics: {
        title: 'Diagnostics',
        description: 'Copy the recent application logs to share with support if something does not work as expected.',
        copyButton: 'Copy Diagnostic Logs',
        copying: 'Copying...',
        copySuccess: 'Logs copied to clipboard!',
        copyError: 'Could not copy the logs.',
      },
      changelog: {
        title: 'Release Notes',
        viewButton: 'View Changelog',
        loading: 'Loading...',
      },
      emergency: {
        title: 'Emergency Zone',
        description: 'If any optimization causes instability, use the button below to undo everything at once and restore Windows to default settings.',
        revertButton: 'Restore All Default Optimizations',
        reverting: 'Restoring...',
        confirm: 'This will undo ALL currently active optimizations, restoring Windows to default settings. Continue?',
        revertSuccess: '{count} optimization(s) restored successfully!',
        revertNone: 'No optimization was active at the moment.',
        revertFailed: '{count} optimization(s) could not be restored.',
        revertFailedGeneric: 'Failed to restore optimizations.',
      },
      about: 'About',
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
      network: 'Red',
      drivers: 'Drivers',
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
    network: {
      title: 'Red y DNS',
      subtitle: 'Optimiza la latencia de tus consultas DNS',
    },
    drivers: {
      title: 'Centro de Drivers',
      subtitle: 'Diagnóstico y enlaces oficiales de tus drivers',
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
      notifications: 'Notificaciones del sistema',
      backup: {
        title: 'Backup de Configuración',
        description: 'Exporta tus preferencias (idioma, ajustes activos, brillo) a un archivo .json que se puede importar en otra PC. Snapshots y licencia no se incluyen por seguridad.',
        exportButton: 'Exportar backup',
        exporting: 'Exportando...',
        importButton: 'Importar backup',
        importing: 'Importando...',
        exportSuccess: 'Backup guardado en: {path}',
        exportError: 'No se pudo guardar el backup.',
        importSuccess: '{count} preferencia(s) importada(s): {list}.',
        importNoChanges: 'Backup importado. No hay nuevas preferencias para aplicar.',
        importError: 'No se pudo importar el backup.',
        tweaksPending: '{count} ajuste(s) activos en el backup',
        tweaksPendingHint: 'Ve a Optimizaciones y activa los que desees — los interruptores ya estarán listos para reactivar.',
      },
            changeLabels: {
        language: 'Idioma',
        startup: 'Iniciar con Windows',
        minimizeTray: 'Minimizar a bandeja',
        notifications: 'Notificaciones',
      },
      backupTweaks: {
        title: '{count} ajuste(s) del backup aún no están activos',
        hint: 'Puedes aplicarlos todos a la vez. Los que requieran administrador pedirán confirmación.',
        applyButton: 'Aplicar ajustes del backup',
        applying: 'Aplicando...',
        successMsg: '{applied} ajuste(s) aplicado(s), {skipped} ya estaba(n) activo(s).',
        partialMsg: '{applied} aplicado(s), {skipped} omitido(s), {failed} falló(aron).',
        errorMsg: 'Error al aplicar los ajustes del backup.',
        needsAdmin: 'Reinicia C-Optimizer como Administrador para aplicar los ajustes.',
                errNeedsAdmin: 'Reinicia C-Optimizer como Administrador para aplicar los ajustes privilegiados.',
        errTweakMissing: 'Uno o más ajustes ya no existen en esta versión de la app.',
        errUnsupportedWindows: 'Uno o más ajustes no son compatibles con esta versión de Windows.',
        errApplyFailed: 'Error al aplicar uno o más ajustes.',
      },
      diagnostics: {
        title: 'Diagnóstico',
        description: 'Copia los registros recientes de la aplicación para compartir con el soporte si algo no funciona como se espera.',
        copyButton: 'Copiar Registros de Diagnóstico',
        copying: 'Copiando...',
        copySuccess: '¡Registros copiados al portapapeles!',
        copyError: 'No se pudieron copiar los registros.',
      },
      changelog: {
        title: 'Notas de Actualización',
        viewButton: 'Ver Changelog',
        loading: 'Cargando...',
      },
      emergency: {
        title: 'Zona de Emergencia',
        description: 'Si alguna optimización causa inestabilidad, usa el botón de abajo para deshacer todo de una vez y restaurar Windows a la configuración predeterminada.',
        revertButton: 'Restaurar Todas las Optimizaciones',
        reverting: 'Restaurando...',
        confirm: 'Esto deshará TODAS las optimizaciones activas, restaurando Windows a la configuración predeterminada. ¿Continuar?',
        revertSuccess: '¡{count} optimización(es) restaurada(s) con éxito!',
        revertNone: 'Ninguna optimización estaba activa en el momento.',
        revertFailed: '{count} optimización(es) no pudieron restaurarse.',
        revertFailedGeneric: 'Error al restaurar las optimizaciones.',
      },
      about: 'Acerca de',
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