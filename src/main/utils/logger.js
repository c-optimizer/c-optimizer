const log = require('electron-log');

// Rotação automática: ao atingir 5MB, electron-log renomeia o arquivo
// atual para main.old.log e começa um novo main.log — sem esforço extra.
log.transports.file.maxSize = 5 * 1024 * 1024;
log.transports.file.level = 'info';
log.transports.console.level = process.env.NODE_ENV === 'development' ? 'debug' : 'info';

/**
 * Caminho real do arquivo de log em disco. Por padrão, electron-log grava em
 * <userData>/logs/main.log — mesmo diretório base usado pelo electron-store
 * (já documentado: difere entre dev e app empacotado, conforme o nome do app).
 */
function getLogFilePath() {
  return log.transports.file.getFile().path;
}

module.exports = { log, getLogFilePath };