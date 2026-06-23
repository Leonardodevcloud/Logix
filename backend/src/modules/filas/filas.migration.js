const { query } = require('../../shared/db');

// Filas opera sobre as tabelas de entregas/motoboys; aqui só garantimos índices úteis.
async function initFilasTables() {
  await query(`CREATE INDEX IF NOT EXISTS idx_entregas_fila ON entregas(empresa_id, status, criado_em)`);
  console.log('[filas] índices verificados');
}

module.exports = { initFilasTables };
