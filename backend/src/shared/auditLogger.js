const { query } = require('./db');

// Registra uma ação na trilha de auditoria. Falhas aqui nunca quebram o fluxo principal.
async function registrarAuditoria({ empresaId = null, usuarioId = null, categoria, acao, detalhe = null, ip = null }) {
  try {
    await query(
      `INSERT INTO auditoria (empresa_id, usuario_id, categoria, acao, detalhe, ip)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [empresaId, usuarioId, categoria, acao, detalhe ? JSON.stringify(detalhe) : null, ip]
    );
  } catch (err) {
    console.error('[auditoria] falha ao registrar:', err.message);
  }
}

module.exports = { registrarAuditoria };
