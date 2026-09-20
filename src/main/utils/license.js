// Alfabeto sem caracteres ambíguos (sem I, O, 0, 1) para evitar erro de digitação
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SEGMENT_LENGTH = 4;
const DATA_SEGMENTS = 2; // duas partes de dados: XXXX-XXXX
const CHECKSUM_LENGTH = 4;
const PREFIX = 'COPT';

/**
 * Remove espaços, hífens e força maiúsculas — aceita a chave em qualquer
 * formatação que o usuário digitar (com ou sem traços, minúsculo, etc.)
 */
function normalizeKey(rawKey) {
  return String(rawKey || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Calcula um checksum determinístico de 4 caracteres a partir dos 8
 * caracteres de dados. Qualquer alteração em um único caractere dos dados
 * muda o checksum resultante, então uma chave "inventada" quase certamente
 * vai falhar na validação.
 */
function computeChecksum(dataChars) {
  let hash = 0;

  for (let i = 0; i < dataChars.length; i++) {
    const charValue = ALPHABET.indexOf(dataChars[i]);
    if (charValue === -1) return null; // caractere fora do alfabeto permitido
    hash = (hash * 31 + charValue + i * 7) % 100000000;
  }

  let checksum = '';
  let remaining = hash;
  for (let i = 0; i < CHECKSUM_LENGTH; i++) {
    checksum += ALPHABET[remaining % ALPHABET.length];
    remaining = Math.floor(remaining / ALPHABET.length) + (i + 1) * 13;
  }

  return checksum;
}

/**
 * Formata uma string crua de caracteres em grupos separados por hífen:
 * "COPTAB12CD34EF56" -> "COPT-AB12-CD34-EF56"
 */
function formatLicenseKey(rawKey) {
  const normalized = normalizeKey(rawKey);
  const groups = [];
  for (let i = 0; i < normalized.length; i += SEGMENT_LENGTH) {
    groups.push(normalized.slice(i, i + SEGMENT_LENGTH));
  }
  return groups.join('-');
}

/**
 * Valida se uma chave tem o formato correto E se o checksum bate.
 * Não consulta nada externo — validação 100% offline.
 */
function isValidLicenseFormat(rawKey) {
  const normalized = normalizeKey(rawKey);
  const expectedLength = PREFIX.length + SEGMENT_LENGTH * (DATA_SEGMENTS + 1);

  if (normalized.length !== expectedLength) return false;
  if (!normalized.startsWith(PREFIX)) return false;

  const body = normalized.slice(PREFIX.length);
  const dataChars = body.slice(0, SEGMENT_LENGTH * DATA_SEGMENTS);
  const providedChecksum = body.slice(SEGMENT_LENGTH * DATA_SEGMENTS);

  const expectedChecksum = computeChecksum(dataChars);
  return expectedChecksum !== null && expectedChecksum === providedChecksum;
}

/**
 * Gera uma chave válida do zero (dados aleatórios + checksum correto).
 * Usado pelo script de geração de licenças (scripts/generate-license.js),
 * NÃO é chamado pela UI do app em nenhum momento.
 */
function generateLicenseKey() {
  let dataChars = '';
  for (let i = 0; i < SEGMENT_LENGTH * DATA_SEGMENTS; i++) {
    dataChars += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  const checksum = computeChecksum(dataChars);
  return formatLicenseKey(PREFIX + dataChars + checksum);
}

module.exports = {
  normalizeKey,
  formatLicenseKey,
  isValidLicenseFormat,
  generateLicenseKey
};