const cron = require('node-cron');
const { query } = require('../shared/db');

// Retenção curta de rastreamento = menos volume de banco = menos custo.
const RETENCAO_DIAS = Number(process.env.RASTREAMENTO_RETENCAO_DIAS) || 30;

// Agenda os jobs de manutenção. `origem` só identifica nos logs (api | worker).
function iniciarCron(origem = 'worker') {
  // Limpeza diária às 03:00: rastreamento antigo + refresh tokens vencidos/revogados.
  cron.schedule('0 3 * * *', async () => {
    try {
      const r1 = await query(
        `DELETE FROM rastreamento WHERE capturado_em < now() - make_interval(days => $1)`,
        [RETENCAO_DIAS]
      );
      const r2 = await query(`DELETE FROM refresh_tokens WHERE expira_em < now() OR revogado = TRUE`);
      console.log(`[cron:${origem}] rastreamento expirado=${r1.rowCount}, refresh limpos=${r2.rowCount}`);
    } catch (e) {
      console.error(`[cron:${origem}] erro na limpeza diária:`, e.message);
    }
  });
  // Keep-warm: a cada 4 min um SELECT trivial mantém o banco (Neon) acordado.
  // O Neon suspende a computação após ~5 min ociosos; quando isso acontece, a
  // 1a requisição "acorda" o banco e demora alguns segundos — tempo suficiente
  // para o app estourar o timeout e mostrar "sem conexão" sem motivo real.
  cron.schedule('*/4 * * * *', async () => {
    try { await query('SELECT 1'); }
    catch (e) { console.error(`[cron:${origem}] keep-warm falhou:`, e.message); }
  });

  // TODO: reentrega de webhooks com falha (quando o módulo de integrações entrar).
  console.log(`[cron:${origem}] agendado (retenção rastreamento=${RETENCAO_DIAS}d)`);
}

module.exports = { iniciarCron };
