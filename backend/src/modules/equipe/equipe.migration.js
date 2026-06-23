const { query } = require('../../shared/db');
async function initEquipeTables() {
  await query(`CREATE INDEX IF NOT EXISTS idx_usuarios_empresa ON usuarios(empresa_id, perfil)`);
  console.log('[equipe] índices verificados');
}
module.exports = { initEquipeTables };
