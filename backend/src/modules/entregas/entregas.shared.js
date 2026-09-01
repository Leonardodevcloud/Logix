const { query } = require('../../shared/db');

// Gera o próximo protocolo sequencial (só número).
async function gerarProtocolo() {
  const { rows } = await query(`SELECT nextval('seq_protocolo_entrega') AS n`);
  return `${rows[0].n}`;
}

module.exports = { gerarProtocolo };
