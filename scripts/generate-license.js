const path = require('path');

// Resolve o caminho relativo à localização deste arquivo de script de forma absoluta
const { generateLicenseKey } = require(path.join(__dirname, '../src/main/utils/license'));

const quantity = Number(process.argv[2]) || 1;

console.log(`\nGerando ${quantity} chave(s) de licença válida(s) para o C-Optimizer:\n`);

for (let i = 0; i < quantity; i++) {
  console.log(generateLicenseKey());
}

console.log('');