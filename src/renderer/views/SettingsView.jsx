import React, { useEffect, useState } from 'react';
import {
  Globe, Info, Loader2, ClipboardCopy, CheckCircle2, AlertCircle,
  ShieldAlert, RotateCcw, FileText, Package, Upload, Download, X
} from 'lucide-react';
import ToggleSwitch from '../components/ToggleSwitch';
import { useLanguage } from '../context/LanguageContext';

const languageOptions = [
  { code: 'pt-BR', label: 'Português (Brasil)' },
  { code: 'en-US', label: 'English (US)' },
  { code: 'es-ES', label: 'Español (España)' }
];

/**
 * Traduz um "descritor de mensagem" para { type, text } no momento do render.
 * Isso garante que a mensagem sempre use o idioma ATIVO — mesmo quando o
 * idioma muda como efeito colateral de um import de backup.
 */
function formatConfigMsg(msg, t) {
  if (!msg) return null;
  switch (msg.kind) {
    case 'exportSuccess':
      return { type: 'ok', text: t('settings.backup.exportSuccess').replace('{path}', msg.path) };
    case 'raw':
      return { type: msg.type || 'err', text: msg.text };
    case 'backupError':
      return { type: 'err', text: t(msg.errorKey || 'settings.backup.exportError') };
    case 'importSuccess': {
      const list = (msg.changes || [])
        .map((id) => t(`settings.changeLabels.${id}`))
        .join(', ');
      return {
        type: 'ok',
        text: t('settings.backup.importSuccess')
          .replace('{count}', msg.count)
          .replace('{list}', list),
      };
    }
    case 'importNoChanges':
      return { type: 'ok', text: t('settings.backup.importNoChanges') };
    case 'applyTweaksSuccess':
      return {
        type: 'ok',
        text: t('settings.backupTweaks.successMsg')
          .replace('{applied}', msg.applied)
          .replace('{skipped}', msg.skipped),
      };
    case 'applyTweaksPartial':
      return {
        type: 'err',
        text: t('settings.backupTweaks.partialMsg')
          .replace('{applied}', msg.applied)
          .replace('{skipped}', msg.skipped)
          .replace('{failed}', msg.failed),
      };
    case 'applyTweaksError':
      return { type: 'err', text: t(msg.errorKey || 'settings.backupTweaks.errorMsg') };
    default:
      return null;
  }
}

function SettingsView() {
  const { language, setLanguage, t } = useLanguage();
  const [startup, setStartup] = useState(false);
  const [minimizeTray, setMinimizeTray] = useState(true);
  const [loading, setLoading] = useState(true);

  const [copyingLogs, setCopyingLogs] = useState(false);
  const [copyMsg, setCopyMsg] = useState(null);

  const [reverting, setReverting] = useState(false);
  const [revertMsg, setRevertMsg] = useState(null);
  const [revertError, setRevertError] = useState(null);

  const [notifications, setNotifications] = useState(true);
  const [changelogOpen, setChangelogOpen] = useState(false);
  const [changelog, setChangelog] = useState([]);
  const [loadingChangelog, setLoadingChangelog] = useState(false);
  const [changelogError, setChangelogError] = useState(null);

  // configMsg agora armazena um DESCRITOR (não string pré-formatada).
  const [configMsg, setConfigMsg] = useState(null);
  const [pendingTweaks, setPendingTweaks] = useState(null);
  const [applyingTweaks, setApplyingTweaks] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadSettings() {
      try {
        const settings = await window.electronAPI.invoke('settings:get');
        if (isMounted) {
          setStartup(settings.startup);
          setMinimizeTray(settings.minimizeTray);
          setNotifications(settings.notifications !== false);
          setLoading(false);
        }
      } catch (error) {
        console.error('Erro ao carregar configurações:', error);
        if (isMounted) setLoading(false);
      }
    }

    loadSettings();
    return () => { isMounted = false; };
  }, []);

  const handleLanguageChange = async (code) => {
    setLanguage(code);
    await window.electronAPI.invoke('settings:set-language', code);
  };

  const handleStartupChange = async (value) => {
    setStartup(value);
    await window.electronAPI.invoke('settings:set', { startup: value });
  };

  const handleMinimizeTrayChange = async (value) => {
    setMinimizeTray(value);
    await window.electronAPI.invoke('settings:set', { minimizeTray: value });
  };

  const handleNotificationsChange = async (value) => {
    setNotifications(value);
    await window.electronAPI.invoke('settings:set', { notifications: value });
  };

  const handleOpenChangelog = async () => {
    setChangelogOpen(true);
    setLoadingChangelog(true);
    setChangelogError(null);
    try {
      const result = await window.electronAPI.invoke('system:get-changelog');
      if (result.success) {
        setChangelog(result.releases);
      } else {
        setChangelogError(result.error);
      }
    } catch (error) {
      setChangelogError(error.message);
    } finally {
      setLoadingChangelog(false);
    }
  };

  const handleCopyLogs = async () => {
    setCopyingLogs(true);
    setCopyMsg(null);
    try {
      const result = await window.electronAPI.invoke('system:copy-logs');
      if (result.success) {
        setCopyMsg({ type: 'success', text: t('settings.diagnostics.copySuccess') });
      } else {
        setCopyMsg({ type: 'error', text: result.error || t('settings.diagnostics.copyError') });
      }
    } catch (error) {
      setCopyMsg({ type: 'error', text: error.message });
    } finally {
      setCopyingLogs(false);
      setTimeout(() => setCopyMsg(null), 4000);
    }
  };

  const handleRevertAll = async () => {
    const confirmed = window.confirm(t('settings.emergency.confirm'));
    if (!confirmed) return;

    setReverting(true);
    setRevertMsg(null);
    setRevertError(null);

    try {
      const result = await window.electronAPI.invoke('tweaks:revert-all');

      if (result.reverted && result.reverted.length > 0) {
        setRevertMsg(t('settings.emergency.revertSuccess').replace('{count}', result.reverted.length));
      }

      if (!result.success) {
        const failedCount = result.failed?.length || 0;
        setRevertError(
          result.error ||
          (failedCount > 0
            ? t('settings.emergency.revertFailed').replace('{count}', failedCount)
            : t('settings.emergency.revertFailedGeneric'))
        );
      }

      if (result.success && (!result.reverted || result.reverted.length === 0)) {
        setRevertMsg(t('settings.emergency.revertNone'));
      }
    } catch (error) {
      setRevertError(error.message);
    } finally {
      setReverting(false);
    }
  };

  const handleExportConfig = async () => {
    setExportingConfig(true);
    setConfigMsg(null);
    try {
      const result = await window.electronAPI.invoke('config:export');
      if (result.success) {
        setConfigMsg({ kind: 'exportSuccess', path: result.filePath });
      } else if (!result.cancelled) {
        // Se o backend mandou errorCode, mostra a tradução; senão, raw.
        if (result.errorCode === 'ERR_SAVE_FAILED') {
          setConfigMsg({ kind: 'raw', type: 'err', text: result.error || 'Save failed' });
        } else {
          setConfigMsg({ kind: 'backupError', errorKey: 'settings.backup.exportError' });
        }
      }
    } catch (error) {
      setConfigMsg({ kind: 'raw', type: 'err', text: error.message });
    } finally {
      setExportingConfig(false);
      setTimeout(() => setConfigMsg(null), 8000);
    }
  };

  const handleImportConfig = async () => {
    setImportingConfig(true);
    setConfigMsg(null);
    setPendingTweaks(null);
    try {
      const result = await window.electronAPI.invoke('config:import');
      if (result.success) {
        const changedCount = result.changes?.length || 0;

        // Salva descritor — render aplica t() no idioma ATUAL
        if (changedCount > 0) {
          setConfigMsg({ kind: 'importSuccess', count: changedCount, changes: result.changes });
        } else {
          setConfigMsg({ kind: 'importNoChanges' });
        }

        if (result.pendingTweaks && result.pendingTweaks.length > 0) {
          setPendingTweaks(result.pendingTweaks);
        }

        const settings = await window.electronAPI.invoke('settings:get');
        setStartup(settings.startup);
        setMinimizeTray(settings.minimizeTray);
        setNotifications(settings.notifications !== false);

        // Aplica idioma imediatamente. Como configMsg é um descritor, o
        // próximo render vai traduzir a mensagem com o NOVO idioma.
        if (settings.language && settings.language !== language) {
          setLanguage(settings.language);
        }
      } else if (!result.cancelled) {
        if (result.errorCode === 'ERR_FILE_READ') {
          setConfigMsg({ kind: 'raw', type: 'err', text: result.error || 'Invalid file' });
        } else if (result.errorCode === 'ERR_APPLY_FAILED') {
          setConfigMsg({ kind: 'raw', type: 'err', text: result.error || 'Apply failed' });
        } else {
          setConfigMsg({ kind: 'backupError', errorKey: 'settings.backup.importError' });
        }
      }
    } catch (error) {
      setConfigMsg({ kind: 'raw', type: 'err', text: error.message });
    } finally {
      setImportingConfig(false);
    }
  };

  const handleApplyBackupTweaks = async () => {
    if (!pendingTweaks || pendingTweaks.length === 0) return;
    setApplyingTweaks(true);
    try {
      const result = await window.electronAPI.invoke('config:apply-imported-tweaks', pendingTweaks);

      const errorCodeToKey = {
        ERR_NEEDS_ADMIN: 'settings.backupTweaks.errNeedsAdmin',
        ERR_TWEAK_MISSING: 'settings.backupTweaks.errTweakMissing',
        ERR_UNSUPPORTED_WINDOWS: 'settings.backupTweaks.errUnsupportedWindows',
        ERR_APPLY_FAILED: 'settings.backupTweaks.errApplyFailed',
      };

      if (result.success) {
        setConfigMsg({
          kind: 'applyTweaksSuccess',
          applied: result.applied.length,
          skipped: result.skipped.length,
        });
        setPendingTweaks(null);
      } else {
        const applied = result.applied?.length || 0;
        const skipped = result.skipped?.length || 0;
        const failed = result.failed?.length || 0;

        if (result.errorCode && errorCodeToKey[result.errorCode]) {
          setConfigMsg({ kind: 'applyTweaksError', errorKey: errorCodeToKey[result.errorCode] });
        } else if (applied + skipped > 0) {
          setConfigMsg({ kind: 'applyTweaksPartial', applied, skipped, failed });
        } else {
          setConfigMsg({ kind: 'applyTweaksError', errorKey: 'settings.backupTweaks.errorMsg' });
        }

        if (applied > 0) setPendingTweaks(null);
      }
    } catch (error) {
      setConfigMsg({ kind: 'raw', type: 'err', text: error.message });
    } finally {
      setApplyingTweaks(false);
      setTimeout(() => setConfigMsg(null), 8000);
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center gap-2 text-slate-500 text-sm">
        <Loader2 size={16} className="animate-spin" />
        {t('settings.title')}...
      </div>
    );
  }

  // Traduz o descritor para { type, text } no momento do render
  const renderedConfigMsg = formatConfigMsg(configMsg, t);

  return (
    <div className="p-8 flex flex-col gap-6 max-w-2xl">
      <div className="bg-c-surface border border-c-border rounded-xl p-5 flex flex-col gap-4">
        <div className="flex items-center gap-2 text-slate-200 font-semibold">
          <Globe size={16} className="text-c-secondary" />
          {t('settings.language')}
        </div>
        <div className="flex gap-2">
          {languageOptions.map((opt) => (
            <button
              key={opt.code}
              onClick={() => handleLanguageChange(opt.code)}
              className={`px-3 py-2 rounded-lg text-sm border transition-colors
                ${language === opt.code
                  ? 'border-c-primary text-c-primary bg-c-primary/10'
                  : 'border-c-border text-slate-400 hover:text-slate-200'}
              `}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-c-surface border border-c-border rounded-xl p-5 flex flex-col divide-y divide-c-border">
        <div className="flex items-center justify-between py-3 first:pt-0">
          <span className="text-sm text-slate-300">{t('settings.startup')}</span>
          <ToggleSwitch checked={startup} onChange={handleStartupChange} />
        </div>
        <div className="flex items-center justify-between py-3">
          <span className="text-sm text-slate-300">{t('settings.minimizeTray')}</span>
          <ToggleSwitch checked={minimizeTray} onChange={handleMinimizeTrayChange} />
        </div>
        <div className="flex items-center justify-between py-3 last:pb-0">
          <span className="text-sm text-slate-300">{t('settings.notifications')}</span>
          <ToggleSwitch checked={notifications} onChange={handleNotificationsChange} />
        </div>
      </div>

      {/* Backup de Configurações */}
      <div className="bg-c-surface border border-c-border rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-slate-200 font-semibold">
          <Package size={16} className="text-c-secondary" />
          {t('settings.backup.title')}
        </div>
        <p className="text-slate-500 text-xs -mt-1">
          {t('settings.backup.description')}
        </p>

        {renderedConfigMsg && (
          <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 border ${
            renderedConfigMsg.type === 'ok'
              ? 'text-c-primary bg-c-primary/10 border-c-primary/30'
              : 'text-c-danger bg-c-danger/10 border-c-danger/30'
          }`}>
            {renderedConfigMsg.type === 'ok'
              ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" />
              : <AlertCircle size={14} className="mt-0.5 shrink-0" />}
            <span className="break-all">{renderedConfigMsg.text}</span>
          </div>
        )}

        {pendingTweaks && pendingTweaks.length > 0 && (
          <div className="flex flex-col gap-3 text-xs bg-c-bg border border-c-secondary/30 rounded-lg px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <p className="text-slate-200 font-medium">
                {t('settings.backupTweaks.title').replace('{count}', pendingTweaks.length)}
              </p>
              <button
                onClick={() => setPendingTweaks(null)}
                className="text-slate-500 hover:text-slate-300 shrink-0"
                disabled={applyingTweaks}
              >
                <X size={12} />
              </button>
            </div>
            <p className="text-slate-500">{t('settings.backupTweaks.hint')}</p>
            <button
              onClick={handleApplyBackupTweaks}
              disabled={applyingTweaks}
              className="self-start flex items-center gap-2 px-3 py-2 rounded-lg border border-c-secondary/40 text-c-secondary text-xs font-medium hover:bg-c-secondary/10 transition-colors disabled:opacity-50"
            >
              {applyingTweaks ? <Loader2 size={12} className="animate-spin" /> : <Package size={12} />}
              {applyingTweaks ? t('settings.backupTweaks.applying') : t('settings.backupTweaks.applyButton')}
            </button>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            onClick={handleExportConfig}
            disabled={exportingConfig}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-c-secondary/40 text-c-secondary text-sm font-medium hover:bg-c-secondary/10 transition-colors disabled:opacity-50"
          >
            {exportingConfig ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {exportingConfig ? t('settings.backup.exporting') : t('settings.backup.exportButton')}
          </button>
          <button
            onClick={handleImportConfig}
            disabled={importingConfig}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-c-border text-slate-300 text-sm font-medium hover:text-slate-100 hover:border-slate-500 transition-colors disabled:opacity-50"
          >
            {importingConfig ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            {importingConfig ? t('settings.backup.importing') : t('settings.backup.importButton')}
          </button>
        </div>
      </div>

      {/* Diagnóstico */}
      <div className="bg-c-surface border border-c-border rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-slate-200 font-semibold">
          <ClipboardCopy size={16} className="text-c-secondary" />
          {t('settings.diagnostics.title')}
        </div>
        <p className="text-slate-500 text-xs -mt-1">
          {t('settings.diagnostics.description')}
        </p>

        {copyMsg && (
          <div
            className={`flex items-center gap-2 text-xs rounded-lg px-3 py-2 border ${
              copyMsg.type === 'success'
                ? 'text-c-primary bg-c-primary/10 border-c-primary/30'
                : 'text-c-danger bg-c-danger/10 border-c-danger/30'
            }`}
          >
            {copyMsg.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
            {copyMsg.text}
          </div>
        )}

        <button
          onClick={handleCopyLogs}
          disabled={copyingLogs}
          className="self-start flex items-center gap-2 px-4 py-2 rounded-lg border border-c-secondary/40 text-c-secondary text-sm font-medium hover:bg-c-secondary/10 transition-colors disabled:opacity-50"
        >
          {copyingLogs ? <Loader2 size={14} className="animate-spin" /> : <ClipboardCopy size={14} />}
          {copyingLogs ? t('settings.diagnostics.copying') : t('settings.diagnostics.copyButton')}
        </button>
      </div>

      {/* Notas de Atualização */}
      <div className="bg-c-surface border border-c-border rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-slate-200 font-semibold">
          <FileText size={16} className="text-c-secondary" />
          {t('settings.changelog.title')}
        </div>
        <button
          onClick={handleOpenChangelog}
          className="self-start flex items-center gap-2 px-4 py-2 rounded-lg border border-c-secondary/40 text-c-secondary text-sm font-medium hover:bg-c-secondary/10 transition-colors"
        >
          {t('settings.changelog.viewButton')}
        </button>

        {changelogOpen && (
          <div className="mt-2 flex flex-col gap-3 max-h-64 overflow-y-auto">
            {loadingChangelog && (
              <div className="flex items-center gap-2 text-slate-500 text-xs">
                <Loader2 size={14} className="animate-spin" /> {t('settings.changelog.loading')}
              </div>
            )}
            {changelogError && <p className="text-c-danger text-xs">{changelogError}</p>}
            {changelog.map((release) => (
              <div key={release.version} className="bg-c-bg border border-c-border rounded-lg p-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-200 text-sm font-semibold">{release.name}</span>
                  <span className="text-slate-500 text-[10px]">
                    {new Date(release.publishedAt).toLocaleDateString()}
                  </span>
                </div>
                <p className="text-slate-500 text-xs mt-1 whitespace-pre-line line-clamp-4">{release.notes}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zona de risco */}
      <div className="bg-c-surface border border-c-danger/30 rounded-xl p-5 flex flex-col gap-3">
        <div className="flex items-center gap-2 text-c-danger font-semibold">
          <ShieldAlert size={16} />
          {t('settings.emergency.title')}
        </div>
        <p className="text-slate-500 text-xs -mt-1">
          {t('settings.emergency.description')}
        </p>

        {revertMsg && (
          <div className="flex items-center gap-2 text-c-primary text-xs bg-c-primary/10 border border-c-primary/30 rounded-lg px-3 py-2">
            <CheckCircle2 size={14} />
            {revertMsg}
          </div>
        )}

        {revertError && (
          <div className="flex items-center gap-2 text-c-danger text-xs bg-c-danger/10 border border-c-danger/30 rounded-lg px-3 py-2">
            <AlertCircle size={14} />
            {revertError}
          </div>
        )}

        <button
          onClick={handleRevertAll}
          disabled={reverting}
          className="self-start flex items-center gap-2 px-4 py-2.5 rounded-lg bg-c-danger/10 border border-c-danger text-c-danger text-sm font-semibold shadow-glow-danger hover:bg-c-danger/20 transition-colors disabled:opacity-50"
        >
          {reverting ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
          {reverting ? t('settings.emergency.reverting') : t('settings.emergency.revertButton')}
        </button>
      </div>

      <div className="bg-c-surface border border-c-border rounded-xl p-5 flex items-center gap-3">
        <Info size={16} className="text-slate-500" />
        <span className="text-sm text-slate-500">C-Optimizer v1.2.0 &middot; Electron + React + TailwindCSS</span>
      </div>
    </div>
  );
}

export default SettingsView;